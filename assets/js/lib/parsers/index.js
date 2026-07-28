/* Lecture des sources : CSV, texte collé, Rekordbox XML, iTunes/Apple Music XML,
   Serato .crate. Toutes les fonctions renvoient des objets "track" normalisés. */

import { toCamelot, toClassic } from '../camelot.js';
import { parseDur, num, uid } from '../../core/util.js';

/** Fabrique un track normalisé. */
export function makeTrack(raw = {}) {
  const camelot = toCamelot(raw.key ?? raw.camelot ?? null);
  return {
    id: raw.id || uid(),
    title: String(raw.title ?? '').trim(),
    artist: String(raw.artist ?? '').trim(),
    album: String(raw.album ?? '').trim(),
    bpm: num(raw.bpm),
    camelot,
    key: camelot ? toClassic(camelot) : (raw.key ? String(raw.key).trim() : null),
    genre: raw.genre ? String(raw.genre).trim() : '',
    energy: normEnergy(raw.energy),
    year: num(raw.year),
    tags: normTags(raw.tags),
    notes: raw.notes ? String(raw.notes).trim() : '',
    duration: raw.duration != null ? parseDur(raw.duration) : null,
    playCount: num(raw.playCount) || 0,
    rating: num(raw.rating) || null,
    location: raw.location || '',
    source: raw.source || 'manuel',
    owner: raw.owner || null,
    addedAt: raw.addedAt || Date.now(),
  };
}

/** Énergie sur 1-10. Accepte aussi l'échelle 0-1 de Spotify. */
function normEnergy(v) {
  if (v == null || v === '') return null;
  let n = num(v);
  if (n == null) return null;
  if (n > 0 && n <= 1) n = n * 10;          // 0.82 -> 8
  n = Math.round(n);
  if (n < 1) return null;
  return Math.min(10, n);
}

const normTags = (t) => {
  if (!t) return [];
  if (Array.isArray(t)) return t.map((x) => String(x).trim()).filter(Boolean);
  return String(t).split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
};

/** Empreinte pour dédoublonnage. */
export const fingerprint = (t) =>
  (String(t.title || '').toLowerCase().replace(/\s+/g, ' ').trim() + '|' +
   String(t.artist || '').toLowerCase().replace(/\s+/g, ' ').trim());

/* ============================== CSV ==================================== */
export function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
  let best = ',', bestN = 0;
  for (const d of [',', ';', '\t', '|']) {
    const n = line.split(d).length - 1;
    if (n > bestN) { bestN = n; best = d; }
  }
  return best;
}

/** Parseur CSV conforme RFC4180 (guillemets, retours à la ligne inclus). */
export function parseCSV(text, delimiter) {
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQ = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignoré */ }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const HEADER_MAP = {
  title: ['title', 'titre', 'track name', 'track', 'name', 'song', 'nom', 'morceau', 'trackname'],
  artist: ['artist', 'artiste', 'artist name(s)', 'artist name', 'artists', 'artistes', 'albumartist', 'album artist'],
  album: ['album', 'album name'],
  bpm: ['bpm', 'tempo', 'averagebpm', 'average bpm', 'beats per minute'],
  key: ['key', 'tonalite', 'tonalité', 'camelot', 'tonality', 'initial key', 'initialkey', 'harmonic key'],
  genre: ['genre', 'style', 'genres'],
  energy: ['energy', 'energie', 'énergie', 'nrj'],
  year: ['year', 'annee', 'année', 'release year', 'date'],
  tags: ['tags', 'tag', 'labels', 'mots-cles', 'mots clés', 'comment', 'comments', 'commentaire', 'grouping'],
  notes: ['notes', 'note', 'remarque', 'remarques'],
  duration: ['duration', 'duree', 'durée', 'time', 'length', 'duration (ms)', 'totaltime', 'total time'],
  playCount: ['play count', 'plays', 'playcount', 'lectures', 'nb lectures'],
  rating: ['rating', 'note', 'stars', 'etoiles'],
  location: ['location', 'path', 'file', 'chemin', 'filename'],
};

function mapHeaders(header) {
  const idx = {};
  header.forEach((raw, i) => {
    const h = String(raw).trim().toLowerCase().replace(/^﻿/, '');
    for (const [field, aliases] of Object.entries(HEADER_MAP)) {
      if (idx[field] != null) continue;
      if (aliases.includes(h)) { idx[field] = i; return; }
    }
  });
  return idx;
}

/** CSV -> tracks. Détecte l'en-tête ; sinon suppose "artiste, titre". */
export function tracksFromCSV(text, { source = 'csv' } = {}) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const idx = mapHeaders(rows[0]);
  const hasHeader = Object.keys(idx).length >= 2;
  const body = hasHeader ? rows.slice(1) : rows;

  return body.map((r) => {
    if (!hasHeader) {
      const [a, b, c] = r;
      return makeTrack({ artist: a, title: b, bpm: c, source });
    }
    const g = (f) => (idx[f] != null ? r[idx[f]] : undefined);
    return makeTrack({
      title: g('title'), artist: g('artist'), album: g('album'),
      bpm: g('bpm'), key: g('key'), genre: g('genre'), energy: g('energy'),
      year: g('year'), tags: g('tags'), notes: g('notes'),
      duration: g('duration'), playCount: g('playCount'), rating: g('rating'),
      location: g('location'), source,
    });
  }).filter((t) => t.title || t.artist);
}

/* ============================== Texte ================================== */
/**
 * Une ligne = un morceau. Formats reconnus :
 *   Artiste - Titre        |  Titre - Artiste (si order='title-first')
 *   1. Artiste - Titre     |  Artiste – Titre (tirets longs)
 *   Artiste - Titre [3:45]
 */
export function tracksFromText(text, { order = 'artist-first', source = 'texte' } = {}) {
  const out = [];
  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim();
    if (!line || /^[-=_*#]+$/.test(line)) continue;
    line = line.replace(/^\s*\d{1,3}\s*[.)\]]\s*/, '');            // numérotation
    let duration = null;
    const dm = line.match(/[\[(]?\b(\d{1,2}:\d{2})\b[\])]?\s*$/);
    if (dm) { duration = parseDur(dm[1]); line = line.slice(0, dm.index).trim(); }

    const sep = line.match(/\s+[-–—]\s+/);
    let artist = '', title = line;
    if (sep) {
      const a = line.slice(0, sep.index).trim();
      const b = line.slice(sep.index + sep[0].length).trim();
      if (order === 'title-first') { title = a; artist = b; }
      else { artist = a; title = b; }
    }
    if (!title) continue;
    out.push(makeTrack({ title, artist, duration, source }));
  }
  return out;
}

/* ========================== Rekordbox XML ============================== */
export function tracksFromRekordbox(xmlText, { source = 'rekordbox' } = {}) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML Rekordbox illisible.');
  const nodes = Array.from(doc.querySelectorAll('COLLECTION > TRACK, TRACK'));
  const seen = new Set();
  const out = [];
  for (const n of nodes) {
    const id = n.getAttribute('TrackID');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const name = n.getAttribute('Name');
    if (!name) continue;
    out.push(makeTrack({
      title: name,
      artist: n.getAttribute('Artist') || '',
      album: n.getAttribute('Album') || '',
      bpm: n.getAttribute('AverageBpm'),
      key: n.getAttribute('Tonality'),
      genre: n.getAttribute('Genre') || '',
      year: n.getAttribute('Year'),
      duration: n.getAttribute('TotalTime'),
      playCount: n.getAttribute('PlayCount'),
      rating: n.getAttribute('Rating') ? Math.round(Number(n.getAttribute('Rating')) / 51) : null,
      tags: n.getAttribute('Grouping') || '',
      notes: n.getAttribute('Comments') || '',
      location: decodeURIComponent(n.getAttribute('Location') || ''),
      source,
    }));
  }
  return out;
}

/* ======================= iTunes / Apple Music XML ======================= */
/** Le plist iTunes : <dict><key>Name</key><string>…</string>… */
export function tracksFromITunes(xmlText, { source = 'itunes' } = {}) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML iTunes illisible.');

  // plist > dict > key "Tracks" > dict > (id -> dict)
  const rootDict = doc.querySelector('plist > dict');
  if (!rootDict) throw new Error('Ce fichier n\'est pas une bibliothèque iTunes.');
  const tracksDict = valueForKey(rootDict, 'Tracks');
  if (!tracksDict) throw new Error('Aucune section « Tracks » trouvée.');

  const out = [];
  const kids = Array.from(tracksDict.children);
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].tagName !== 'key') continue;
    const d = kids[i + 1];
    if (!d || d.tagName !== 'dict') continue;
    const g = (k) => plistValue(valueForKey(d, k));
    const title = g('Name');
    if (!title) continue;
    out.push(makeTrack({
      title,
      artist: g('Artist') || g('Album Artist') || '',
      album: g('Album') || '',
      bpm: g('BPM'),
      genre: g('Genre') || '',
      year: g('Year'),
      duration: g('Total Time'),
      playCount: g('Play Count'),
      rating: g('Rating') ? Math.round(Number(g('Rating')) / 20) : null,
      tags: g('Grouping') || '',
      notes: g('Comments') || '',
      // Beaucoup de DJ stockent la tonalité dans les commentaires / le regroupement :
      // on ne la retient que si elle est reconnue comme une vraie tonalité.
      key: toCamelot(g('Comments')) || toCamelot(g('Grouping')) || null,
      location: safeDecode(g('Location') || ''),
      source,
    }));
  }
  return out;
}

function valueForKey(dict, key) {
  const kids = Array.from(dict.children);
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].tagName === 'key' && kids[i].textContent === key) return kids[i + 1] || null;
  }
  return null;
}
function plistValue(node) {
  if (!node) return null;
  switch (node.tagName) {
    case 'true': return true;
    case 'false': return false;
    case 'integer': case 'real': return Number(node.textContent);
    default: return node.textContent;
  }
}
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/* ============================ Point d'entrée ============================ */
/** Route automatiquement selon le nom / le contenu du fichier. */
export async function parseFile(file, { readText, readBuffer, textOrder } = {}) {
  const name = (file.name || '').toLowerCase();
  const { parseSeratoBinary, looksLikeSerato } = await import('./serato.js');

  // Serato : "database V2" (bibliothèque complète) ou une crate.
  if (name.endsWith('.crate') || /database\s*v?2?$/.test(name) || !/\.[a-z0-9]+$/.test(name)) {
    const buf = await readBuffer(file);
    if (looksLikeSerato(buf)) {
      const kind = name.endsWith('.crate') ? 'Serato (crate)' : 'Serato (bibliothèque)';
      return { tracks: parseSeratoBinary(buf, { source: kind }), kind };
    }
  }
  const text = await readText(file);
  const head = text.slice(0, 2000);

  if (name.endsWith('.xml') || head.trimStart().startsWith('<?xml') || head.includes('<DJ_PLAYLISTS')) {
    if (head.includes('DJ_PLAYLISTS') || head.includes('<COLLECTION')) {
      return { tracks: tracksFromRekordbox(text), kind: 'Rekordbox (XML)' };
    }
    if (head.includes('<plist') || head.includes('Apple Computer//DTD PLIST')) {
      return { tracks: tracksFromITunes(text), kind: 'iTunes / Apple Music (XML)' };
    }
    // XML inconnu : on tente Rekordbox puis iTunes
    try { const t = tracksFromRekordbox(text); if (t.length) return { tracks: t, kind: 'Rekordbox (XML)' }; } catch {}
    return { tracks: tracksFromITunes(text), kind: 'XML' };
  }
  if (name.endsWith('.json')) {
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : (j.tracks || j.data?.tracks || []);
    return { tracks: arr.map(makeTrack), kind: 'JSON' };
  }
  if (name.endsWith('.m3u') || name.endsWith('.m3u8')) {
    return { tracks: tracksFromM3U(text), kind: 'M3U' };
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || text.includes(',') || text.includes(';')) {
    const t = tracksFromCSV(text);
    if (t.length) return { tracks: t, kind: 'CSV' };
  }
  return { tracks: tracksFromText(text, { order: textOrder }), kind: 'Texte' };
}

export function tracksFromM3U(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  let pending = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const m = line.match(/^#EXTINF:(-?\d+)\s*,\s*(.*)$/);
      if (m) {
        const dur = Number(m[1]) > 0 ? Number(m[1]) : null;
        const label = m[2];
        const sep = label.match(/\s+[-–—]\s+/);
        pending = sep
          ? { artist: label.slice(0, sep.index).trim(), title: label.slice(sep.index + sep[0].length).trim(), duration: dur }
          : { artist: '', title: label, duration: dur };
      }
    } else if (line && !line.startsWith('#')) {
      if (pending) { out.push(makeTrack({ ...pending, location: line, source: 'm3u' })); pending = null; }
      else {
        const file = line.split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '');
        const sep = file.match(/\s+[-–—]\s+/);
        out.push(makeTrack(sep
          ? { artist: file.slice(0, sep.index).trim(), title: file.slice(sep.index + sep[0].length).trim(), location: line, source: 'm3u' }
          : { title: file, location: line, source: 'm3u' }));
      }
    }
  }
  return out;
}
