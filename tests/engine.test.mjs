/* Tests du moteur — exécuter avec :  node --test tests/  */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toCamelot, toClassic, CAMELOT_CODES } from '../assets/js/lib/camelot.js';
import { norm, baseTitle, variantTags, dice, sim, buildIndex, matchOne, matchPlaylist, summarize } from '../assets/js/lib/matching.js';
import { parseCSV, tracksFromCSV, tracksFromText, tracksFromM3U, detectDelimiter, parseBitrate, quality } from '../assets/js/lib/parsers/index.js';
import { buildCrate, seratoPath, crateFilename } from '../assets/js/lib/exporters/serato.js';
import { parseSeratoBinary, looksLikeSerato } from '../assets/js/lib/parsers/serato.js';

/* ============================== Camelot ================================= */
test('camelot : conversions classiques', () => {
  assert.equal(toCamelot('Am'), '8A');
  assert.equal(toCamelot('A minor'), '8A');
  assert.equal(toCamelot('C'), '8B');
  assert.equal(toCamelot('F#m'), '11A');
  assert.equal(toCamelot('Gbm'), '11A');
  assert.equal(toCamelot('Bb'), '6B');
  assert.equal(toCamelot('A#'), '6B');
  assert.equal(toCamelot('12A'), '12A');
  assert.equal(toCamelot('7 A'), '7A');
  assert.equal(toCamelot('8A - 128'), '8A');
  assert.equal(toCamelot('bidon'), null);
  assert.equal(toCamelot(''), null);
});

test('camelot : notation Open Key', () => {
  assert.equal(toCamelot('1d'), '8B');   // Do majeur
  assert.equal(toCamelot('1m'), '8A');   // La mineur
  assert.equal(toCamelot('6d'), '1B');   // Si majeur
  assert.equal(toCamelot('12d'), '7B');  // Fa majeur
});

test('camelot : aller-retour sur les 24 tonalités', () => {
  for (const c of CAMELOT_CODES) {
    const classic = toClassic(c);
    assert.ok(classic, `pas de notation classique pour ${c}`);
    assert.equal(toCamelot(classic), c, `${c} -> ${classic} -> ${toCamelot(classic)}`);
  }
});

/* =============================== Matching =============================== */
test('normalisation', () => {
  assert.equal(norm('Éléonore  —  Là-Bas'), 'eleonore bas');
  assert.equal(norm('Song (feat. X)'), 'song x');
  assert.equal(baseTitle('Track (Extended Mix)'), 'track');
  assert.equal(baseTitle('Track (DJ Foo Remix)'), 'track dj foo');
  assert.ok(variantTags('Track (Extended Mix)').has('extended'));
  assert.ok(!variantTags('Track').size);
});

test('similarité', () => {
  assert.equal(dice('abc', 'abc'), 1);
  assert.ok(sim('night shift', 'night shift') === 1);
  assert.ok(sim('night shift', 'nite shift') > 0.55, 'tolérance aux fautes de frappe');
  assert.ok(sim('night shift', 'totalement autre') < 0.35);
});

test('matchOne : trouve la bonne version', () => {
  const lib = [
    { id: '1', title: 'Night Shift', artist: 'Kobra Lane', duration: 331, playCount: 5 },
    { id: '2', title: 'Night Shift (Extended Mix)', artist: 'Kobra Lane', duration: 400, playCount: 40 },
    { id: '3', title: 'Day Shift', artist: 'Autre Gars', duration: 200, playCount: 0 },
  ];
  const index = buildIndex(lib);

  const exact = matchOne({ title: 'Night Shift', artist: 'Kobra Lane', duration: 331 }, index);
  assert.equal(exact.status, 'matched');
  assert.equal(exact.candidates[0].track.id, '1');

  const ext = matchOne({ title: 'Night Shift (Extended Mix)', artist: 'Kobra Lane' }, index);
  assert.equal(ext.candidates[0].track.id, '2');

  const none = matchOne({ title: 'Morceau Totalement Inconnu', artist: 'Personne' }, index);
  assert.equal(none.status, 'missing');
});

test('matchPlaylist : compteurs et dédoublonnage', async () => {
  const lib = [
    { id: '1', title: 'Alpha', artist: 'Un', duration: 200 },
    { id: '2', title: 'Beta', artist: 'Deux', duration: 200 },
  ];
  const entries = [
    { title: 'Alpha', artist: 'Un', duration: 200 },
    { title: 'Alpha', artist: 'Un', duration: 200 },     // doublon
    { title: 'Beta', artist: 'Deux', duration: 200 },
    { title: 'Introuvable', artist: 'Zzz' },
  ];
  const rows = await matchPlaylist(entries, lib, { dedupe: true });
  assert.equal(rows.length, 3, 'le doublon est supprimé');

  const all = await matchPlaylist(entries, lib, { dedupe: false });
  assert.equal(all.length, 4);

  const s = summarize(rows);
  assert.equal(s.total, 3);
  assert.equal(s.missing, 1);
  assert.equal(s.matched + s.review, 2);
});

/* =============================== Parsers ================================ */
test('CSV : guillemets, séparateurs, en-têtes', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  const rows = parseCSV('a,b\n"x, y",2\n"guillemet ""double""",3');
  assert.deepEqual(rows[1], ['x, y', '2']);
  assert.deepEqual(rows[2], ['guillemet "double"', '3']);

  const tracks = tracksFromCSV('Track Name,Artist Name(s),Tempo,Key,Duration (ms)\nNight Shift,Kobra Lane,124,8A,331000');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, 'Night Shift');
  assert.equal(tracks[0].bpm, 124);
  assert.equal(tracks[0].camelot, '8A');
  assert.equal(tracks[0].duration, 331);
});

test('texte : formats de ligne', () => {
  const t = tracksFromText([
    'Kobra Lane - Night Shift',
    '2. Odalie – Last Call [3:46]',
    'Amaury V — Skyline',
    '',
    '----',
  ].join('\n'));
  assert.equal(t.length, 3);
  assert.equal(t[0].artist, 'Kobra Lane');
  assert.equal(t[1].title, 'Last Call');
  assert.equal(t[1].duration, 226);
  assert.equal(t[2].title, 'Skyline');

  const rev = tracksFromText('Night Shift - Kobra Lane', { order: 'title-first' });
  assert.equal(rev[0].title, 'Night Shift');
  assert.equal(rev[0].artist, 'Kobra Lane');
});

test('M3U', () => {
  const t = tracksFromM3U('#EXTM3U\n#EXTINF:331,Kobra Lane - Night Shift\n/Music/night.mp3\n');
  assert.equal(t.length, 1);
  assert.equal(t[0].artist, 'Kobra Lane');
  assert.equal(t[0].duration, 331);
  assert.equal(t[0].location, '/Music/night.mp3');
});

/* ============================ Débit / qualité =========================== */
test('débit : formats acceptés', () => {
  assert.equal(parseBitrate('320'), 320);
  assert.equal(parseBitrate('320.0kbps'), 320);
  assert.equal(parseBitrate(320000), 320);       // bits/s
  assert.equal(parseBitrate('1411'), 1411);      // WAV
  assert.equal(parseBitrate(''), null);
  assert.equal(parseBitrate('n/a'), null);
});

test('qualité : niveaux et classement', () => {
  assert.equal(quality({ bitrate: 320, format: 'mp3' }).level, 'high');
  assert.equal(quality({ bitrate: 256, format: 'mp3' }).level, 'ok');
  assert.equal(quality({ bitrate: 192, format: 'mp3' }).level, 'low');
  assert.equal(quality({ bitrate: 128, format: 'mp3' }).level, 'bad');
  assert.equal(quality({ format: 'wav' }).level, 'lossless');
  assert.equal(quality({}).level, 'unknown');
  assert.ok(quality({ format: 'flac' }).rank > quality({ bitrate: 320 }).rank);
});

test('CSV Exportify (export de playlist Spotify) lu tel quel', () => {
  const csv = [
    '"Track URI","Track Name","Artist Name(s)","Album Name","Track Duration (ms)","Added At"',
    '"spotify:track:abc","Voyage Voyage","Desireless","François","231000","2024-01-01"',
    '"spotify:track:def","Hold On, I\'m Comin\'","Sam & Dave","Hold On","154000","2024-01-02"',
  ].join('\n');
  const t = tracksFromCSV(csv);
  assert.equal(t.length, 2);
  assert.equal(t[0].title, 'Voyage Voyage');
  assert.equal(t[0].artist, 'Desireless');
  assert.equal(t[0].duration, 231);
  assert.equal(t[1].title, "Hold On, I'm Comin'", 'les virgules et apostrophes dans un champ cité');
});

test('débit lu depuis un CSV', () => {
  const t = tracksFromCSV('Title,Artist,Bitrate,Format\nX,Y,320,mp3');
  assert.equal(t[0].bitrate, 320);
  assert.equal(t[0].format, 'mp3');
});

test('à qualité égale, le meilleur débit remonte en premier', () => {
  const lib = [
    { id: 'lo', title: 'Alpha', artist: 'Un', bitrate: 128 },
    { id: 'hi', title: 'Alpha', artist: 'Un', bitrate: 320 },
  ];
  const res = matchOne({ title: 'Alpha', artist: 'Un' }, buildIndex(lib));
  assert.equal(res.candidates[0].track.id, 'hi');
});

/* ============================ Crate Serato ============================== */
test('chemins Serato : relatifs au volume', () => {
  assert.equal(seratoPath('/Users/kevin/Music/x.mp3'), 'Users/kevin/Music/x.mp3');
  assert.equal(seratoPath('C:\\Music\\x.mp3'), 'Music/x.mp3');
  assert.equal(seratoPath('/Volumes/DJ SSD/Tracks/x.mp3'), 'Tracks/x.mp3');
  assert.equal(seratoPath('file:///Users/kevin/Music/a%20b.mp3'), 'Users/kevin/Music/a b.mp3');
  assert.equal(seratoPath(''), null);
});

test('crate écrite puis relue à l\'identique', async () => {
  const tracks = [
    { title: 'Alpha', artist: 'Un', location: '/Users/kevin/Music/Un - Alpha.mp3' },
    { title: 'Bêta', artist: 'Deux', location: '/Users/kevin/Music/Deux - Bêta.mp3' },
    { title: 'Sans fichier', artist: 'Trois', location: '' },
  ];
  const { blob, included, skipped } = buildCrate(tracks);
  assert.equal(included.length, 2);
  assert.equal(skipped.length, 1, 'le morceau sans chemin est écarté');

  const buf = await blob.arrayBuffer();
  assert.ok(looksLikeSerato(buf), 'l\'en-tête doit être reconnu comme du Serato');

  const back = parseSeratoBinary(buf);
  assert.equal(back.length, 2);
  assert.equal(back[0].location, 'Users/kevin/Music/Un - Alpha.mp3');
  assert.equal(back[0].artist, 'Un');
  assert.equal(back[0].title, 'Alpha');
  assert.equal(back[1].title, 'Bêta', 'les accents survivent à l\'UTF-16');
});

test('nom de fichier de crate assaini en ASCII', () => {
  // Les navigateurs remplacent un nom non-ASCII par « download » : on translittère.
  assert.equal(crateFilename('Mariage 12/09 : soirée'), 'Mariage 12 09 soiree.crate');
  assert.equal(crateFilename('K7 — Été à Ibiza'), 'K7 - Ete a Ibiza.crate');
  assert.equal(crateFilename('Sous%%crate'), 'Sous crate.crate');
  assert.equal(crateFilename(''), 'K7.crate');
  assert.ok(/^[\x20-\x7E]+$/.test(crateFilename('Café — Noël 🎧')), 'le résultat doit être 100 % ASCII');
});

/* ========================= Liens de playlist ============================ */
import { detectPlaylist, isShortLink } from '../assets/js/lib/playlist.js';

test('détection des URL de playlist', () => {
  assert.deepEqual(detectPlaylist('https://www.deezer.com/fr/playlist/1743878062?utm_source=x'),
    { provider: 'deezer', id: '1743878062' });
  assert.deepEqual(detectPlaylist('https://deezer.com/playlist/123'), { provider: 'deezer', id: '123' });
  assert.equal(detectPlaylist('https://www.deezer.com/fr/album/456').kind, 'album');

  assert.equal(detectPlaylist('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M').provider, 'spotify');
  assert.equal(detectPlaylist('https://open.spotify.com/intl-fr/playlist/abc123').id, 'abc123');
  assert.equal(detectPlaylist('spotify:playlist:abc123').id, 'abc123');

  assert.equal(detectPlaylist('https://exemple.com/truc'), null);
  assert.equal(detectPlaylist(''), null);
});

test('liens de partage courts reconnus', () => {
  assert.ok(isShortLink('https://link.deezer.com/s/33Xw8wHpxBdvDuousTkGm'));
  assert.ok(isShortLink('https://spotify.link/abcdef'));
  assert.ok(isShortLink('https://deezer.page.link/xyz'));
  assert.ok(!isShortLink('https://www.deezer.com/fr/playlist/123'));
  assert.equal(detectPlaylist('https://link.deezer.com/s/33Xw8wHpxBdvDuousTkGm').provider, 'short');
});

test('fonction Netlify : suit la redirection et filtre les domaines', async () => {
  const { handler } = await import('../netlify/functions/resolve.mjs');
  const real = globalThis.fetch;
  const chain = {
    'https://link.deezer.com/s/abc': { status: 302, location: 'https://www.deezer.com/fr/playlist/1743878062?utm=1' },
    'https://www.deezer.com/fr/playlist/1743878062?utm=1': { status: 200, location: null },
  };
  globalThis.fetch = async (url) => {
    const r = chain[url];
    if (!r) throw new Error('URL inattendue : ' + url);
    return { status: r.status, headers: { get: (k) => (k === 'location' ? r.location : null) } };
  };
  try {
    const ok = await handler({ httpMethod: 'GET', queryStringParameters: { url: 'https://link.deezer.com/s/abc' } });
    assert.equal(ok.statusCode, 200);
    assert.equal(JSON.parse(ok.body).url, 'https://www.deezer.com/fr/playlist/1743878062?utm=1');
    assert.equal(detectPlaylist(JSON.parse(ok.body).url).id, '1743878062');

    const ko = await handler({ httpMethod: 'GET', queryStringParameters: { url: 'https://mechant.example.com/x' } });
    assert.equal(ko.statusCode, 403);

    const vide = await handler({ httpMethod: 'GET', queryStringParameters: {} });
    assert.equal(vide.statusCode, 400);
  } finally { globalThis.fetch = real; }
});

test('liens de titres Spotify copiés depuis l\'application', async () => {
  const { extractTrackIds } = await import('../assets/js/lib/playlist.js');
  const colle = [
    'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl?si=abc123',
    'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/intl-fr/track/0VjIjW4GlUZAMYd2vXMi3b',
    'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl',   // doublon
    'du texte sans lien',
  ].join('\n');
  const ids = extractTrackIds(colle);
  assert.deepEqual(ids, ['11dFghVXANMlKmJXsNCbNl', '4uLU6hMCjMI75M1A2tKUQC', '0VjIjW4GlUZAMYd2vXMi3b']);
  assert.deepEqual(extractTrackIds('rien ici'), []);
  assert.deepEqual(extractTrackIds(''), []);
});
