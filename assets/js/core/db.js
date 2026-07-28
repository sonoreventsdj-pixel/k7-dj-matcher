/* Persistance locale — IndexedDB, zéro dépendance.
   Stores : tracks, matches, decisions, meta.
   (« setlists » subsiste dans le schéma pour ne pas casser les bases existantes.)
   L'API est volontairement proche d'un CRUD Supabase pour faciliter la v2. */

// Nom historique de la base : on ne le renomme pas, sinon les données déjà
// enregistrées par les navigateurs de Kévin et Andy deviendraient invisibles.
const DB_NAME = 'setlist-studio';
const DB_VERSION = 2;
export const STORES = ['tracks', 'setlists', 'matches', 'decisions', 'meta'];

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('tracks')) {
        const s = db.createObjectStore('tracks', { keyPath: 'id' });
        s.createIndex('owner', 'owner');
        s.createIndex('fingerprint', 'fingerprint');
      }
      if (!db.objectStoreNames.contains('setlists')) {
        const s = db.createObjectStore('setlists', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('matches')) {
        const s = db.createObjectStore('matches', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('decisions')) {
        const s = db.createObjectStore('decisions', { keyPath: 'key' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

export const all = (store) => tx(store).then((s) => wrap(s.getAll()));
export const get = (store, id) => tx(store).then((s) => wrap(s.get(id)));
export const put = (store, obj) => tx(store, 'readwrite').then((s) => wrap(s.put(obj)).then(() => obj));
export const del = (store, id) => tx(store, 'readwrite').then((s) => wrap(s.delete(id)));
export const clearStore = (store) => tx(store, 'readwrite').then((s) => wrap(s.clear()));
export const count = (store) => tx(store).then((s) => wrap(s.count()));

/** Écriture en masse dans une seule transaction (import de bibliothèque). */
export function bulkPut(store, objects) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const o of objects) s.put(o);
    t.oncomplete = () => res(objects.length);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export function bulkDelete(store, ids) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const id of ids) s.delete(id);
    t.oncomplete = () => res(ids.length);
    t.onerror = () => rej(t.error);
  }));
}

/* ------------------------------- Réglages ------------------------------- */
export const getMeta = (key, fallback = null) =>
  get('meta', key).then((r) => (r ? r.value : fallback));
export const setMeta = (key, value) => put('meta', { key, value });

/* --------------------------- Sauvegarde JSON ---------------------------- */
export async function exportAll() {
  const data = {};
  for (const s of STORES) data[s] = await all(s);
  return { app: 'setlist-studio', version: DB_VERSION, exportedAt: Date.now(), data };
}

export async function importAll(payload, { replace = false } = {}) {
  if (!payload || !payload.data) throw new Error('Fichier de sauvegarde invalide.');
  for (const s of STORES) {
    if (!payload.data[s]) continue;
    if (replace) await clearStore(s);
    await bulkPut(s, payload.data[s]);
  }
}
