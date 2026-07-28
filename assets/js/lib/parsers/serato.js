/* Lecture des fichiers Serato (format binaire tagué).
   Structure : [tag 4 octets ASCII][longueur uint32 big-endian][données]
   - "database V2" : la bibliothèque complète (titre, artiste, BPM, clé, genre…)
   - "*.crate"     : une crate (surtout des chemins de fichiers)
   Les champs texte sont en UTF-16 big-endian. */

import { makeTrack } from './index.js';

/* Champs utiles dans un bloc otrk (track) */
const FIELD = {
  pfil: 'location',   // chemin du fichier
  ptrk: 'location',   // chemin (crates)
  tsng: 'title',      // song
  tart: 'artist',
  talb: 'album',
  tgen: 'genre',
  tbpm: 'bpm',
  tkey: 'key',
  tlen: 'lengthText', // "3:45"
  tbit: 'bitrate',    // "320.0kbps"
  ttyp: 'format',     // "mp3", "wav"…
  tsmp: 'sampleRate', // "44.1k"
  tsiz: 'sizeText',   // "8.5MB"
  ttyr: 'year',
  tcom: 'notes',
  tgrp: 'tags',
  tadd: 'addedText',
};

function readUtf16BE(dv, off, len) {
  let s = '';
  for (let i = 0; i + 1 < len; i += 2) s += String.fromCharCode(dv.getUint16(off + i, false));
  return s.replace(/\0+$/, '');
}

function readTag(dv, off) {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
}

/** Découpe une zone en blocs [tag, début, longueur]. */
function* blocks(dv, start, end) {
  let o = start;
  while (o + 8 <= end) {
    const tag = readTag(dv, o);
    const len = dv.getUint32(o + 4, false);
    const body = o + 8;
    if (len < 0 || body + len > end) return;
    yield [tag, body, len];
    o = body + len;
  }
}

/** Parse "database V2" ou n'importe quel fichier Serato contenant des blocs otrk. */
export function parseSeratoBinary(buffer, { source = 'Serato' } = {}) {
  const dv = new DataView(buffer);
  const out = [];

  for (const [tag, body, len] of blocks(dv, 0, dv.byteLength)) {
    if (tag !== 'otrk') continue;
    const raw = {};
    for (const [f, fb, fl] of blocks(dv, body, body + len)) {
      const key = FIELD[f];
      if (!key) continue;
      raw[key] = readUtf16BE(dv, fb, fl).trim();
    }
    const t = trackFromRaw(raw, source);
    if (t) out.push(t);
  }
  return out;
}

function trackFromRaw(raw, source) {
  let title = raw.title;
  let artist = raw.artist;

  // Certaines entrées n'ont que le chemin : on déduit du nom de fichier.
  if (!title && raw.location) {
    const file = String(raw.location).split(/[\\/]/).pop() || '';
    const bare = file.replace(/\.(mp3|wav|aiff?|flac|m4a|ogg|aac|alac)$/i, '');
    const sep = bare.match(/\s+[-–—]\s+/);
    if (sep) { artist = artist || bare.slice(0, sep.index).trim(); title = bare.slice(sep.index + sep[0].length).trim(); }
    else title = bare;
  }
  if (!title) return null;

  return makeTrack({
    title, artist: artist || '', album: raw.album || '', genre: raw.genre || '',
    bpm: raw.bpm || null, key: raw.key || null, year: raw.year || null,
    duration: raw.lengthText || null, notes: raw.notes || '', tags: raw.tags || '',
    bitrate: raw.bitrate || null,
    format: raw.format || extFromPath(raw.location),
    location: raw.location || '', source,
  });
}

const extFromPath = (p) => String(p || '').toLowerCase().match(/\.([a-z0-9]{2,4})$/)?.[1] || '';

/** Un .crate ne contient que des chemins : on les résout dans la bibliothèque si possible. */
export function parseSeratoCrate(buffer, { source = 'Serato (crate)' } = {}) {
  return parseSeratoBinary(buffer, { source });
}

/** Détecte si un ArrayBuffer ressemble à un fichier Serato. */
export function looksLikeSerato(buffer) {
  if (!buffer || buffer.byteLength < 8) return false;
  const dv = new DataView(buffer);
  const tag = readTag(dv, 0);
  return tag === 'vrsn' || tag === 'otrk' || tag === 'osrt';
}
