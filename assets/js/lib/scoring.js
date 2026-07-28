/* Moteur de compatibilité entre deux morceaux : harmonie + BPM + énergie + genre.
   Tous les poids et tolérances sont paramétrables (vue Réglages). */

import { harmonicScore, toCamelot } from './camelot.js';

export const DEFAULT_RULES = {
  weights: { key: 40, bpm: 30, energy: 20, genre: 10 },
  bpmMode: 'percent',      // 'percent' | 'absolute'
  bpmTolerance: 6,         // ± 6 % ou ± 6 BPM
  allowHalfDouble: true,   // accepte le demi / double tempo
  energyMax: 2,            // écart d'énergie toléré
  preferRising: true,      // bonus si l'énergie monte
  sameGenreOnly: false,    // filtre dur sur le genre
};

/* ------------------------------- BPM ------------------------------------ */
export function bpmScore(a, b, rules = DEFAULT_RULES) {
  const A = Number(a), B = Number(b);
  if (!A || !B) return { score: 50, label: 'BPM inconnu', delta: null, ratio: 1 };

  const variants = rules.allowHalfDouble
    ? [{ v: B, r: 1 }, { v: B * 2, r: 2 }, { v: B / 2, r: 0.5 }, { v: B * 1.5, r: 1.5 }, { v: B / 1.5, r: 1 / 1.5 }]
    : [{ v: B, r: 1 }];

  let best = null;
  for (const cand of variants) {
    const diff = Math.abs(A - cand.v);
    const tol = rules.bpmMode === 'percent' ? (A * rules.bpmTolerance) / 100 : rules.bpmTolerance;
    const norm = tol > 0 ? diff / tol : diff;
    let score = norm <= 1 ? 100 - norm * 30 : Math.max(0, 70 - (norm - 1) * 45);
    if (cand.r !== 1) score -= 12;                       // pénalité changement de tempo
    if (!best || score > best.score) {
      best = { score: Math.round(Math.max(0, Math.min(100, score))), delta: +(cand.v - A).toFixed(1), ratio: cand.r, diffPct: +((diff / A) * 100).toFixed(1) };
    }
  }
  const label = best.ratio === 1
    ? `${best.delta > 0 ? '+' : ''}${best.delta} BPM (${best.diffPct} %)`
    : `${best.ratio === 2 ? 'double' : best.ratio === 0.5 ? 'demi' : '×' + best.ratio.toFixed(2)} tempo`;
  return { ...best, label };
}

/* ------------------------------ Énergie --------------------------------- */
export function energyScore(a, b, rules = DEFAULT_RULES) {
  const A = Number(a), B = Number(b);
  if (!A || !B) return { score: 50, label: 'Énergie inconnue', delta: null };
  const d = B - A;
  const ad = Math.abs(d);
  let score = ad <= rules.energyMax ? 100 - (ad / Math.max(1, rules.energyMax)) * 25 : Math.max(0, 75 - (ad - rules.energyMax) * 26);
  if (rules.preferRising && d > 0 && ad <= rules.energyMax) score = Math.min(100, score + 6);
  if (d < -rules.energyMax) score -= 8;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const label = d === 0 ? 'Énergie identique' : `${d > 0 ? '+' : ''}${d} d'énergie`;
  return { score, label, delta: d };
}

/* ------------------------------- Genre ---------------------------------- */
const GENRE_FAMILIES = [
  ['house', 'deep house', 'tech house', 'progressive house', 'afro house', 'bass house', 'future house'],
  ['techno', 'minimal', 'hard techno', 'melodic techno'],
  ['edm', 'electro', 'big room', 'festival', 'dance', 'mainstage'],
  ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'rnb', 'r&b', 'urban'],
  ['reggaeton', 'latino', 'latin', 'dembow', 'salsa', 'bachata', 'kuduro'],
  ['pop', 'variété', 'variete', 'top 40', 'chanson'],
  ['rock', 'indie', 'punk', 'metal'],
  ['disco', 'funk', 'soul', 'nu disco', 'boogie'],
  ['drum and bass', 'dnb', 'jungle', 'dubstep', 'bass'],
  ['afrobeat', 'afrobeats', 'amapiano', 'dancehall', 'reggae'],
];

export function genreScore(a, b) {
  const A = String(a || '').toLowerCase().trim();
  const B = String(b || '').toLowerCase().trim();
  if (!A || !B) return { score: 55, label: 'Genre inconnu' };
  if (A === B) return { score: 100, label: 'Même genre' };
  const famA = GENRE_FAMILIES.findIndex((f) => f.some((g) => A.includes(g)));
  const famB = GENRE_FAMILIES.findIndex((f) => f.some((g) => B.includes(g)));
  if (famA !== -1 && famA === famB) return { score: 82, label: 'Genre voisin' };
  if (A.includes(B) || B.includes(A)) return { score: 75, label: 'Genre proche' };
  return { score: 35, label: 'Genre différent' };
}

/* ------------------------- Score de compatibilité ----------------------- */
/**
 * @returns { score, parts: {key,bpm,energy,genre}, reasons: string[] }
 */
export function compatibility(from, to, rules = DEFAULT_RULES) {
  const w = { ...DEFAULT_RULES.weights, ...(rules.weights || {}) };
  const k = harmonicScore(from.camelot || toCamelot(from.key), to.camelot || toCamelot(to.key));
  const b = bpmScore(from.bpm, to.bpm, rules);
  const e = energyScore(from.energy, to.energy, rules);
  const g = genreScore(from.genre, to.genre);

  const total = w.key + w.bpm + w.energy + w.genre || 1;
  const score = Math.round((k.score * w.key + b.score * w.bpm + e.score * w.energy + g.score * w.genre) / total);

  return {
    score,
    parts: { key: k, bpm: b, energy: e, genre: g },
    reasons: [k.label, b.label, e.label, g.label],
  };
}

/** Classe les morceaux compatibles avec `seed`. */
export function suggest(seed, pool, rules = DEFAULT_RULES, { limit = 20, exclude = new Set() } = {}) {
  const out = [];
  for (const t of pool) {
    if (t.id === seed.id || exclude.has(t.id)) continue;
    if (rules.sameGenreOnly && seed.genre && t.genre &&
        genreScore(seed.genre, t.genre).score < 80) continue;
    const c = compatibility(seed, t, rules);
    out.push({ track: t, ...c });
  }
  out.sort((x, y) => y.score - x.score || (x.track.title || '').localeCompare(y.track.title || ''));
  return out.slice(0, limit);
}

export const scoreColor = (s) =>
  s >= 80 ? 'var(--ok)' : s >= 60 ? 'var(--warn)' : 'var(--danger)';

export const scoreClass = (s) => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'bad');
