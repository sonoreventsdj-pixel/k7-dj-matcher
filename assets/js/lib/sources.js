/* Sites de téléchargement (FuviClan, pools DJ…).
   K7 ne télécharge rien tout seul : les conditions de FuviClan interdisent de
   collecter des informations sans autorisation et de détourner le site de son
   usage normal (risque de suspension du compte). K7 ouvre donc le site sur la
   bonne recherche, et c'est Kévin qui télécharge depuis son compte.

   Adresse de recherche : mettre {q} là où doit aller « artiste titre ».
   Sans {q}, K7 ouvre l'adresse et copie la recherche dans le presse-papiers. */

import * as db from '../core/db.js';

export const DEFAULT_SOURCES = [
  { id: 'fuviclan', name: 'FuviClan', url: 'https://music.fuvi-clan.com/' },
];

let cache = null;

export async function list() {
  if (!cache) cache = await db.getMeta('downloadSources', null) || DEFAULT_SOURCES.map((s) => ({ ...s }));
  return cache;
}

export async function save(sources) {
  cache = sources.filter((s) => s.name?.trim() && /^https?:\/\//i.test(s.url || ''));
  await db.setMeta('downloadSources', cache);
  return cache;
}

/** Texte de recherche : artiste principal + titre sans les mentions de version. */
export function query(source) {
  const artist = String(source.artist || '').split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0];
  const title = String(source.title || '')
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '');
  return `${artist} ${title}`.replace(/\s+/g, ' ').trim();
}

/** Ouvre le site sur la recherche du titre. Renvoie true si la recherche a été copiée. */
export async function open(site, source) {
  const q = query(source);
  if (site.url.includes('{q}')) {
    window.open(site.url.replace('{q}', encodeURIComponent(q)), '_blank', 'noopener');
    return false;
  }
  try { await navigator.clipboard.writeText(q); } catch { /* presse-papiers refusé */ }
  window.open(site.url, '_blank', 'noopener');
  return true;
}
