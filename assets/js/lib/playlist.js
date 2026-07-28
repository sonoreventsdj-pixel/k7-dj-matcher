/* Récupération d'une playlist à partir de son URL, sans backend.

   Deezer  : API publique en JSONP -> aucune configuration, ça marche tout de suite.
   Spotify : autorisation « Authorization Code with PKCE », 100 % côté navigateur,
             avec seulement un Client ID (jamais de secret). À configurer une fois
             dans Réglages : créer une app gratuite sur developer.spotify.com,
             y déclarer l'URL de redirection = l'URL de cette application. */

import * as db from '../core/db.js';

/* ------------------------------ Détection ------------------------------- */
/** Liens de partage raccourcis : l'identifiant est caché derrière une redirection. */
const SHORT_LINK = /^https?:\/\/(link\.deezer\.com\/s\/|deezer\.page\.link\/|dzr\.page\.link\/|spotify\.link\/|spoti\.fi\/)/i;
export const isShortLink = (url) => SHORT_LINK.test(String(url || '').trim());

export function detectPlaylist(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  if (isShortLink(u)) return { provider: 'short', url: u };

  let m = u.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]+)/i)
       || u.match(/^spotify:playlist:([A-Za-z0-9]+)$/i);
  if (m) return { provider: 'spotify', id: m[1] };

  m = u.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/([A-Za-z0-9]+)/i);
  if (m) return { provider: 'spotify', id: m[1], kind: 'album' };

  m = u.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i);
  if (m) return { provider: 'deezer', id: m[1] };

  m = u.match(/deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/i);
  if (m) return { provider: 'deezer', id: m[1], kind: 'album' };

  return null;
}

/* -------------------------------- Deezer -------------------------------- */
let jsonpSeq = 0;
function jsonp(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const cb = '__slsjsonp' + (++jsonpSeq) + '_' + Date.now().toString(36);
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('Deezer ne répond pas.')); }, timeout);
    function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Requête Deezer bloquée.')); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb;
    document.head.append(script);
  });
}

async function fetchDeezer({ id, kind }) {
  const base = `https://api.deezer.com/${kind === 'album' ? 'album' : 'playlist'}/${id}`;
  const head = await jsonp(base);
  if (head?.error) throw new Error(head.error.message || 'Playlist Deezer introuvable ou privée.');

  const entries = [];
  let data = head.tracks?.data || [];
  entries.push(...data);

  // Pagination
  let next = head.tracks?.next;
  let guard = 0;
  while (next && guard++ < 20) {
    const page = await jsonp(next.replace(/^http:/, 'https:'));
    if (!page?.data?.length) break;
    entries.push(...page.data);
    next = page.next;
  }

  return {
    name: head.title || 'Playlist Deezer',
    entries: entries.map((t) => ({
      title: t.title_short || t.title || '',
      artist: t.artist?.name || '',
      album: t.album?.title || '',
      duration: t.duration || null,
    })).filter((e) => e.title),
  };
}

/* -------------------------------- Spotify ------------------------------- */
const SPOTIFY_AUTH = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN = 'https://accounts.spotify.com/api/token';
const SCOPES = 'playlist-read-private playlist-read-collaborative';

export const redirectUri = () => location.origin + location.pathname;

export const getClientId = () => db.getMeta('spotifyClientId', '');
export const setClientId = (v) => db.setMeta('spotifyClientId', String(v || '').trim());

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(n = 64) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[b % 66]).join('');
}

export async function isConnected() {
  const t = await db.getMeta('spotifyToken', null);
  return !!(t && t.refresh_token);
}

/** Démarre le flux PKCE. La page est redirigée puis revient avec ?code=… */
export async function connectSpotify(returnTo = '') {
  const clientId = await getClientId();
  if (!clientId) throw new Error('Renseigne d\'abord ton Client ID Spotify dans Réglages.');
  const verifier = randomString();
  const challenge = await sha256(verifier);
  await db.setMeta('spotifyVerifier', verifier);
  await db.setMeta('spotifyReturn', returnTo);

  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  location.assign(SPOTIFY_AUTH + '?' + p);
}

/** À appeler au démarrage : consomme ?code=… s'il est présent. */
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const err = params.get('error');
  if (err) { history.replaceState({}, '', redirectUri()); throw new Error('Autorisation Spotify refusée.'); }
  if (!code) return null;

  const clientId = await getClientId();
  const verifier = await db.getMeta('spotifyVerifier', '');
  history.replaceState({}, '', redirectUri());
  if (!clientId || !verifier) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const res = await fetch(SPOTIFY_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Spotify a refusé la connexion (vérifie le Client ID et l\'URL de redirection).');
  const token = await res.json();
  token.expires_at = Date.now() + (token.expires_in - 60) * 1000;
  await db.setMeta('spotifyToken', token);
  await db.setMeta('spotifyVerifier', '');
  return await db.getMeta('spotifyReturn', '');
}

async function accessToken() {
  let t = await db.getMeta('spotifyToken', null);
  if (!t) throw new Error('NOT_CONNECTED');
  if (t.expires_at && Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) throw new Error('NOT_CONNECTED');

  const clientId = await getClientId();
  const res = await fetch(SPOTIFY_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: t.refresh_token }),
  });
  if (!res.ok) { await db.setMeta('spotifyToken', null); throw new Error('NOT_CONNECTED'); }
  const nt = await res.json();
  nt.refresh_token = nt.refresh_token || t.refresh_token;
  nt.expires_at = Date.now() + (nt.expires_in - 60) * 1000;
  await db.setMeta('spotifyToken', nt);
  return nt.access_token;
}

export async function disconnectSpotify() { await db.setMeta('spotifyToken', null); }

async function spotifyGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 401) throw new Error('NOT_CONNECTED');
  if (res.status === 404) throw new Error('Playlist introuvable (ou non accessible avec ce compte).');
  if (!res.ok) throw new Error('Spotify a répondu ' + res.status + '.');
  return res.json();
}

async function fetchSpotify({ id, kind }, onProgress) {
  const token = await accessToken();
  const isAlbum = kind === 'album';
  const head = await spotifyGet(`https://api.spotify.com/v1/${isAlbum ? 'albums' : 'playlists'}/${id}`, token);

  const entries = [];
  const pushItems = (items) => {
    for (const it of items) {
      const t = isAlbum ? it : it.track;
      if (!t || t.is_local === undefined && !t.name) continue;
      if (!t.name) continue;
      entries.push({
        title: t.name,
        artist: (t.artists || []).map((a) => a.name).join(', '),
        album: t.album?.name || head.name || '',
        duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
      });
    }
  };
  pushItems((isAlbum ? head.tracks?.items : head.tracks?.items) || []);
  let next = head.tracks?.next;
  let guard = 0;
  while (next && guard++ < 40) {
    const page = await spotifyGet(next, token);
    pushItems(page.items || []);
    onProgress?.(entries.length, head.tracks?.total || entries.length);
    next = page.next;
  }
  return { name: head.name || 'Playlist Spotify', entries };
}

/* ------------------------- Liens de partage courts ---------------------- */
/**
 * Les liens « Partager » de Deezer et Spotify (link.deezer.com/s/…, spotify.link/…)
 * cachent l'identifiant derrière une redirection. Le navigateur ne peut pas la suivre
 * lui-même (CORS). On passe par une petite fonction serverless Netlify, incluse dans
 * le projet et gratuite ; si elle n'est pas disponible (ouverture en local, autre
 * hébergeur), on renvoie une erreur explicite avec la marche à suivre.
 */
export async function resolveShortLink(url) {
  try {
    const res = await fetch('/.netlify/functions/resolve?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const { url: finalUrl } = await res.json();
      if (finalUrl && detectPlaylist(finalUrl)?.provider !== 'short') return finalUrl;
    }
  } catch { /* on bascule sur le message d'aide */ }

  const e = new Error('SHORT_LINK');
  e.shortLink = url;
  throw e;
}

/* ------------------------------ Façade ---------------------------------- */
/** @returns {{provider, name, entries:[{title,artist,album,duration}]}} */
export async function fetchPlaylist(url, onProgress) {
  let target = detectPlaylist(url);
  if (!target) throw new Error('URL non reconnue. Attendu : une playlist Spotify ou Deezer.');

  if (target.provider === 'short') {
    onProgress?.(0, 0, 'Résolution du lien de partage…');
    const finalUrl = await resolveShortLink(target.url);
    target = detectPlaylist(finalUrl);
    if (!target || target.provider === 'short') throw new Error('Ce lien de partage ne pointe pas vers une playlist.');
  }

  if (target.provider === 'deezer') return { provider: 'deezer', ...(await fetchDeezer(target)) };
  return { provider: 'spotify', ...(await fetchSpotify(target, onProgress)) };
}
