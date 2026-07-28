/* Écriture d'une crate Serato (.crate).

   Format : suite de blocs [tag 4 octets ASCII][longueur uint32 big-endian][données].
   Les chaînes sont en UTF-16 big-endian, sans BOM ni terminateur.

   Un fichier contient :
     vrsn  version du format
     osrt  tri par défaut  (tvcn = nom de colonne, brev = ordre inverse 0/1)
     ovct  colonne visible (tvcn = nom de colonne, tvcw = largeur)
     otrk  un par morceau, contenant ptrk = chemin RELATIF au volume

   Le chemin doit être relatif à la racine du disque, sans slash initial :
   /Users/kevin/Music/x.mp3  ->  Users/kevin/Music/x.mp3
*/

const enc = new TextEncoder();

function utf16be(str) {
  const s = String(str ?? '');
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2] = (c >> 8) & 0xff;
    out[i * 2 + 1] = c & 0xff;
  }
  return out;
}

function block(tag, payload) {
  const t = enc.encode(tag);
  if (t.length !== 4) throw new Error('Tag Serato invalide : ' + tag);
  const out = new Uint8Array(8 + payload.length);
  out.set(t, 0);
  new DataView(out.buffer).setUint32(4, payload.length, false);
  out.set(payload, 8);
  return out;
}

const concat = (chunks) => {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
};

/**
 * Chemin de fichier -> chemin relatif au volume, séparateurs Unix.
 * Renvoie null si on n'a pas de chemin exploitable.
 */
export function seratoPath(location) {
  let p = String(location || '').trim();
  if (!p) return null;
  if (p.startsWith('file://')) {
    try { p = decodeURIComponent(new URL(p).pathname); } catch { p = p.replace(/^file:\/\//, ''); }
  }
  p = p.replace(/\\/g, '/');
  p = p.replace(/^[A-Za-z]:\//, '');          // Windows : C:/…
  p = p.replace(/^\/Volumes\/[^/]+\//, '');    // macOS : disque externe
  p = p.replace(/^\/+/, '');                   // slash initial
  return p || null;
}

const COLUMNS = ['song', 'artist', 'bpm', 'key', 'album', 'length', 'bitrate'];

/**
 * Construit le contenu binaire d'une crate.
 * @param tracks morceaux (seuls ceux qui ont un chemin de fichier sont retenus)
 * @returns { blob, included, skipped }
 */
export function buildCrate(tracks, { sortBy = 'song' } = {}) {
  const chunks = [];

  chunks.push(block('vrsn', utf16be('1.0/Serato ScratchLive Crate')));
  chunks.push(block('osrt', concat([
    block('tvcn', utf16be(sortBy)),
    block('brev', new Uint8Array([0])),
  ])));
  for (const col of COLUMNS) {
    chunks.push(block('ovct', concat([
      block('tvcn', utf16be(col)),
      block('tvcw', utf16be('0')),
    ])));
  }

  const included = [];
  const skipped = [];
  for (const t of tracks) {
    const p = seratoPath(t.location);
    if (!p) { skipped.push(t); continue; }
    chunks.push(block('otrk', block('ptrk', utf16be(p))));
    included.push(t);
  }

  return { blob: new Blob([concat(chunks)], { type: 'application/octet-stream' }), included, skipped };
}

/**
 * Nom de fichier pour Serato.
 * Volontairement ASCII : les navigateurs remplacent silencieusement un nom de
 * téléchargement contenant des caractères non-ASCII par « download », et Serato
 * ne reconnaîtrait alors plus la crate. Le nom du fichier devient aussi le nom
 * affiché dans Serato, donc autant qu'il reste lisible.
 * Note : « %% » est réservé par Serato pour les sous-crates, on le retire.
 */
export const crateFilename = (name) => {
  const ascii = String(name || 'K7')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accents
    .replace(/[\u2010-\u2015]/g, '-')                   // tirets typographiques
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^\x20-\x7E]/g, ' ')                      // tout le reste hors ASCII
    .replace(/[\\/:*?"<>|%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[\s.-]+$/, '');
  return (ascii || 'K7') + '.crate';
};
