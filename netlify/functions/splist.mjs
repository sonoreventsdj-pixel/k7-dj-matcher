/* Passerelle Spotify — lecture du contenu public sans authentification.

   Découverte : la page « embed » d'une playlist ou d'un album
   (https://open.spotify.com/embed/playlist/<id>) sert le contenu complet dans un
   bloc JSON `__NEXT_DATA__`, accessible ANONYMEMENT, sans token ni secret.
   C'est le rendu côté serveur de Next.js qui l'y dépose.

   Cette voie contourne toutes les restrictions de l'API REST (statut de l'app,
   propriété de la playlist, Extended Quota Mode) : on lit la même chose que
   n'importe quel visiteur qui ouvre le lecteur intégré.

   Limite : la page embed plafonne à 100 titres. Au-delà, on complète avec
   l'endpoint interne « pathfinder » quand un token anonyme est disponible.

   Aucune configuration requise. Appels :
     /.netlify/functions/splist?playlist=<id>
     /.netlify/functions/splist?album=<id>
*/

const VERSION = 'embed-1';

const CORS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'cache-control': 'public, max-age=300',
};
const json = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Récupère et parse le __NEXT_DATA__ de la page embed. */
async function fetchEmbed(kind, id) {
  const url = `https://open.spotify.com/embed/${kind}/${id}`;
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'fr,en;q=0.8' } });
  if (res.status === 404) { const e = new Error('NOT_FOUND'); throw e; }
  if (!res.ok) { const e = new Error('EMBED_' + res.status); e.status = res.status; throw e; }
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) { const e = new Error('NO_DATA'); throw e; }
  return JSON.parse(m[1]);
}

const mapTrack = (t) => (t && (t.title || t.name) ? {
  title: t.title || t.name,
  artist: t.subtitle || (t.artists || []).map((a) => a.name).join(', ') || '',
  album: '',
  duration: t.duration ? Math.round(t.duration / 1000) : null,
  uri: t.uri || null,
} : null);

/* --------------------- Extension au-delà de 100 titres ------------------- */
/* La page embed plafonne à 100. Le lecteur web complet, lui, pagine via un
   endpoint GraphQL interne (« pathfinder ») avec un token anonyme obtenu sur
   open.spotify.com. On tente cette voie en complément ; si elle échoue, on
   garde au moins les 100 premiers de l'embed. */

async function anonToken() {
  try {
    const r = await fetch('https://open.spotify.com/', { headers: { 'user-agent': UA } });
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (m) {
      const j = JSON.parse(m[1]);
      const tok = j?.props?.pageProps?.state?.session?.accessToken
               || j?.props?.pageProps?.state?.settings?.session?.accessToken;
      if (tok) return tok;
    }
  } catch { /* ignore */ }
  try {
    const r = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web-player', { headers: { 'user-agent': UA } });
    if (r.ok) { const j = await r.json(); if (j.accessToken) return j.accessToken; }
  } catch { /* ignore */ }
  return null;
}

async function fetchAllViaPathfinder(id, token) {
  const entries = [];
  const LIMIT = 100;
  for (let offset = 0; offset < 10000; offset += LIMIT) {
    const variables = encodeURIComponent(JSON.stringify({ uri: 'spotify:playlist:' + id, offset, limit: LIMIT }));
    const ext = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: '73a3b3470804983e4d55d83cd6cc99715019228fd999d51429cc69473a18789d' } }));
    const url = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=fetchPlaylistContents&variables=${variables}&extensions=${ext}`;
    const r = await fetch(url, {
      headers: { authorization: 'Bearer ' + token, 'user-agent': UA, 'app-platform': 'WebPlayer',
                 'content-type': 'application/json', 'accept': 'application/json' },
    });
    if (!r.ok) throw new Error('PATHFINDER_' + r.status);
    const j = await r.json();
    const content = j?.data?.playlistV2?.content;
    const items = content?.items || [];
    for (const it of items) {
      const d = it?.itemV2?.data || it?.item?.data;
      if (!d?.name) continue;
      entries.push({
        title: d.name,
        artist: (d.artists?.items || []).map((a) => a.profile?.name).filter(Boolean).join(', ')
             || (d.albumOfTrack ? '' : ''),
        album: d.albumOfTrack?.name || '',
        duration: d.trackDuration?.totalMilliseconds ? Math.round(d.trackDuration.totalMilliseconds / 1000) : null,
        uri: d.uri || null,
      });
    }
    const total = content?.totalCount ?? entries.length;
    if (entries.length >= total || !items.length) break;
  }
  return entries;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const q = event.queryStringParameters || {};
  const playlistId = (q.playlist || '').trim();
  const albumId = (q.album || '').trim();
  const id = playlistId || albumId;
  if (!id || !/^[A-Za-z0-9]{16,40}$/.test(id)) {
    return json(400, { error: 'Identifiant de playlist ou d\'album manquant ou invalide.', version: VERSION });
  }
  const kind = albumId && !playlistId ? 'album' : 'playlist';

  try {
    const data = await fetchEmbed(kind, id);
    const e = data?.props?.pageProps?.state?.data?.entity;
    if (!e) return json(422, { error: 'Structure de page inattendue.', version: VERSION });

    const name = e.name || e.title || (kind === 'album' ? 'Album Spotify' : 'Playlist Spotify');
    let entries = (e.trackList || []).map(mapTrack).filter(Boolean);
    let tronque = false;

    // Au-delà de 100 titres, on tente de compléter via pathfinder.
    if (kind === 'playlist' && entries.length >= 100) {
      try {
        const token = await anonToken();
        if (token) {
          const all = await fetchAllViaPathfinder(id, token);
          if (all.length > entries.length) entries = all;
          else tronque = true;
        } else tronque = true;
      } catch { tronque = true; }
    }

    if (!entries.length) return json(422, { error: 'Aucun titre lisible pour cette playlist.', name, version: VERSION });
    return json(200, { name, provider: 'spotify', entries, tronque, count: entries.length, version: VERSION });
  } catch (e) {
    if (e.message === 'NOT_FOUND') return json(404, { error: 'Playlist introuvable ou privée.', version: VERSION });
    if (e.message === 'NO_DATA') return json(502, { error: 'Impossible de lire la page Spotify.', version: VERSION });
    return json(502, { error: 'Spotify a répondu ' + (e.status || e.message) + '.', version: VERSION });
  }
};
