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
  profile: 'kevin',
  tracks: [],
  matches: [],
  currentMatchId: null,
};

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
  state.profile = id; await db.setMeta('profile', id); emit('profile');
}
export const profileName = (id) => PROFILES.find((p) => p.id === id)?.name || id || '—';

/** Un objet est visible s'il est partagé ou s'il appartient au profil courant. */
export const visible = (o) => o.shared !== false || o.owner === state.profile;

/* ---------------------------- Bibliothèque ------------------------------ */
export async function addTracks(tracks, { dedupe = true } = {}) {
  const existing = new Map(state.tracks.map((t) => [fp(t), t]));
  const toAdd = [];
  let skipped = 0;
  for (const t of tracks) {
    if (!t.title && !t.artist) continue;
    const k = fp(t);
    if (dedupe && existing.has(k)) { skipped++; continue; }
    const rec = { ...t, id: t.id || uid(), fingerprint: k, owner: t.owner || state.profile };
    existing.set(k, rec);
    toAdd.push(rec);
  }
  if (toAdd.length) {
    await db.bulkPut('tracks', toAdd);
    state.tracks = state.tracks.concat(toAdd);
  }
  emit('tracks');
  return { added: toAdd.length, skipped };
}

const fp = (t) => (String(t.title || '').toLowerCase().replace(/\s+/g, ' ').trim() + '|' +
                   String(t.artist || '').toLowerCase().replace(/\s+/g, ' ').trim());

export async function updateTrack(id, patch) {
  const i = state.tracks.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const t = { ...state.tracks[i], ...patch };
  t.fingerprint = fp(t);
  state.tracks[i] = t;
  await db.put('tracks', t);
  emit('tracks');
  return t;
}

export async function removeTracks(ids) {
  const set = new Set(ids);
  await db.bulkDelete('tracks', ids);
  state.tracks = state.tracks.filter((t) => !set.has(t.id));
  emit('tracks');
}

export const trackById = (id) => state.tracks.find((t) => t.id === id) || null;

export async function clearLibrary() {
  await db.clearStore('tracks');
  state.tracks = [];
  emit('tracks');
}

/* ------------------------------- Matchs --------------------------------- */
export function newMatch(name, rows, meta = {}) {
  return {
    id: uid(), kind: 'match', name, rows, ...meta,
    owner: state.profile, shared: true,
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
