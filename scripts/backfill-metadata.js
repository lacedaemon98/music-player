#!/usr/bin/env node
/**
 * Re-derive title/artist for songs added before the rule-based parser landed.
 *
 * The songs table never stored the raw YouTube title, so this refetches it
 * (oEmbed first, yt-dlp for anything oEmbed will not serve), stores it in
 * youtube_title/youtube_channel so future re-parses need no network, and
 * rewrites title/artist with services/song-parser.
 *
 *   node scripts/backfill-metadata.js              # dry run, writes nothing
 *   node scripts/backfill-metadata.js --apply      # actually update rows
 *   node scripts/backfill-metadata.js --limit 20   # work on a few rows first
 *
 * A JSON backup of every row it touches is written next to the database before
 * the first update, so a bad run can be undone.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const { sequelize, Song } = require('../models');
const { parseSongMetadata } = require('../services/song-parser');

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CONCURRENCY = 12;
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : null;

/** Fast path: YouTube's oEmbed endpoint returns the title and channel. */
async function fetchViaOEmbed(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`oembed HTTP ${res.status}`);
  const body = await res.json();
  return { title: body.title, channel: body.author_name || '' };
}

/** Slow path for videos oEmbed refuses (age-restricted, region-locked). */
async function fetchViaYtDlp(youtubeId) {
  const { stdout } = await execFileAsync(
    'yt-dlp',
    ['--dump-json', '--no-warnings', `https://www.youtube.com/watch?v=${youtubeId}`],
    { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }
  );
  const info = JSON.parse(stdout);
  return { title: info.title, channel: info.uploader || info.channel || '' };
}

async function fetchSource(song) {
  // Already stored by a previous run or by a recent add - no network needed.
  if (song.youtube_title) {
    return { title: song.youtube_title, channel: song.youtube_channel || '', cached: true };
  }
  if (!song.youtube_id) throw new Error('no youtube_id');
  try {
    return await fetchViaOEmbed(song.youtube_id);
  } catch (err) {
    return await fetchViaYtDlp(song.youtube_id);
  }
}

/** Run `worker` over `items`, at most CONCURRENCY at a time. */
async function mapPool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const songs = await Song.findAll({
    order: [['id', 'ASC']],
    ...(LIMIT ? { limit: LIMIT } : {}),
  });

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} - examining ${songs.length} songs\n`);

  const planned = [];
  const failed = [];

  await mapPool(songs, async (song) => {
    let source;
    try {
      source = await fetchSource(song);
    } catch (err) {
      failed.push({ id: song.id, title: song.title, reason: err.message });
      return;
    }

    const parsed = await parseSongMetadata(source.title, source.channel);
    const changed = parsed.title !== song.title || parsed.artist !== song.artist;
    planned.push({
      song,
      source,
      parsed,
      changed,
      before: { title: song.title, artist: song.artist },
    });
  });

  planned.sort((a, b) => a.song.id - b.song.id);
  const changes = planned.filter((p) => p.changed);

  for (const p of changes) {
    console.log(`#${p.song.id} ${p.source.title.slice(0, 70)}`);
    console.log(`   before: ${p.before.title}  |  ${p.before.artist}`);
    console.log(`   after : ${p.parsed.title}  |  ${p.parsed.artist}`);
  }

  console.log(`\n${planned.length} resolved, ${changes.length} would change, ${failed.length} failed`);
  for (const f of failed) console.log(`   FAILED #${f.id} ${f.title}: ${f.reason}`);

  if (!APPLY) {
    console.log('\nDry run - nothing written. Re-run with --apply to update.');
    return;
  }

  const backupPath = path.join(
    __dirname,
    '..',
    'data',
    `metadata-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(planned.map((p) => ({ id: p.song.id, ...p.before })), null, 2)
  );
  console.log(`\nBackup written to ${backupPath}`);

  let updated = 0;
  for (const p of planned) {
    // Always persist the raw values, even when the parse is unchanged, so a
    // later re-parse never has to hit the network again.
    p.song.youtube_title = p.source.title;
    p.song.youtube_channel = p.source.channel;
    if (p.changed) {
      p.song.title = p.parsed.title;
      p.song.artist = p.parsed.artist;
      updated += 1;
    }
    await p.song.save();
  }

  console.log(`Updated ${updated} songs, stored raw source for ${planned.length}.`);
}

main()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error('Backfill failed:', error);
    await sequelize.close();
    process.exit(1);
  });
