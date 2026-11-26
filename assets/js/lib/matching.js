/* Moteur de rapprochement playlist <-> bibliothèque.
   Normalisation, similarité floue, détection de variante (remix/extended/clean...),
   score de confiance et classement des candidats. */

/* ------------------------- Normalisation -------------------------------- */
const NOISE = [
  /\bwww\.[^\s]+\b/gi,
  /\b[a-z0-9-]+\.(com|net|org|fr|ru|to|me)\b/gi,
  /\bfree ?mp3\b/gi,
  /\b(official|officiel) (video|music video|audio|lyric video|hd|clip)\b/gi,
  /\blyrics?\b/gi,
  /\bhq\b|\bhd\b|\b320\s?kbps\b|\b128\s?kbps\b/gi,
  /\[[^\]]*\b(intro|outro|clean|dirty)\b[^\]]*\]/gi,
];

/** Marqueurs de "version" : deux morceaux identiques mais versions différentes. */
const VARIANT_TOKENS = [
  'remix', 'edit', 'extended', 'radio edit', 'club mix', 'original mix', 'bootleg',
  'mashup', 'blend', 'acapella', 'instrumental', 'live', 'remaster', 'remastered',
  'clean', 'dirty', 'intro', 'outro', 'transition', 'segue', 'vip', 'rework',
  'flip', 'refix', 'dub', 'version', 'cover', 'short', 'sped up', 'slowed', 'mix',
];

export function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normalisation forte : sert à comparer. */
export function norm(s) {
  let x = stripAccents(String(s ?? '')).toLowerCase();
  for (const re of NOISE) x = x.replace(re, ' ');
  x = x
    .replace(/[‘’“”`]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bavec\b|\bwith\b/g, ' ')
    .replace(/\bvs\.?\b|\bversus\b|\bx\b(?=\s)/g, ' ')
    .replace(/\bpt\.?\s*(\d)/g, 'part $1')
    .replace(/[_\-–—]/g, ' ')
    .replace(/[^\w\s']/g, ' ')
    .replace(/\b(the|a|an|le|la|les|un|une|de|du|des)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return x;
}

/** Retire aussi les marqueurs de version -> "titre nu". */
export function baseTitle(s) {
  let x = norm(s);
  // contenu entre parenthèses/crochets déjà aplati par norm() : on retire les tokens
  for (const t of VARIANT_TOKENS) x = x.replace(new RegExp('\\b' + t.replace(/ /g, '\\s+') + '\\b', 'g'), ' ');
  return x.replace(/\s+/g, ' ').trim();
}

/** Ensemble des marqueurs de version détectés. */
export function variantTags(s) {
  const x = norm(s);
  const found = new Set();
  for (const t of VARIANT_TOKENS) {
    if (new RegExp('\\b' + t.replace(/ /g, '\\s+') + '\\b').test(x)) found.add(t);
  }
  return found;
}

/* --------------------------- Similarité --------------------------------- */
/** Coefficient de Dice sur bigrammes de caractères. */
export function dice(a, b) {
  a = a || ''; b = b || '';
  if (a === b) return a ? 1 : 0;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = grams.get(g) || 0;
    if (c > 0) { grams.set(g, c - 1); hits++; }
  }
  return (2 * hits) / (a.length + b.length - 2);
}

/** Recouvrement d'ensembles de mots (robuste à l'ordre). */
export function tokenSet(a, b) {
  const A = new Set((a || '').split(' ').filter(Boolean));
  const B = new Set((b || '').split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** Similarité combinée 0..1 */
export function sim(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const d = dice(a, b);
  const t = tokenSet(a, b);
  const contains = a.includes(b) || b.includes(a) ? 0.12 : 0;
  return Math.min(1, Math.max(d, t) * 0.7 + Math.min(d, t) * 0.3 + contains);
}

/* -------------------------- Index bibliothèque -------------------------- */
export function buildIndex(tracks) {
  return tracks.map((t) => ({
    track: t,
    nTitle: norm(t.title),
    bTitle: baseTitle(t.title),
    nArtist: norm(t.artist),
    variants: variantTags(t.title),
    tokens: new Set(baseTitle(t.title).split(' ').filter((w) => w.length > 2)),
  }));
}

/* ------------------------------ Scoring --------------------------------- */
export const THRESHOLDS = { matched: 0.90, review: 0.52 };

function scorePair(q, cand) {
  const titleBase = sim(q.bTitle, cand.bTitle);
  const titleFull = sim(q.nTitle, cand.nTitle);
  const artist = q.nArtist && cand.nArtist ? sim(q.nArtist, cand.nArtist) : 0.5;

  // Le titre "nu" pèse le plus : on veut le bon morceau avant la bonne version.
  let s = titleBase * 0.55 + titleFull * 0.15 + artist * 0.30;

  // Bonus/malus de version
  const qv = q.variants, cv = cand.variants;
  const sameVariant = qv.size === cv.size && [...qv].every((v) => cv.has(v));
  if (sameVariant) s += 0.06;
  else if (cv.size && !qv.size) s -= 0.05;          // la biblio a une version différente
  else if (qv.size && !cv.size) s -= 0.03;

  // Bonus durée
  if (q.duration && cand.track.duration) {
    const d = Math.abs(q.duration - cand.track.duration);
    if (d <= 3) s += 0.07; else if (d <= 12) s += 0.03; else if (d > 90) s -= 0.05;
  }
  // Départage : morceaux les plus joués, puis meilleure qualité audio
  const pc = Number(cand.track.playCount) || 0;
  s += Math.min(0.02, pc / 2000);
  const br = Number(cand.track.bitrate) || 0;
  if (br >= 320) s += 0.015; else if (br && br < 192) s -= 0.01;

  return Math.max(0, Math.min(1, s));
}

/**
 * Rapproche une entrée de playlist avec la bibliothèque.
 * @returns { candidates: [{track, score, variantDiff}], status }
 */
export function matchOne(entry, index, { maxCandidates = 40 } = {}) {
  const q = {
    nTitle: norm(entry.title),
    bTitle: baseTitle(entry.title),
    nArtist: norm(entry.artist),
    variants: variantTags(entry.title),
    duration: entry.duration || null,
  };
  const qTokens = new Set(q.bTitle.split(' ').filter((w) => w.length > 2));

  const scored = [];
  for (const cand of index) {
    // Pré-filtre bon marché : au moins un mot significatif en commun,
    // sinon similarité brute sur titres courts.
    let touch = false;
    for (const t of qTokens) if (cand.tokens.has(t)) { touch = true; break; }
    if (!touch && qTokens.size && cand.tokens.size) {
      if (dice(q.bTitle, cand.bTitle) < 0.45) continue;
    }
    const s = scorePair(q, cand);
    if (s > 0.3) scored.push({ track: cand.track, score: s, sameVariant: eqSet(q.variants, cand.variants) });
  }

  scored.sort((a, b) => b.score - a.score
    || (Number(b.track.bitrate) || 0) - (Number(a.track.bitrate) || 0)
    || (Number(b.track.playCount) || 0) - (Number(a.track.playCount) || 0));
  const candidates = scored.slice(0, maxCandidates);
  const top = candidates[0];

  let status = 'missing';
  if (top) {
    if (top.score >= THRESHOLDS.matched && top.sameVariant) status = 'matched';
    else if (top.score >= THRESHOLDS.review) status = 'review';
  }
  return { candidates, status };
}

const eqSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

/**
 * Rapproche toute une playlist.
 * @param entries [{title, artist, duration}]
 * @param tracks  bibliothèque
 * @param onProgress (done, total)
 */
export async function matchPlaylist(entries, tracks, { onProgress, dedupe = true, chunk = 12 } = {}) {
  const index = buildIndex(tracks);
  const seen = new Set();
  const rows = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (dedupe) {
      const k = baseTitle(e.title) + '|' + norm(e.artist);
      if (seen.has(k)) continue;
      seen.add(k);
    }
    const { candidates, status } = matchOne(e, index);
    rows.push({
      id: 'r' + i + '_' + Math.random().toString(36).slice(2, 7),
      source: { title: e.title, artist: e.artist, duration: e.duration ?? null, album: e.album || '' },
      candidates,
      chosenId: status === 'missing' ? null : candidates[0]?.track.id ?? null,
      altIds: [],
      status,                     // matched | review | missing
      confirmed: status === 'matched',
    });
    if (onProgress && i % chunk === 0) {
      onProgress(i + 1, entries.length);
      await new Promise((r) => setTimeout(r, 0));   // laisse respirer l'UI
    }
  }
  onProgress?.(entries.length, entries.length);
  return rows;
}

/** Compteurs de l'écran de résultats. */
export function summarize(rows) {
  const s = { total: rows.length, review: 0, matched: 0, alternatives: 0, missing: 0 };
  for (const r of rows) {
    if (r.status === 'missing' || !r.chosenId) s.missing++;
    else if (r.confirmed) s.matched++;
    else s.review++;
    s.alternatives += (r.altIds || []).length;
  }
  return s;
}
