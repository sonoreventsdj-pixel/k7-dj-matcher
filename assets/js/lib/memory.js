/* Mémoire des correspondances.
   Dès que Kévin ou Andy valide une version pour un titre, le choix est retenu.
   La prochaine fois que ce titre réapparaît dans une playlist, il est
   automatiquement re-appliqué (version principale + alternatives).

   La mémoire est propre à chaque profil : elle pointe vers des morceaux de SA
   bibliothèque, le choix d'Andy n'a donc aucun sens dans l'espace de Kévin. */

import * as db from '../core/db.js';
import { baseTitle, norm } from './matching.js';

/** Clé stable pour un titre de playlist, indépendante de la version, propre à un profil. */
export function memoryKey(source, owner) {
  return (owner || 'kevin') + '::' + baseTitle(source.title) + '::' + norm(source.artist);
}

let cache = null;   // Map<key, decision>

export async function load() {
  if (cache) return cache;
  const rows = await db.all('decisions');
  cache = new Map(rows.map((d) => [d.key, d]));
  await migrate();
  return cache;
}

/**
 * Les premières décisions ont été enregistrées avant la séparation des espaces :
 * leur clé n'a pas de préfixe de profil. On les rattache à leur propriétaire.
 */
async function migrate() {
  const old = [...cache.values()].filter((d) => (d.key.match(/::/g) || []).length < 2);
  if (!old.length) return;
  for (const d of old) {
    const owner = d.owner || 'kevin';
    const fresh = { ...d, owner, key: owner + '::' + d.key };
    cache.delete(d.key);
    await db.del('decisions', d.key);
    cache.set(fresh.key, fresh);
    await db.put('decisions', fresh);
  }
}

/** Décisions d'un profil (le profil actif par défaut). */
export const listFor = (owner) =>
  (cache ? [...cache.values()] : []).filter((d) => (d.owner || 'kevin') === owner)
    .sort((a, b) => b.updatedAt - a.updatedAt);

export const sizeFor = (owner) => listFor(owner).length;

export const size = () => (cache ? cache.size : 0);
export const list = () => (cache ? [...cache.values()].sort((a, b) => b.updatedAt - a.updatedAt) : []);

export async function remember(source, { chosenId, altIds = [], owner }) {
  const map = await load();
  const key = memoryKey(source, owner);
  const prev = map.get(key);
  const d = {
    key,
    title: source.title,
    artist: source.artist || '',
    chosenId: chosenId ?? null,
    altIds: [...new Set(altIds)],
    hits: (prev?.hits || 0) + 1,
    owner: owner || prev?.owner || null,
    createdAt: prev?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  map.set(key, d);
  await db.put('decisions', d);
  return d;
}

export async function forget(key) {
  const map = await load();
  map.delete(key);
  await db.del('decisions', key);
}

/** Oublie tout, pour un profil donné. */
export async function forgetAll(owner) {
  const map = await load();
  for (const d of listFor(owner)) { map.delete(d.key); await db.del('decisions', d.key); }
}

export function recall(source, owner) {
  if (!cache) return null;
  return cache.get(memoryKey(source, owner)) || null;
}

/**
 * Applique la mémoire à une ligne de résultat.
 * - remonte la version mémorisée en tête des candidats (même si le score était plus bas)
 * - marque la ligne comme confirmée
 * @returns true si une décision a été appliquée
 */
export function apply(row, libraryIds, owner) {
  const d = recall(row.source, owner);
  if (!d) return false;

  const stillThere = (id) => id && libraryIds.has(id);

  if (d.chosenId === null) {
    // Décision mémorisée : « aucune correspondance »
    row.chosenId = null; row.altIds = []; row.status = 'missing';
    row.confirmed = true; row.fromMemory = true;
    return true;
  }
  if (!stillThere(d.chosenId)) return false;

  // On s'assure que le morceau mémorisé figure bien dans les candidats.
  if (!row.candidates.some((c) => c.track.id === d.chosenId)) {
    const t = row.libraryById?.get(d.chosenId);
    if (t) row.candidates.unshift({ track: t, score: 1, sameVariant: true, fromMemory: true });
  }
  row.chosenId = d.chosenId;
  row.altIds = (d.altIds || []).filter(stillThere);
  row.status = 'matched';
  row.confirmed = true;
  row.fromMemory = true;
  return true;
}
