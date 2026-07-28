/* Tests du moteur — exécuter avec :  node --test tests/  */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toCamelot, toClassic, harmonicScore, compatibleKeys, CAMELOT_CODES } from '../assets/js/lib/camelot.js';
import { bpmScore, energyScore, genreScore, compatibility, suggest, DEFAULT_RULES } from '../assets/js/lib/scoring.js';
import { norm, baseTitle, variantTags, dice, sim, buildIndex, matchOne, matchPlaylist, summarize } from '../assets/js/lib/matching.js';
import { parseCSV, tracksFromCSV, tracksFromText, tracksFromM3U, detectDelimiter } from '../assets/js/lib/parsers/index.js';

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

test('camelot : compatibilité harmonique', () => {
  assert.equal(harmonicScore('8A', '8A').score, 100);
  assert.equal(harmonicScore('8A', '8B').kind, 'relative');
  assert.equal(harmonicScore('8A', '9A').kind, 'neighbour');
  assert.equal(harmonicScore('8A', '7A').kind, 'neighbour');
  assert.equal(harmonicScore('12A', '1A').kind, 'neighbour');   // la roue boucle
  assert.ok(harmonicScore('8A', '2A').score < 45);              // opposé
  assert.ok(harmonicScore('8A', '9A').score > harmonicScore('8A', '10A').score);
  assert.equal(harmonicScore(null, '8A').kind, 'unknown');
});

test('camelot : liste des tonalités compatibles', () => {
  const c = compatibleKeys('8A');
  assert.deepEqual(new Set(c), new Set(['8A', '9A', '7A', '8B']));
  assert.deepEqual(new Set(compatibleKeys('12B')), new Set(['12B', '1B', '11B', '12A']));
});

/* =============================== Scoring ================================ */
test('bpm : tolérance et demi/double tempo', () => {
  assert.equal(bpmScore(128, 128).score, 100);
  assert.ok(bpmScore(128, 130).score > 85);
  assert.ok(bpmScore(128, 150).score < 30);
  const half = bpmScore(128, 64, { ...DEFAULT_RULES, allowHalfDouble: true });
  assert.ok(half.score > 70, 'le double tempo doit rester acceptable');
  const strict = bpmScore(128, 64, { ...DEFAULT_RULES, allowHalfDouble: false });
  assert.ok(strict.score < 20);
});

test('bpm : mode absolu', () => {
  const r = { ...DEFAULT_RULES, bpmMode: 'absolute', bpmTolerance: 2, allowHalfDouble: false };
  assert.ok(bpmScore(128, 129, r).score > 80);
  assert.ok(bpmScore(128, 136, r).score < 40);
});

test('énergie et genre', () => {
  assert.equal(energyScore(5, 5).score, 100);
  assert.ok(energyScore(5, 6).score >= energyScore(5, 4).score, 'la montée est favorisée');
  assert.ok(energyScore(5, 10).score < 40);
  assert.equal(genreScore('House', 'House').score, 100);
  assert.ok(genreScore('Deep House', 'Tech House').score > 70);
  assert.ok(genreScore('Techno', 'Reggaeton').score < 50);
});

test('compatibilité globale et suggestions', () => {
  const A = { id: 'a', title: 'A', camelot: '8A', bpm: 124, energy: 5, genre: 'House' };
  const good = { id: 'b', title: 'B', camelot: '9A', bpm: 125, energy: 6, genre: 'House' };
  const bad = { id: 'c', title: 'C', camelot: '2B', bpm: 174, energy: 1, genre: 'Metal' };
  assert.ok(compatibility(A, good).score > 80);
  assert.ok(compatibility(A, bad).score < 45);

  const list = suggest(A, [A, good, bad], DEFAULT_RULES);
  assert.equal(list.length, 2, 'le morceau de départ est exclu');
  assert.equal(list[0].track.id, 'b');
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

test('énergie : échelle 0-1 de Spotify convertie en 1-10', () => {
  const t = tracksFromCSV('Title,Artist,Energy\nX,Y,0.82');
  assert.equal(t[0].energy, 8);
});
