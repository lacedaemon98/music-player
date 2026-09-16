/**
 * Regression tests for services/song-parser.js
 *
 * Every case below is a real video from the play history. Run with `npm test`.
 */
const test = require('node:test');
const assert = require('node:assert');
const { parseSongTitle } = require('../services/song-parser');

// [raw YouTube title, channel, expected title, expected artist]
const CASES = [
  // Vietnamese uploads put the song first...
  ['Không Thấy Ngày Về - Lã Phong Lâm (Official MV)', 'Lã Phong Lâm', 'Không Thấy Ngày Về', 'Lã Phong Lâm'],
  ['CHÚ ĐẠI BI (VÔ LƯỢNG) - Masew, Khoi Vu', 'Masew', 'Chú Đại Bi (Vô Lượng)', 'Masew, Khoi Vu'],

  // ...western ones put the artist first. The channel tells the two apart.
  ['Shayne Ward - Until You (Audio)', 'ShayneWardVEVO', 'Until You', 'Shayne Ward'],
  ['VSTRA - Ai Ngoài Anh (Official Audio)', 'VSTRA', 'Ai Ngoài Anh', 'VSTRA'],
  ['ROSÉ & Bruno Mars - APT. (Official Music Video)', 'ROSÉ', 'Apt.', 'ROSÉ & Bruno Mars'],

  // "PERFORMER 'Song'" - the label style, artist-first even for unseen names.
  ["BLACKPINK - 'Kill This Love' M/V", 'BLACKPINK', 'Kill This Love', 'BLACKPINK'],
  ["BTS (방탄소년단) 'Dynamite' Official MV", 'HYBE LABELS', 'Dynamite', 'BTS'],
  ["TXT (투모로우바이투게더) 'Deja Vu' Official MV", 'HYBE LABELS', 'Deja Vu', 'TXT (투모로우바이투게더)'],

  // Featured performers belong with the artist, not in the song name.
  ['Mr.T - Ăn Gì Đây ft. Hòa Minzy | Official MV (2015)', 'MR.T Official', 'Ăn Gì Đây', 'MR.T ft. Hòa Minzy'],
  ["CONGB 'NHỚ EM 8 LẦN' (ft. Mason Nguyễn & TEZ) | Official MV", 'CONGB Official', 'Nhớ Em 8 Lần', 'CONGB ft. Mason Nguyễn & TEZ'],

  // A label/aggregator channel must never become the artist.
  ['Simp Gái 808 | Low G | Rap Nhà Làm', 'Rap Nhà Làm', 'Simp Gái 808', 'Low G'],
  ['CHƯA QUÊN NGƯỜI YÊU CŨ | HÀ NHI X HỨA KIM TUYỀN | OFFICIAL MUSIC VIDEO', 'Hà Nhi Official', 'Chưa Quên Người Yêu Cũ', 'Hà Nhi X Hứa Kim Tuyền'],

  // No separator at all: the channel is the only source for the performer.
  ['Cơn Mưa Ngang Qua', 'Sơn Tùng M-TP - Topic', 'Cơn Mưa Ngang Qua', 'Sơn Tùng M-TP'],

  // "CM1X"/"REMIX" contain an x - splitting on it used to swap the two halves.
  ['She Neva Knows (CM1X REMIX) - JustaTee', 'CM1X Official', 'She Neva Knows (CM1X REMIX)', 'JustaTee'],

  // Channel spelled with diacritics, title without.
  ['Mason Nguyen - imissu2 [feat. buitruonglinh, CONGB] | Official Audio', 'Mason Nguyễn', 'imissu2', 'Mason Nguyễn ft. buitruonglinh, CONGB'],

  // Stylised capitalisation survives; shouty Vietnamese titles get tidied.
  ['VŨ THUỲ LINH – TRỘM VÍA | OFFICIAL MUSIC VIDEO | Em Là Cô Dâu Việt Nam', 'Vũ Thuỳ Linh Official', 'Trộm Vía', 'Vũ Thuỳ Linh'],
  ['PSY - GANGNAM STYLE(강남스타일) M/V', 'officialpsy', 'Gangnam Style(강남스타일)', 'PSY'],
];

test('parses real YouTube titles into title + artist', () => {
  const failures = [];
  for (const [raw, channel, wantTitle, wantArtist] of CASES) {
    const got = parseSongTitle(raw, channel);
    if (got.title !== wantTitle || got.artist !== wantArtist) {
      failures.push(`${raw}\n    want: ${wantTitle} | ${wantArtist}\n    got : ${got.title} | ${got.artist}`);
    }
  }
  assert.strictEqual(failures.length, 0, `\n  ${failures.join('\n  ')}\n`);
});

test('never returns an empty title or artist', () => {
  for (const [raw, channel] of CASES) {
    const got = parseSongTitle(raw, channel);
    assert.ok(got.title && got.title.trim(), `empty title for ${raw}`);
    assert.ok(got.artist && got.artist.trim(), `empty artist for ${raw}`);
  }
});

test('survives junk input', () => {
  for (const raw of ['', '   ', '---', '|||', '(Official Video)', '🎵']) {
    assert.doesNotThrow(() => parseSongTitle(raw, ''));
  }
});
