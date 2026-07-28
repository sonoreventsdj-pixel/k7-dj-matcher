/* Roue de Camelot : conversion notation classique <-> Camelot, compatibilité.
   1A..12A = mineurs, 1B..12B = majeurs. */

export const WHEEL = [
  { c: '1A',  min: 'Abm', alts: ['G#m', 'Ab min', 'A♭m'] },
  { c: '1B',  maj: 'B',   alts: ['Bmaj', 'B major'] },
  { c: '2A',  min: 'Ebm', alts: ['D#m', 'E♭m'] },
  { c: '2B',  maj: 'F#',  alts: ['Gb', 'G♭'] },
  { c: '3A',  min: 'Bbm', alts: ['A#m', 'B♭m'] },
  { c: '3B',  maj: 'Db',  alts: ['C#', 'C♯'] },
  { c: '4A',  min: 'Fm',  alts: [] },
  { c: '4B',  maj: 'Ab',  alts: ['G#'] },
  { c: '5A',  min: 'Cm',  alts: [] },
  { c: '5B',  maj: 'Eb',  alts: ['D#'] },
  { c: '6A',  min: 'Gm',  alts: [] },
  { c: '6B',  maj: 'Bb',  alts: ['A#'] },
  { c: '7A',  min: 'Dm',  alts: [] },
  { c: '7B',  maj: 'F',   alts: [] },
  { c: '8A',  min: 'Am',  alts: [] },
  { c: '8B',  maj: 'C',   alts: [] },
  { c: '9A',  min: 'Em',  alts: [] },
  { c: '9B',  maj: 'G',   alts: [] },
  { c: '10A', min: 'Bm',  alts: [] },
  { c: '10B', maj: 'D',   alts: [] },
  { c: '11A', min: 'F#m', alts: ['Gbm', 'G♭m'] },
  { c: '11B', maj: 'A',   alts: [] },
  { c: '12A', min: 'Dbm', alts: ['C#m', 'C♯m'] },
  { c: '12B', maj: 'E',   alts: [] },
];

export const CAMELOT_CODES = WHEEL.map((w) => w.c);

/* Index de recherche : forme normalisée -> code Camelot */
const LOOKUP = new Map();
function reg(key, code) {
  const k = normKey(key);
  if (k && !LOOKUP.has(k)) LOOKUP.set(k, code);
}
function normKey(s) {
  return String(s ?? '')
    .replace(/[♯]/g, '#').replace(/[♭]/g, 'b')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(major|maj|dur)\b/g, 'maj')
    .replace(/\b(minor|min|moll)\b/g, 'm')
    .replace(/\bmaj\b/g, '')
    .replace(/\s*m\b/, 'm')
    .replace(/[^a-z0-9#]/g, '');
}
for (const w of WHEEL) {
  reg(w.c, w.c);
  if (w.min) { reg(w.min, w.c); reg(w.min.replace(/m$/, ' minor'), w.c); reg(w.min.replace(/m$/, ' min'), w.c); }
  if (w.maj) { reg(w.maj, w.c); reg(w.maj + ' major', w.c); reg(w.maj + ' maj', w.c); }
  for (const a of w.alts) reg(a, w.c);
}
/* Notation "Open Key" (1d/1m ... 12d/12m) utilisée par Traktor/Mixed In Key */
const OPENKEY_TO_CAMELOT = {};
for (let i = 1; i <= 12; i++) {
  const camMaj = ((i + 6) % 12) + 1 + 'B';   // 1d (Do maj) -> 8B
  const camMin = ((i + 6) % 12) + 1 + 'A';   // 1m (La min) -> 8A
  OPENKEY_TO_CAMELOT[i + 'd'] = camMaj;
  OPENKEY_TO_CAMELOT[i + 'm'] = camMin;
}

/** Toute écriture de tonalité -> code Camelot (ex. "F#m", "11A", "6d") ou null. */
export function toCamelot(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Déjà du Camelot
  const direct = s.toUpperCase().match(/^(\d{1,2})\s*([AB])$/);
  if (direct) {
    const n = Number(direct[1]);
    if (n >= 1 && n <= 12) return n + direct[2];
  }
  // Open Key
  const ok = s.toLowerCase().match(/^(\d{1,2})\s*([dm])$/);
  if (ok && Number(ok[1]) >= 1 && Number(ok[1]) <= 12) return OPENKEY_TO_CAMELOT[Number(ok[1]) + ok[2]];

  const n = normKey(s);
  if (LOOKUP.has(n)) return LOOKUP.get(n);

  // Chaînes du type "8A - 128" ou "Am / 128"
  const m = s.toUpperCase().match(/\b(\d{1,2})([AB])\b/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return Number(m[1]) + m[2];
  return null;
}

/** Camelot -> notation classique ("8A" -> "Am"). */
export function toClassic(camelot) {
  const c = toCamelot(camelot);
  if (!c) return null;
  const w = WHEEL.find((x) => x.c === c);
  return w ? (w.min || w.maj) : null;
}

export const parts = (camelot) => {
  const c = toCamelot(camelot);
  if (!c) return null;
  return { n: parseInt(c, 10), letter: c.slice(-1) };
};

const dist12 = (a, b) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };

/**
 * Compatibilité harmonique entre deux tonalités.
 * -> { score 0-100, label, kind }
 */
export function harmonicScore(fromKey, toKey) {
  const a = parts(fromKey), b = parts(toKey);
  if (!a || !b) return { score: 50, label: 'Tonalité inconnue', kind: 'unknown' };

  const dn = dist12(a.n, b.n);
  const sameLetter = a.letter === b.letter;

  if (dn === 0 && sameLetter) return { score: 100, label: 'Même tonalité', kind: 'same' };
  if (dn === 0 && !sameLetter) return { score: 88, label: 'Relatif majeur/mineur', kind: 'relative' };
  if (dn === 1 && sameLetter) {
    const up = (b.n - a.n + 12) % 12 === 1;
    return { score: 93, label: up ? '+1 sur la roue (montée)' : '−1 sur la roue (détente)', kind: 'neighbour' };
  }
  if (dn === 1 && !sameLetter) return { score: 58, label: 'Diagonale (mix à surveiller)', kind: 'diagonal' };
  if (dn === 2 && sameLetter) return { score: 68, label: '+2 sur la roue (saut d\'énergie)', kind: 'jump2' };
  if (dn === 3 && sameLetter) return { score: 48, label: '+3 sur la roue (transition marquée)', kind: 'jump3' };
  if (dn === 5 && sameLetter) return { score: 40, label: 'Quinte lointaine', kind: 'far' };
  return { score: Math.max(8, 34 - dn * 3), label: 'Tonalités éloignées', kind: 'clash' };
}

/** Liste des codes considérés comme mixables depuis `key`. */
export function compatibleKeys(key) {
  const p = parts(key);
  if (!p) return [];
  const up = (p.n % 12) + 1;
  const down = ((p.n + 10) % 12) + 1;
  const other = p.letter === 'A' ? 'B' : 'A';
  return [p.n + p.letter, up + p.letter, down + p.letter, p.n + other];
}

/** Couleur indicative pour l'affichage d'une tonalité. */
export function keyHue(key) {
  const p = parts(key);
  if (!p) return 260;
  return Math.round(((p.n - 1) / 12) * 360);
}
