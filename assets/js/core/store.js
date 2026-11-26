/* État applicatif + persistance. Un seul point d'entrée pour les vues. */

import * as db from './db.js';
import { uid } from './util.js';

export const PROFILES = [
  { id: 'kevin', name: 'Kévin', initials: 'K', cls: 'kevin' },
  { id: 'andy', name: 'Andy', initials: 'A', cls: 'andy' },
];

export const state = {
  ready: false,
  theme: 'dark',
  profile: 'kevin',      // qui je suis
  space: 'kevin',        // quel espace je consulte (le mien, ou celui de l'autre en lecture)
  tracks: [],            // toutes les bibliothèques confondues, filtrées à l'affichage
  matches: [],
  currentMatchId: null,
};

/* -------------------------- Espaces de travail --------------------------
   Chacun a sa bibliothèque, ses matchs, sa mémoire. On peut consulter
   l'espace de l'autre en lecture seule, et y copier des morceaux.
   ---------------------------------------------------------------------- */

/** Est-ce que je regarde mon propre espace ? */
export const isOwnSpace = () => state.space === state.profile;

/** L'autre profil. */
export const otherProfile = () => PROFILES.find((p) => p.id !== state.profile) || PROFILES[1];

export async function setSpace(id) {
  state.space = PROFILES.some((p) => p.id === id) ? id : state.profile;
  emit('space');
}

/** Bibliothèque de l'espace consulté. */
export const spaceTracks = () => state.tracks.filter((t) => (t.owner || 'kevin') === state.space);

/** Ma bibliothèque à moi — c'est elle que le Matcher utilise. */
export const myTracks = () => state.tracks.filter((t) => (t.owner || 'kevin') === state.profile);

export const countTracks = (owner) => state.tracks.reduce((n, t) => n + ((t.owner || 'kevin') === owner ? 1 : 0), 0);

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function emit(evt = 'change') { for (const fn of listeners) fn(evt, state); }

/* ------------------------------ Chargement ------------------------------ */
export async function init() {
  const [tracks, matches, theme, profile, curMa] = await Promise.all([
    db.all('tracks'), db.all('matches'),
    db.getMeta('theme', null), db.getMeta('profile', 'kevin'),
    db.getMeta('currentMatchId', null),
  ]);
  state.tracks = tracks;
  state.matches = matches.sort((a, b) => b.updatedAt - a.updatedAt);
  state.theme = theme || 'dark';   // sombre par défaut, comme l'application My Projekt
  state.profile = profile || 'kevin';
  state.currentMatchId = curMa;
  state.space = state.profile;
  state.ready = true;
  applyTheme();
  emit('init');
}

/* ------------------------------- Thème ---------------------------------- */
export function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name=theme-color]')
    ?.setAttribute('content', state.theme === 'light' ? '#FCFBFE' : '#0F1014');
}
export async function setTheme(t) {
  state.theme = t; applyTheme(); await db.setMeta('theme', t); emit('theme');
}
export const toggleTheme = () => setTheme(state.theme === 'dark' ? 'light' : 'dark');

/* ------------------------------ Profils --------------------------------- */
export const profile = () => PROFILES.find((p) => p.id === state.profile) || PROFILES[0];
export async function setProfile(id) {
  state.profile = id;
  state.space = id;                 // on revient toujours chez soi en changeant de profil
  await db.setMeta('profile', id);
  emit('profile');
}
export const profileName = (id) => PROFILES.find((p) => p.id === id)?.name || id || '—';

/** Un match est visible si je l'ai créé, ou si son auteur l'a explicitement partagé. */
export const visible = (o) => o.owner === state.profile || o.shared === true;

/** Les matchs de l'espace consulté (les miens, ou ceux que l'autre a partagés). */
export const spaceMatches = () => state.matches.filter((m) =>
  (m.owner || 'kevin') === state.space && (state.space === state.profile || m.shared === true));

/* ---------------------------- Bibliothèque ------------------------------ */
/* Champs qu'un ré-import peut compléter sur un morceau déjà présent, sans jamais
   écraser une valeur existante (les corrections manuelles de Kévin sont protégées). */
const ENRICH_FIELDS = ['bitrate', 'format', 'bpm', 'year', 'genre', 'album', 'duration', 'key', 'camelot', 'location', 'energy'];
const isBlank = (v) => v === null || v === undefined || v === '' || v === 0;
function enrichPatch(cur, inc) {
  const patch = {};
  for (const f of ENRICH_FIELDS) {
    if (isBlank(cur[f]) && !isBlank(inc[f])) patch[f] = inc[f];
  }
  return Object.keys(patch).length ? patch : null;
}

const locKey = (t) => String(t.location || '').trim().toLowerCase();

export async function addTracks(tracks, { dedupe = true, owner = null, enrich = true } = {}) {
  const target = owner || state.profile;
  // Le dédoublonnage est propre à chaque bibliothèque : Kévin et Andy peuvent
  // très bien posséder le même morceau chacun de son côté.
  const mine = state.tracks.filter((t) => (t.owner || 'kevin') === target);
  const byFp = new Map(mine.map((t) => [fp(t), t]));
  // Index par chemin de fichier : plus stable que « titre + artiste » si le
  // parseur a évolué depuis le premier import. Évite les doublons au ré-import.
  const byLoc = new Map();
  for (const t of mine) { const l = locKey(t); if (l) byLoc.set(l, t); }
  const toAdd = [];
  const toUpdate = [];
  let skipped = 0;
  let enriched = 0;
  for (const t of tracks) {
    if (!t.title && !t.artist) continue;
    const l = locKey(t);
    const cur = (l && byLoc.get(l)) || byFp.get(fp(t));
    if (dedupe && cur) {
      // Doublon : au lieu d'ignorer bêtement, on complète les infos manquantes
      // (débit, format…) sur le morceau déjà présent, en gardant son id — les
      // matchs et la mémoire des choix, qui pointent vers cet id, restent intacts.
      const patch = enrich ? enrichPatch(cur, t) : null;
      if (patch) { Object.assign(cur, patch); toUpdate.push(cur); enriched++; }
      else skipped++;
      continue;
    }
    const rec = { ...t, id: uid(), fingerprint: fp(t), owner: target };
    byFp.set(rec.fingerprint, rec);
    if (l) byLoc.set(l, rec);
    toAdd.push(rec);
  }
  if (toAdd.length) {
    await db.bulkPut('tracks', toAdd);
    state.tracks = state.tracks.concat(toAdd);
  }
  if (toUpdate.length) await db.bulkPut('tracks', toUpdate);
  if (toAdd.length || toUpdate.length) emit('tracks');
  return { added: toAdd.length, skipped, enriched };
}

const fp = (t) => (String(t.title || '').toLowerCase().replace(/\s+/g, ' ').trim() + '|' +
                   String(t.artist || '').toLowerCase().replace(/\s+/g, ' ').trim());

export async function updateTrack(id, patch) {
  const i = state.tracks.findIndex((t) => t.id === id);
  if (i < 0) return null;
  if ((state.tracks[i].owner || 'kevin') !== state.profile) {
    throw new Error('Cette bibliothèque appartient à ' + profileName(state.tracks[i].owner) + ' : elle est en lecture seule.');
  }
  const t = { ...state.tracks[i], ...patch };
  t.fingerprint = fp(t);
  state.tracks[i] = t;
  await db.put('tracks', t);
  emit('tracks');
  return t;
}

export async function removeTracks(ids) {
  const mine = new Set(state.tracks.filter((t) => (t.owner || 'kevin') === state.profile).map((t) => t.id));
  const refused = ids.filter((id) => !mine.has(id));
  if (refused.length) throw new Error('Impossible de supprimer des morceaux dans la bibliothèque de quelqu\'un d\'autre.');
  const set = new Set(ids);
  await db.bulkDelete('tracks', ids);
  state.tracks = state.tracks.filter((t) => !set.has(t.id));
  emit('tracks');
}

export const trackById = (id) => state.tracks.find((t) => t.id === id) || null;

/** Vide uniquement MA bibliothèque. */
export async function clearLibrary() {
  const mine = state.tracks.filter((t) => (t.owner || 'kevin') === state.profile).map((t) => t.id);
  await db.bulkDelete('tracks', mine);
  const set = new Set(mine);
  state.tracks = state.tracks.filter((t) => !set.has(t.id));
  emit('tracks');
}

/** Recopie des morceaux de l'espace consulté vers le mien. */
export async function copyTracksToMe(ids) {
  const set = new Set(ids);
  const src = state.tracks.filter((t) => set.has(t.id));
  if (!src.length) return { added: 0, skipped: 0 };
  const copies = src.map((t) => ({ ...t, id: undefined, owner: state.profile, source: t.source, addedAt: Date.now() }));
  return addTracks(copies, { dedupe: true });
}

/* ------------------------------- Matchs --------------------------------- */
export function newMatch(name, rows, meta = {}) {
  return {
    id: uid(), kind: 'match', name, rows, ...meta,
    owner: state.profile, shared: false,   // privé par défaut : on partage à la demande
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

export async function saveMatch(m) {
  m.updatedAt = Date.now();
  await db.put('matches', slimMatch(m));
  const i = state.matches.findIndex((x) => x.id === m.id);
  if (i < 0) state.matches.unshift(m); else state.matches[i] = m;
  state.matches.sort((a, b) => b.updatedAt - a.updatedAt);
  emit('matches');
  return m;
}

/** On ne stocke que les identifiants des candidats, pas les objets complets. */
function slimMatch(m) {
  return {
    ...m,
    rows: m.rows.map((r) => ({
      id: r.id, source: r.source, status: r.status, confirmed: r.confirmed,
      chosenId: r.chosenId, altIds: r.altIds || [], fromMemory: !!r.fromMemory,
      candidates: (r.candidates || []).map((c) => ({ id: c.track.id, score: c.score, sameVariant: c.sameVariant })),
    })),
  };
}

/** Réhydrate un match stocké avec les objets track courants. */
export function hydrateMatch(m) {
  const byId = new Map(state.tracks.map((t) => [t.id, t]));
  return {
    ...m,
    rows: m.rows.map((r) => ({
      ...r,
      candidates: (r.candidates || [])
        .map((c) => (c.track ? c : { track: byId.get(c.id), score: c.score, sameVariant: c.sameVariant }))
        .filter((c) => c.track),
    })),
  };
}

export async function deleteMatch(id) {
  await db.del('matches', id);
  state.matches = state.matches.filter((m) => m.id !== id);
  if (state.currentMatchId === id) await setCurrentMatch(state.matches[0]?.id || null);
  emit('matches');
}

export async function duplicateMatch(id) {
  const src = state.matches.find((m) => m.id === id);
  if (!src) return null;
  const copy = { ...structuredClone(src), id: uid(), name: src.name + ' (copie)', createdAt: Date.now(), updatedAt: Date.now(), owner: state.profile };
  return saveMatch(copy);
}

export async function setCurrentMatch(id) {
  state.currentMatchId = id;
  await db.setMeta('currentMatchId', id);
  emit('currentMatch');
}
export const currentMatch = () => {
  const m = state.matches.find((x) => x.id === state.currentMatchId);
  return m ? hydrateMatch(m) : null;
};

export { db };
