/* Fonction serverless Netlify (free tier, zéro dépendance).
   Unique rôle : suivre la redirection d'un lien de partage court Deezer ou Spotify
   et renvoyer l'URL finale — ce que le navigateur ne peut pas faire lui-même à cause
   de CORS. Aucune donnée n'est stockée, seuls quelques domaines sont autorisés. */

const ALLOWED = [
  'link.deezer.com',
  'deezer.page.link',
  'dzr.page.link',
  'www.deezer.com',
  'deezer.com',
  'spotify.link',
  'spoti.fi',
  'open.spotify.com',
];

const CORS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=86400',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, OPTIONS' }, body: '' };
  }

  const raw = event.queryStringParameters?.url;
  if (!raw) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Paramètre « url » manquant.' }) };

  let target;
  try { target = new URL(raw); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'URL invalide.' }) }; }
  if (target.protocol !== 'https:' || !ALLOWED.includes(target.hostname)) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Domaine non autorisé.' }) };
  }

  try {
    // On suit les redirections manuellement : plus fiable et on reste dans la liste blanche.
    let url = target.toString();
    for (let i = 0; i < 6; i++) {
      const res = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SetlistStudio/1.0)' },
      });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, url);
        if (next.protocol !== 'https:' || !ALLOWED.includes(next.hostname)) break;
        url = next.toString();
        continue;
      }
      break;
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ url }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Résolution impossible : ' + e.message }) };
  }
};
