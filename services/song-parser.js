const logger = require('../utils/logger');
const knownArtists = require('./known-artists.json');

/**
 * Parses "Song Name - Artist" style YouTube titles into {title, artist}.
 *
 * The hard part is that the two halves come in either order: Vietnamese
 * uploads are usually "Song - Artist" while western ones are "Artist - Song".
 * Rather than guess from the text alone, we lean on the uploader's channel
 * name, which is the artist's own name for ~43% of the play history, and on a
 * vocabulary of artists harvested from that history (see known-artists.json).
 */

// Channels belonging to labels, TV shows and remix/lyric aggregators. Their
// name is never the artist, so we fall back to reading it out of the title.
const NON_ARTIST_CHANNELS = new Set(knownArtists.nonArtistChannels);

const ARTIST_BY_KEY = new Map(
  knownArtists.artists
    .filter((name) => !NON_ARTIST_CHANNELS.has(artistKey(name)))
    .map((name) => [artistKey(name), name])
);

// Splits "A x B", "A & B", "A feat. B" - the \s around x matters, otherwise the
// letter inside words such as "CM1X REMIX" splits the name apart.
const COLLAB_SPLIT = /\s+[x×]\s+|\s*[&,+]\s*|\s*\b(?:feat|ft|featuring|with)\b\.?\s*/i;

// "BLACKPINK 'Kill This Love'", "Shakira 'Zoo (from Zootopia 2)'" - the K-pop
// and western label style where the song sits in quotes after the performer.
// A trailing "(ft. …)" after the closing quote still belongs to the credits.
const QUOTED_SONG = /^(.{2,45}?)\s*['"“”‘’]\s*(.+?)\s*['"“”‘’]\s*((?:[([].*?[)\]])?)\s*$/;

// Words that mark a channel as a label/aggregator rather than a performer.
const CHANNEL_NOISE = /\s*[-–|/]?\s*\b(official|officiel|vevo|topic|music|musik|entertainment|ent|channel|media|records?|recordings?|labels?|studios?|tv|audio|lyrics?|remix|network|group|производство)\b\.?\s*$/i;
const CHANNEL_NOISE_PREFIX = /^\s*official\s*/i;

// Bracketed junk: [Official MV], (Official Video), 【MV】, [Vietsub], (Lyrics)…
const BRACKET_NOISE = /[[(【（「]\s*[^)\]】）」]*\b(official|vietsub|engsub|kara|karaoke|lyrics?|lyric\s*video|audio|m\/?v|music\s*video|visual|visualizer|performance|dance\s*ver|colou?r\s*coded|han\/rom\/eng|pinyin|full\s*hd|hd|4k|fhd|teaser|trailer|reaction|ost|original|prod\.?\s*by)\b[^)\]】）」]*\s*[)\]】）」]/gi;

// The same junk when it is not bracketed at all.
const BARE_NOISE = /\b(official\s*(music\s*)?(video|audio|mv|m\/v|lyric\s*video|visualizer)|music\s*video|lyric\s*video|colou?r\s*coded\s*lyrics?|official|m\/v|mv\s*fanmade|fanmade|vietsub|engsub|4k\s*remaster(ed)?|audio\s*chính\s*thức)\b/gi;

// A whole "| … |" segment that is only packaging, not a song or an artist.
const SEGMENT_IS_NOISE = /^(?:\s*(?:official|music|video|audio|mv|m\/v|lyrics?|lyric\s*video|visualizer|vietsub|engsub|hd|fhd|4k|teaser|trailer|full|ost|cover|reaction|track\s*no\.?\s*\d+|track\s*\d+|ep\.?\s*\d+|part\s*\d+|\d{4}|fanmade|mv\s*fanmade|colou?r\s*coded(?:\s*lyrics?)?(?:\s*\([^)]*\))?|prod\.?\s*by.*|rap\s*nhà\s*làm|nhạc\s*trẻ.*|audio\s*chính\s*thức)\s*)+$/i;

const FEATURE_MARKER = /\b(ft|feat|featuring|with|prod)\b\.?/i;
const SEPARATORS = /\s+[-–—|｜/]{1,2}\s+|\s*[|｜]\s*|\s+[-–—]\s+/;

const VIETNAMESE_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/**
 * Collapse a name to a comparable key: lowercase, letters and digits only, and
 * without accents so that a channel called "Mason Nguyễn" still matches the
 * "Mason Nguyen" written in the title.
 */
function artistKey(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Strip "Official", "VEVO", "- Topic" etc. off a channel name. */
function cleanChannelName(channel) {
  let name = String(channel || '').replace(CHANNEL_NOISE_PREFIX, '');
  for (let i = 0; i < 4; i += 1) {
    const stripped = name.replace(CHANNEL_NOISE, '').replace(/[\s\-–|/]+$/, '').trim();
    if (stripped === name) break;
    name = stripped;
  }
  return name.trim();
}

/**
 * The artist name the channel implies, or null when the channel belongs to a
 * label/show and therefore tells us nothing about who performed the song.
 */
function artistFromChannel(channel) {
  const name = cleanChannelName(channel);
  if (!name || name.length < 2) return null;
  if (NON_ARTIST_CHANNELS.has(artistKey(name))) return null;
  return ARTIST_BY_KEY.get(artistKey(name)) || name;
}

/**
 * Last resort when nothing in the title names a performer. A label or TV show
 * name is still more use on screen than "Unknown Artist"; the block list only
 * stops it outranking a real artist, not from filling an otherwise empty field.
 */
function fallbackArtist(channel) {
  return cleanChannelName(channel) || 'Unknown Artist';
}

// Packaging that occasionally survives into the artist slot when a title has no
// real performer in it, e.g. `… | MV Bài hát Chủ đề "Anh Trai Vượt Ngàn…"`.
const NOT_A_NAME = /\b(mv|music\s*video|bài\s*hát|chủ\s*đề|nhạc\s*phim|ost|official|lyrics?|teaser|trailer|tập\s*\d+|ep\.?\s*\d+)\b/i;

/** Reject strings that are plainly packaging rather than a performer. */
function looksLikeArtistName(name) {
  const value = String(name || '').trim();
  if (!value || value.length > 60) return false;
  return !NOT_A_NAME.test(value);
}

/** Remove promo packaging from a raw YouTube title. */
function stripNoise(text) {
  return String(text || '')
    .replace(BRACKET_NOISE, ' ')
    .replace(/[【（[][^)\]】）]{0,40}[)\]】）]\s*$/g, (m) => (FEATURE_MARKER.test(m) ? m : ' '))
    .replace(BARE_NOISE, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/[“”"'']{2,}/g, ' ')
    .replace(/\s*[|｜]\s*$/, '')
    // Packaging words that trail the real title: "… Lyrics Video", "… MV HD".
    .replace(/(?:\s*\b(?:mv|m\/v|hd|fhd|4k|video\s*clip|lyrics?|lyrics?\s*video|audio)\b\.?)+\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Trim a performer string that has swallowed trailing lyric-teaser text, which
 * Vietnamese uploads often append with no separator at all.
 */
function tidyArtist(artist) {
  let name = String(artist || '').replace(/\s*[([]\s*(?:from|từ|out\s*now)\b[^)\]]*[)\]]\s*$/i, '').trim();
  if (name.length <= 45) return name;

  // Keep the longest leading run that is still a name we recognise.
  const words = name.split(/\s+/);
  for (let take = Math.min(words.length, 8); take >= 1; take -= 1) {
    const candidate = words.slice(0, take).join(' ').replace(/[(,;:]+$/, '').trim();
    if (ARTIST_BY_KEY.has(artistKey(candidate))) return ARTIST_BY_KEY.get(artistKey(candidate));
  }
  // Otherwise cut at the parenthetical that starts the teaser.
  const cut = name.match(/^(.{4,45}?)\s*[([]/);
  if (cut) return cut[1].trim();
  return name;
}

/** Split on separators and drop the segments that are pure packaging. */
function meaningfulSegments(text) {
  return text
    .split(SEPARATORS)
    // Quotes are load-bearing here ("BLACKPINK 'Kill This Love'"), so they are
    // only trimmed off the final title and artist, not while splitting.
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !SEGMENT_IS_NOISE.test(part))
    // A label's own name ("| Lyritix") is packaging, not a song or an artist.
    .filter((part) => !NON_ARTIST_CHANNELS.has(artistKey(part)));
}

/**
 * Pull a trailing "ft. X" off the song title and onto the performer, so
 * "Ăn Gì Đây ft. Hòa Minzy" by MR.T becomes "Ăn Gì Đây" by "MR.T ft. Hòa Minzy".
 */
function moveFeatures(title, artist) {
  const match = title.match(/^(.+?)\s*[([]?\s*\b(?:ft|feat|featuring|with)\b\.?\s+(.+?)\s*[)\]]?$/i);
  if (!match) return { title, artist };

  const [, bareTitle, guests] = match;
  if (!bareTitle || bareTitle.length < 2) return { title, artist };
  // Already credited - just drop the duplicate from the title.
  if (artistKey(artist).includes(artistKey(guests))) return { title: bareTitle, artist };
  return { title: bareTitle, artist: `${artist} ft. ${guests}` };
}

/** Does this segment name the given artist? */
function segmentMatchesArtist(segment, artist) {
  if (!artist) return false;
  const seg = artistKey(segment);
  const art = artistKey(artist);
  if (!seg || !art) return false;
  if (seg === art) return true;
  // "ROSÉ & Bruno Mars" credits ROSÉ, but "She Neva Knows (CM1X REMIX)" does not
  // credit CM1X - so compare whole collaborator names rather than substrings.
  return segment
    .split(COLLAB_SPLIT)
    .some((part) => artistKey(part) === art);
}

/**
 * True when the text names an artist we know, allowing for the bilingual
 * "정국 (Jung Kook)" / "BTS (방탄소년단)" form where either half may be the one
 * we have on file.
 */
function namesAnArtist(text) {
  if (ARTIST_BY_KEY.has(artistKey(text))) return true;
  const outside = text.replace(/[(（].*?[)）]/g, ' ').trim();
  if (outside && ARTIST_BY_KEY.has(artistKey(outside))) return true;
  return (text.match(/[(（](.*?)[)）]/g) || [])
    .some((inner) => ARTIST_BY_KEY.has(artistKey(inner.replace(/[()（）]/g, ''))));
}

function isKnownArtist(segment) {
  const key = artistKey(segment);
  if (ARTIST_BY_KEY.has(key)) return true;
  // "Xesi x Masew x Nhatnguyen" - every collaborator is a known name.
  const parts = segment.split(COLLAB_SPLIT).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => ARTIST_BY_KEY.has(artistKey(part)));
}

/** Drop wrapping quotes left over from titles like ''CHIẾC KHĂN GIÓ RÉT''. */
function trimQuotes(text) {
  return String(text || '').replace(/^[\s'"“”‘’]+|[\s'"“”‘’]+$/g, '').trim();
}

/** Title-case a shouty string, leaving stylised names alone. */
function normalizeProperCase(text) {
  if (!text) return text;
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return text;
  const upper = text.replace(/[^\p{Lu}]/gu, '');
  if (upper.length / letters.length < 0.7) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s(["'\-–/])(\p{L})/gu, (_, before, ch) => before + ch.toUpperCase());
}

/**
 * Keep an artist's own capitalisation (M-TP, MCK, buitruonglinh, HIEUTHUHAI)
 * whenever we have seen the name before; only tidy up unknown shouty names.
 */
function canonicalizeArtist(name) {
  if (!name) return name;
  const known = ARTIST_BY_KEY.get(artistKey(name));
  // The vocabulary is harvested from channel handles, which are often run
  // together ("ShayneWardVEVO"). Keep whichever spelling actually has spaces.
  if (known) return /\s/.test(name) && !/\s/.test(known) ? name : known;

  // "BTS (방탄소년단)" / "정국 (Jung Kook)" - prefer the half we have on file.
  const outside = name.replace(/[(（].*?[)）]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (outside && ARTIST_BY_KEY.has(artistKey(outside))) return ARTIST_BY_KEY.get(artistKey(outside));
  for (const inner of name.match(/[(（](.*?)[)）]/g) || []) {
    const hit = ARTIST_BY_KEY.get(artistKey(inner.replace(/[()（）]/g, '')));
    if (hit) return hit;
  }

  // Rebuild collaborations from known spellings: "XESI X MASEW" -> "Xesi x Masew".
  const parts = name.split(new RegExp(`(${COLLAB_SPLIT.source})`, 'i'));
  if (parts.length > 1) {
    let touched = false;
    const rebuilt = parts.map((part, i) => {
      if (i % 2 === 1) return part;
      const hit = ARTIST_BY_KEY.get(artistKey(part));
      if (hit) touched = true;
      return hit || normalizeProperCase(part);
    });
    if (touched) return rebuilt.join('').replace(/\s{2,}/g, ' ').trim();
  }
  return normalizeProperCase(name);
}

/**
 * Work out which half of the title is the artist.
 * Returns {artistIndex, titleIndex} or null when the segments give no clue.
 */
function chooseSides(segments, channelArtist) {
  // 1. The uploader's own name appears in one of the halves - the strongest
  //    signal we have, and it works for both title orders.
  const byChannel = segments.findIndex((seg) => segmentMatchesArtist(seg, channelArtist));
  // 2. Otherwise, a half that is entirely made of names we have seen before.
  const byVocab = segments.findIndex((seg) => isKnownArtist(seg));
  // 3. Otherwise, the half carrying "ft." / "feat." is the performer list.
  const byFeature = segments.findIndex((seg) => FEATURE_MARKER.test(seg));

  let artistIndex = -1;
  if (byChannel !== -1) artistIndex = byChannel;
  else if (byVocab !== -1) artistIndex = byVocab;
  else if (byFeature !== -1) artistIndex = byFeature;

  if (artistIndex === -1) return null;

  // The title is the first remaining segment that is not itself an artist name,
  // so "JACK - J97 | TRẠM DỪNG CHÂN" yields the song rather than the other alias.
  let titleIndex = segments.findIndex((seg, i) => i !== artistIndex && !isKnownArtist(seg));
  if (titleIndex === -1) {
    titleIndex = segments.findIndex((_, i) => i !== artistIndex);
  }
  if (titleIndex === -1) return null;

  return { artistIndex, titleIndex };
}

/**
 * Parse a YouTube video title into song title and artist.
 *
 * @param {string} youtubeTitle raw video title
 * @param {string} uploaderName channel name, used to disambiguate the order
 */
function resolveParts(youtubeTitle, uploaderName) {
  const channelArtist = artistFromChannel(uploaderName);
  const cleaned = stripNoise(youtubeTitle);
  let segments = meaningfulSegments(cleaned);

  // "BLACKPINK 'Kill This Love'" - the quotes already tell us which half is
  // which, as long as the part in front really names an artist.
  if (segments.length <= 2) {
    const quoted = (segments.length === 1 ? segments[0] : cleaned).match(QUOTED_SONG);
    if (quoted) {
      const lead = quoted[1].replace(/[\s\-–—|]+$/, '');
      const song = quoted[3] ? `${quoted[2]} ${quoted[3]}` : quoted[2];
      // "PERFORMER 'Song Name'" is reliably artist-first, which is how the K-pop
      // labels title everything, so the lead is the artist even when it is a
      // name we have never seen (TXT, NCT 127, SUPER JUNIOR-D&E).
      //
      // A lead spanning a separator is not a performer though - it is the rest
      // of the title, as in `Hỏa Ca (…) | MV Bài hát Chủ đề "Anh Trai …"`.
      const leadIsName = lead && !/[|｜]/.test(lead) && !SEGMENT_IS_NOISE.test(lead);
      if (leadIsName) {
        const moved = moveFeatures(song, canonicalizeArtist(lead));
        return { title: normalizeProperCase(moved.title), artist: moved.artist };
      }
    }
  }

  if (segments.length === 0) {
    return {
      title: normalizeProperCase(stripNoise(youtubeTitle)) || String(youtubeTitle || '').trim(),
      artist: channelArtist ? canonicalizeArtist(channelArtist) : fallbackArtist(uploaderName),
    };
  }

  // Only one half: the channel is our only source for the performer.
  if (segments.length === 1) {
    return {
      title: normalizeProperCase(segments[0]),
      artist: channelArtist ? canonicalizeArtist(channelArtist) : fallbackArtist(uploaderName),
    };
  }

  const sides = chooseSides(segments, channelArtist);
  if (sides) {
    const moved = moveFeatures(segments[sides.titleIndex], canonicalizeArtist(segments[sides.artistIndex]));
    return { title: normalizeProperCase(moved.title), artist: moved.artist };
  }

  // Nothing identified either half. Vietnamese uploads overwhelmingly put the
  // song first, western ones put the artist first.
  const [first, second] = segments;
  const vietnamese = VIETNAMESE_CHARS.test(cleaned);
  const rawTitle = vietnamese ? first : second;
  const rawArtist = vietnamese ? second : first;
  const moved = moveFeatures(
    rawTitle,
    canonicalizeArtist(rawArtist) || (channelArtist ? canonicalizeArtist(channelArtist) : fallbackArtist(uploaderName))
  );

  return { title: normalizeProperCase(moved.title), artist: moved.artist };
}

function parseSongTitle(youtubeTitle, uploaderName) {
  const parts = resolveParts(youtubeTitle, uploaderName);
  const artist = tidyArtist(trimQuotes(parts.artist));
  return {
    title: trimQuotes(parts.title),
    artist: looksLikeArtistName(artist) ? artist : fallbackArtist(uploaderName),
  };
}

/**
 * Parse song title and artist from a YouTube video title.
 * Kept async because callers await it.
 */
async function parseSongMetadata(youtubeTitle, uploaderName) {
  try {
    const result = parseSongTitle(youtubeTitle, uploaderName);
    const title = trimQuotes(result.title) || String(youtubeTitle || '').trim();
    const artist = trimQuotes(result.artist) || 'Unknown Artist';

    logger.info(`[SongParser] "${youtubeTitle}" → Title: "${title}", Artist: "${artist}"`);
    return { title, artist };
  } catch (error) {
    logger.error('[SongParser] Error parsing:', error);
    return {
      title: String(youtubeTitle || '').trim(),
      artist: uploaderName || 'Unknown Artist',
    };
  }
}

module.exports = { parseSongMetadata, parseSongTitle, normalizeProperCase };
