/* Passerelle Spotify côté serveur (fonction Netlify, gratuite, sans dépendance).

   Pourquoi un serveur ?
   Depuis février 2026, l'API Spotify interrogée AU NOM D'UN UTILISATEUR ne livre
   le contenu d'une playlist que si celui-ci en est propriétaire ou collaborateur.
   Une playlist publique créée par quelqu'un d'autre renvoie 403.

   Le flux « Client Credentials » s'authentifie au nom de l'APPLICATION, sans
   utilisateur : la notion de propriétaire ne s'applique donc pas, et les
   playlists publiques redeviennent lisibles. Ce flux exige le client secret,
   qui ne doit jamais se trouver dans du code envoyé au navigateur — d'où cette
   fonction, où il reste côté serveur.

   Configuration (une seule fois, dans Netlify → Site configuration →
   Environment variables) :
     SPOTIFY_CLIENT_ID      = l'identifiant public de l'application
     SPOTIFY_CLIENT_SECRET  = le secret, visible via « View client secret »
                              sur le tableau de bord Spotify

   Appels :
     /.netlify/functions/spotify?playlist=<id>
     /.netlify/functions/spotify?album=<id>
*/

const VERSION = 'v1785280548';

const CORS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

const json = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

/* Le token dure une heure ; on le garde le temps de vie de l'instance. */
let cached = { token: null, expiresAt: 0 };

async function appToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    const e = new Error('NOT_CONFIGURED');
    e.detail = 'Renseigne SPOTIFY_CLIENT_ID et SPOTIFY_CLIENT_SECRET dans les variables d\'environnement Netlify.';
    throw e;
  }
  if (cached.token && Date.now() < cached.expiresAt) return cached.token;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const e = new Error('AUTH_FAILED');
    e.detail = 'Spotify a refusé les identifiants de l\'application (' + res.status + ').';
    throw e;
  }
  const t = await res.json();
  cached = { token: t.access_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000 };
  return cached.token;
}

async function api(url, token) {
  const res = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
  if (res.status === 404) { const e = new Error('NOT_FOUND'); throw e; }
  if (res.status === 429) {
    const e = new Error('RATE_LIMITED');
    e.retryAfter = res.headers.get('retry-after');
    throw e;
  }
  if (!res.ok) { const e = new Error('HTTP_' + res.status); e.status = res.status; throw e; }
  return res.json();
}

/* Un jeton applicatif n'est rattaché à aucun pays : Spotify exige alors
   souvent « market » pour servir les pistes. On essaie donc plusieurs
   formes, et on retient la première qui donne des titres. */
const CHEMINS = (isAlbum) => (isAlbum
  ? ['tracks?limit=50&market=FR', 'tracks?limit=50']
  : ['items?limit=50&market=FR', 'items?limit=50', 'tracks?limit=50&market=FR', 'tracks?limit=50']);

const mapTrack = (t, fallbackAlbum) => (t?.name ? {
  title: t.name,
  artist: (t.artists || []).map((a) => a.name).join(', '),
  album: t.album?.name || fallbackAlbum || '',
  duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
} : null);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const q = event.queryStringParameters || {};
  const playlistId = (q.playlist || '').trim();
  const albumId = (q.album || '').trim();
  const id = playlistId || albumId;
  if (!id || !/^[A-Za-z0-9]{10,40}$/.test(id)) {
    return json(400, { error: 'Identifiant de playlist ou d\'album manquant ou invalide.' });
  }
  const isAlbum = !!albumId && !playlistId;

  try {
    const token = await appToken();
    const base = `https://api.spotify.com/v1/${isAlbum ? 'albums' : 'playlists'}/${id}`;
    const head = await api(base, token);
    const name = head.name || (isAlbum ? 'Album Spotify' : 'Playlist Spotify');

    const entries = [];
    const push = (items) => {
      for (const it of items || []) {
        const m = mapTrack(isAlbum ? it : (it?.track || it?.item), isAlbum ? name : '');
        if (m) entries.push(m);
      }
    };

    const tentatives = [];
    if (head.tracks) tentatives.push('head.tracks[' + Object.keys(head.tracks).join(',') + ']');

    // 1) La première page est parfois incluse dans la réponse principale.
    push(head.tracks?.items);
    let next = head.tracks?.next;

    const paginer = async () => {
      let guard = 0;
      while (next && guard++ < 60) {
        const page = await api(next, token);
        push(page.items);
        next = page.next;
      }
    };
    if (next) { try { await paginer(); } catch (e) { tentatives.push('pagination=' + e.message); next = null; } }

    // 2) Toujours rien : on essaie les endpoints dédiés. « items » remplace
    //    « tracks » depuis février 2026, et un jeton applicatif n'étant lié à
    //    aucun pays, Spotify réclame souvent « market ».
    if (!entries.length) {
      for (const chemin of CHEMINS(isAlbum)) {
        const etiquette = chemin.split('?')[0] + (chemin.includes('market') ? '+market' : '');
        try {
          const first = await api(base + '/' + chemin, token);
          push(first.items);
          next = first.next;
          tentatives.push(etiquette + '=200/' + entries.length);
          if (entries.length) { await paginer(); break; }
        } catch (e) {
          tentatives.push(etiquette + '=' + e.message);
          if (!String(e.message).startsWith('HTTP_')) throw e;
        }
      }
    }

    if (!entries.length) {
      return json(422, {
        error: 'Spotify n\'a renvoyé aucun titre pour cette playlist.',
        name,
        proprietaire: head.owner?.display_name || head.owner?.id || null,
        tentatives,       // détail des appels, pour diagnostiquer sans tâtonner
        version: VERSION,
      });
    }
    return json(200, { name, provider: 'spotify', entries, version: VERSION });
  } catch (e) {
    if (e.message === 'NOT_CONFIGURED') return json(501, { error: 'PASSERELLE_NON_CONFIGUREE', detail: e.detail });
    if (e.message === 'AUTH_FAILED') return json(502, { error: 'AUTH_APPLICATION', detail: e.detail });
    if (e.message === 'NOT_FOUND') return json(404, { error: 'Playlist introuvable ou privée.' });
    if (e.message === 'RATE_LIMITED') return json(429, { error: 'Spotify limite les requêtes.', retryAfter: e.retryAfter });
    return json(502, { error: 'Spotify a répondu ' + (e.status || '?') + '.' });
  }
};
