/* Extraits de 30 secondes.
   On cherche le titre dans le catalogue public de Deezer (recherche officielle,
   sans compte) et on lit l'extrait fourni par Deezer. Les liens d'extrait
   expirent : on les redemande à chaque écoute plutôt que de les mémoriser.
   Un seul extrait joue à la fois. */

let seq = 0;
function jsonp(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const cb = '__k7prev' + (++seq) + '_' + Date.now().toString(36);
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('Deezer ne répond pas.')); }, timeout);
    function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Recherche Deezer bloquée.')); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb;
    document.head.append(script);
  });
}

const clean = (s) => String(s || '')
  .replace(/\((?:[^)]*\b(?:extended|edit|mix|remaster(?:ed)?|version|clean|dirty|by fuvi clan)\b[^)]*)\)/gi, ' ')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '')
  .replace(/["“”]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Trouve l'extrait Deezer le plus proche de « artiste – titre ». */
export async function findPreview(artist, title) {
  const a = clean(artist).split(/\s*(?:,|&| x | et )\s*/i)[0];
  const t = clean(title);
  const queries = [
    `artist:"${a}" track:"${t}"`,
    `${a} ${t}`,
    t,
  ].filter((q) => q.trim());
  for (const q of queries) {
    const res = await jsonp('https://api.deezer.com/search?limit=10&q=' + encodeURIComponent(q));
    const list = (res?.data || []).filter((x) => x.preview);
    if (!list.length) continue;
    const na = norm(a), nt = norm(t);
    const scored = list.map((x) => {
      const xa = norm(x.artist?.name), xt = norm(x.title_short || x.title);
      let s = 0;
      if (xt === nt) s += 2; else if (xt.includes(nt) || nt.includes(xt)) s += 1;
      if (na && (xa === na || xa.includes(na) || na.includes(xa))) s += 2;
      return { x, s };
    }).sort((p, q) => q.s - p.s);
    if (scored[0].s >= 2 || q === queries[queries.length - 1]) {
      const x = scored[0].x;
      return { url: x.preview, label: `${x.artist?.name || ''} – ${x.title}`, exact: scored[0].s >= 4 };
    }
  }
  return null;
}

/* ----------------------------- Lecteur unique ---------------------------- */
let audio = null;
let current = null;           // clé du titre en cours
const listeners = new Set();

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) fn(current); };
export const playingKey = () => current;

export function stop() {
  if (audio) { audio.pause(); audio.src = ''; }
  current = null; emit();
}

/** Lance (ou arrête si déjà en cours) l'extrait d'un titre. */
export async function toggle(key, artist, title) {
  if (current === key) { stop(); return null; }
  stop();
  current = key; emit();
  const found = await findPreview(artist, title).catch(() => null);
  if (current !== key) return found;            // l'utilisateur a cliqué ailleurs entre-temps
  if (!found) { current = null; emit(); throw new Error('Aucun extrait trouvé pour ce titre.'); }
  audio = audio || new Audio();
  audio.src = found.url;
  audio.onended = () => { if (current === key) { current = null; emit(); } };
  await audio.play().catch(() => { current = null; emit(); throw new Error('Lecture impossible.'); });
  return found;
}
