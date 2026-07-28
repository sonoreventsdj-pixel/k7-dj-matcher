/* Vue Réglages : règles du moteur, thème, profils, sauvegarde / restauration,
   données de démonstration. */

import { h, mount, toast, confirmDialog, pickFile, readText, download } from '../../core/util.js';
import * as store from '../../core/store.js';
import * as db from '../../core/db.js';
import * as memory from '../../lib/memory.js';
import * as playlist from '../../lib/playlist.js';
import { exportJSON, toCSV } from '../../lib/exporters/index.js';
import { demoTracks, DEMO_PLAYLIST } from '../../core/seed.js';
import { btn } from '../components.js';

export function render(root) {

  /* ------------------------------ Apparence ----------------------------- */
  const appearance = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'Apparence' }),
      h('div.sub', { text: 'Charte My Projekt — thème sombre (application) ou clair (site).' }))),
    h('div.card-pad.row', {},
      btn('Sombre', { variant: store.state.theme === 'dark' ? 'btn-primary' : '', ico: 'moon', onClick: () => store.setTheme('dark') }),
      btn('Clair', { variant: store.state.theme === 'light' ? 'btn-primary' : '', ico: 'sun', onClick: () => store.setTheme('light') })));

  /* -------------------------------- Équipe ------------------------------ */
  const team = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'Équipe' }),
      h('div.sub', { text: 'Deux profils. Les matchs « partagés » sont visibles par les deux ; les matchs « privés » ne le sont que par leur auteur.' }))),
    h('div.card-pad.row', {}, store.PROFILES.map((p) =>
      h('button.profile-chip', {
        style: p.id === store.state.profile ? { borderColor: 'var(--mp-primary)' } : null,
        onclick: async () => { await store.setProfile(p.id); render(root); },
      },
        h('span.avatar.' + p.cls, { text: p.initials }),
        h('span', { text: p.name }),
        p.id === store.state.profile ? h('span.badge.badge-info', { text: 'actif' }) : null))));

  /* ------------------------------ Données ------------------------------- */
  const data = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'Données' }),
      h('div.sub', { text: `${store.state.tracks.length} morceaux · ${store.state.matches.length} matchs — tout est stocké dans ce navigateur (IndexedDB).` }))),
    h('div.card-pad.grid', { style: { gap: '14px' } },
      h('div.row', {},
        btn('Exporter une sauvegarde', { ico: 'download', onClick: async () => {
          exportJSON(await db.exportAll(), `k7-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
          toast('Sauvegarde téléchargée', 'ok');
        } }),
        btn('Restaurer une sauvegarde', { ico: 'upload', onClick: async () => {
          const f = await pickFile('.json');
          if (!f) return;
          try {
            const payload = JSON.parse(await readText(f));
            if (!await confirmDialog('Restaurer', 'Les données du fichier vont être ajoutées à celles déjà présentes.', 'Restaurer')) return;
            await db.importAll(payload);
            await store.init();
            toast('Sauvegarde restaurée', 'ok'); render(root);
          } catch (e) { toast('Fichier invalide : ' + e.message, 'err'); }
        } })),
      h('hr', { style: { border: 0, borderTop: '1px solid var(--line)' } }),
      h('div.row', {},
        btn('Charger le jeu de démonstration', { onClick: async () => {
          const tracks = demoTracks(store.state.profile);
          const res = await store.addTracks(tracks);
          toast(`${res.added} morceaux de démo importés`, 'ok');
          render(root);
        } }),
        btn('Copier la playlist de démo', { onClick: async () => {
          try { await navigator.clipboard.writeText(DEMO_PLAYLIST); toast('Playlist copiée — colle-la dans le Matcher', 'ok'); }
          catch { toast('Copie impossible, ouvre le README pour la liste.', 'err'); }
        } })),
      h('hr', { style: { border: 0, borderTop: '1px solid var(--line)' } }),
      h('div.row', {},
        btn('Vider la bibliothèque', { variant: 'btn-danger', onClick: async () => {
          if (!await confirmDialog('Vider la bibliothèque', 'Tous les morceaux seront supprimés.')) return;
          await store.clearLibrary(); toast('Bibliothèque vidée', 'ok'); render(root);
        } }),
        btn('Tout effacer', { variant: 'btn-danger', onClick: async () => {
          if (!await confirmDialog('Tout effacer', 'Bibliothèque, matchs, mémoire des correspondances et réglages seront supprimés définitivement.')) return;
          for (const s of db.STORES) await db.clearStore(s);
          await store.init(); toast('Données effacées', 'ok'); render(root);
        } }))));

  /* --------------------------- Mémoire des choix ------------------------ */
  const memBox = h('div.card-pad.grid', { style: { gap: '12px' } });
  const memCard = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'Mémoire des correspondances' }),
      h('div.sub', { text: 'Chaque version validée dans le Matcher est retenue et réappliquée automatiquement au match suivant.' }))),
    memBox);
  (async () => {
    await memory.load();
    const rows = memory.list();
    memBox.textContent = '';
    memBox.append(h('div.row', {},
      h('span.badge.badge-info', { text: `${rows.length} décision(s) mémorisée(s)` }),
      h('div.spacer'),
      btn('Exporter (CSV)', { sm: true, ico: 'download', disabled: !rows.length, onClick: () => {
        const byId = new Map(store.state.tracks.map((t) => [t.id, t]));
        const csv = toCSV(rows, [
          { key: 'title', label: 'Titre playlist' }, { key: 'artist', label: 'Artiste playlist' },
          { key: (d) => byId.get(d.chosenId)?.title || (d.chosenId ? '(morceau supprimé)' : 'À récupérer'), label: 'Version retenue' },
          { key: (d) => (d.altIds || []).map((i) => byId.get(i)?.title).filter(Boolean).join(' | '), label: 'Alternatives' },
          { key: 'hits', label: 'Validations' },
        ]);
        download('memoire-correspondances.csv', csv, 'text/csv;charset=utf-8');
      } }),
      btn('Tout oublier', { sm: true, variant: 'btn-danger', disabled: !rows.length, onClick: async () => {
        if (!await confirmDialog('Vider la mémoire', 'Les choix de version mémorisés seront perdus. Les matchs déjà enregistrés ne changent pas.')) return;
        await memory.forgetAll(); toast('Mémoire vidée', 'ok'); render(root);
      } })));

    if (!rows.length) { memBox.append(h('p.muted.small', { text: 'Aucune décision pour l\'instant. Valide des versions dans le Matcher.' })); return; }
    const byId = new Map(store.state.tracks.map((t) => [t.id, t]));
    const table = h('table.tbl', {},
      h('thead', {}, h('tr', {}, h('th', { text: 'Titre de la playlist' }), h('th', { text: 'Version retenue' }),
        h('th', { text: 'Alt.' }), h('th', { text: '' }))),
      h('tbody', {}, rows.slice(0, 60).map((d) => h('tr', {},
        h('td', {}, h('div', { style: { fontWeight: '600' }, text: d.title }), h('div.muted.small', { text: d.artist || '' })),
        h('td', {}, d.chosenId
          ? h('span', { text: byId.get(d.chosenId)?.title || '(morceau supprimé)' })
          : h('span.badge.badge-danger', { text: 'À récupérer' })),
        h('td.num', { text: String((d.altIds || []).length) }),
        h('td', {}, btn('', { ico: 'trash', sm: true, title: 'Oublier', onClick: async () => { await memory.forget(d.key); render(root); } }))))));
    memBox.append(h('div.table-wrap', { style: { maxHeight: '40vh' } }, table));
    if (rows.length > 60) memBox.append(h('p.muted-3.small', { text: `… et ${rows.length - 60} autres.` }));
  })();

  /* ------------------------------- Spotify ------------------------------ */
  const clientInput = h('input.input', { placeholder: 'Client ID Spotify', value: '' });
  const spotifyStatus = h('div.row.small');
  const spotifyCard = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'Connexion Spotify' }),
      h('div.sub', { text: 'Nécessaire uniquement pour lire une URL de playlist Spotify. Deezer fonctionne sans configuration.' }))),
    h('div.card-pad.grid', { style: { gap: '14px' } },
      h('ol.muted.small', { style: { margin: 0, paddingLeft: '18px', lineHeight: '1.9' } },
        h('li', {}, 'Va sur ', h('a', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noopener', text: 'developer.spotify.com/dashboard' }), ' et crée une application (gratuit).'),
        h('li', {}, 'Dans « Redirect URIs », colle exactement : ', h('code', { style: { background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '6px' }, text: playlistRedirect() })),
        h('li', {}, 'Coche « Web API », enregistre, puis copie le Client ID ci-dessous.')),
      h('div.field', {}, h('span.label', { text: 'Client ID' }), clientInput),
      h('div.row', {},
        btn('Enregistrer', { variant: 'btn-primary', onClick: async () => {
          await playlist.setClientId(clientInput.value);
          toast('Client ID enregistré', 'ok'); render(root);
        } }),
        btn('Connecter Spotify', { onClick: async () => {
          try { await playlist.connectSpotify('settings'); } catch (e) { toast(e.message, 'err'); }
        } }),
        btn('Déconnecter', { onClick: async () => { await playlist.disconnectSpotify(); toast('Déconnecté', 'ok'); render(root); } })),
      spotifyStatus));
  (async () => {
    clientInput.value = await playlist.getClientId();
    const ok = await playlist.isConnected();
    spotifyStatus.append(ok
      ? h('span.badge.badge-ok', { text: '✓ Compte Spotify connecté' })
      : h('span.badge.badge-warn', { text: 'Non connecté' }));
  })();

  /* -------------------------------- À propos ---------------------------- */
  const about = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'À propos' }))),
    h('div.card-pad', {},
      h('p.muted.small', { text: 'K7 — outil interne Sonor Events. Code original, habillage repris de la charte My Projekt. Fonctionne hors ligne : aucune donnée ne quitte ce navigateur.' }),
      h('p.muted-3.small', { style: { marginTop: '8px' }, text: 'v1 — persistance locale (IndexedDB). Le partage cloud Kévin ↔ Andy arrive en v2 via Supabase.' })));

  mount(root, h('div.grid', { style: { gap: '16px' } },
    memCard, spotifyCard, appearance, team, data, about));
}

const playlistRedirect = () => location.origin + location.pathname;
