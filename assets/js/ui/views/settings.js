/* Vue Réglages : règles du moteur, thème, profils, sauvegarde / restauration,
   données de démonstration. */

import { h, mount, toast, confirmDialog, pickFile, readText, download } from '../../core/util.js';
import * as store from '../../core/store.js';
import * as db from '../../core/db.js';
import * as memory from '../../lib/memory.js';
import { exportJSON, toCSV } from '../../lib/exporters/index.js';
import { demoTracks, DEMO_PLAYLIST } from '../../core/seed.js';
import * as playlist from '../../lib/playlist.js';
import * as sources from '../../lib/sources.js';
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
      h('div.sub', { text: 'Chacun son espace : sa bibliothèque, ses matchs, sa mémoire. Un match est privé par défaut ; on le partage à la demande depuis l\'onglet Matchs. La bibliothèque de l\'autre est consultable en lecture seule, avec copie possible.' }))),
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
      h('div.sub', { text: `${store.myTracks().length.toLocaleString('fr-FR')} morceaux et ${store.state.matches.filter((m) => (m.owner || 'kevin') === store.state.profile).length} match(s) dans ton espace · ${store.countTracks(store.otherProfile().id).toLocaleString('fr-FR')} morceaux dans celui de ${store.profileName(store.otherProfile().id)} — tout est stocké dans ce navigateur (IndexedDB).` }))),
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
      h('div.sub', { text: 'Chaque version validée dans le Matcher est retenue et réappliquée au match suivant. Cette mémoire est propre à ton profil : elle pointe vers TA bibliothèque.' }))),
    memBox);
  (async () => {
    await memory.load();
    const rows = memory.listFor(store.state.profile);
    memBox.textContent = '';
    memBox.append(h('div.row', {},
      h('span.badge.badge-info', { text: `${rows.length} décision(s) mémorisée(s)` }),
      h('div.spacer'),
      btn('Exporter (CSV)', { sm: true, ico: 'download', disabled: !rows.length, onClick: () => {
        const byId = new Map(store.myTracks().map((t) => [t.id, t]));
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
        await memory.forgetAll(store.state.profile); toast('Mémoire vidée', 'ok'); render(root);
      } })));

    if (!rows.length) { memBox.append(h('p.muted.small', { text: 'Aucune décision pour l\'instant. Valide des versions dans le Matcher.' })); return; }
    const byId = new Map(store.myTracks().map((t) => [t.id, t]));
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
  const compteRow = h('div.row.row-tight', {});
  const spotifyCard = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'Spotify & Deezer' }),
      h('div.sub', { text: 'Coller une URL de playlist suffit — rien à configurer.' }))),
    h('div.card-pad.grid', { style: { gap: '10px' } },
      h('div.row.row-tight', {}, h('span.badge.badge-ok', { text: '✓ Spotify' }),
        h('span.small.muted', { text: 'toute playlist publique, même celle de quelqu\'un d\'autre (jusqu\'à 100 titres).' })),
      h('div.row.row-tight', {}, h('span.badge.badge-ok', { text: '✓ Deezer' }),
        h('span.small.muted', { text: 'sans limite de titres.' })),
      compteRow));
  (async () => {
    const ok = await playlist.isConnected();
    compteRow.append(
      ok ? h('span.badge.badge-ok', { text: '✓ Compte connecté' }) : h('span.badge', { text: 'Compte non connecté' }),
      h('span.small.muted', { text: ok
        ? 'tes playlists se chargent en entier, même au-delà de 100 titres.'
        : 'connecte ton compte pour charger TES playlists en entier au-delà de 100 titres.' }),
      h('div.spacer'),
      ok
        ? btn('Déconnecter', { sm: true, onClick: async () => { await playlist.disconnectSpotify(); toast('Compte Spotify déconnecté', 'ok'); render(root); } })
        : btn('Connecter mon Spotify', { sm: true, variant: 'btn-primary', onClick: () => playlist.connectSpotify('settings') }));
  })();

  /* ------------------------ Sites de téléchargement --------------------- */
  const srcBox = h('div.card-pad.grid', { style: { gap: '10px' } });
  const srcCard = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'Sites de téléchargement' }),
      h('div.sub', { text: 'Pour chaque titre « À récupérer », K7 affiche un bouton par site qui ouvre la recherche du titre. Le téléchargement se fait depuis ton compte, comme d\'habitude.' }))),
    srcBox);
  (async () => {
    const list = (await sources.list()).map((x) => ({ ...x }));
    const draw = () => {
      srcBox.replaceChildren(
        ...list.map((site, i) => h('div.src-row', {},
          h('input.input', { value: site.name, placeholder: 'Nom (ex. FuviClan)', oninput: (e) => { site.name = e.target.value; } }),
          h('input.input', { value: site.url, placeholder: 'https://… — mets {q} à l\'endroit de la recherche', oninput: (e) => { site.url = e.target.value; } }),
          btn('', { ico: 'trash', sm: true, title: 'Retirer ce site', onClick: () => { list.splice(i, 1); draw(); } }))),
        h('p.muted-3.small', { text: 'Adresse avec {q} (ex. https://site.com/recherche?q={q}) : la recherche s\'ouvre directement. Sans {q} : K7 ouvre le site et copie « artiste titre », tu n\'as qu\'à coller.' }),
        h('div.row.row-tight', {},
          btn('Ajouter un site', { sm: true, ico: 'plus', onClick: () => { list.push({ id: 'site' + Date.now(), name: '', url: '' }); draw(); } }),
          h('div.spacer'),
          btn('Enregistrer', { sm: true, variant: 'btn-primary', ico: 'check', onClick: async () => {
            const saved = await sources.save(list);
            toast(`${saved.length} site(s) enregistré(s)`, 'ok');
          } })));
    };
    draw();
  })();

  /* -------------------------------- À propos ---------------------------- */
  const about = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h2', { text: 'À propos' }))),
    h('div.card-pad', {},
      h('p.muted.small', { text: 'K7 — outil interne Sonor Events. Code original, habillage repris de la charte My Projekt. Fonctionne hors ligne : aucune donnée ne quitte ce navigateur.' }),
      h('p.muted-3.small', { style: { marginTop: '8px' }, text: 'v1 — persistance locale (IndexedDB). Le partage cloud Kévin ↔ Andy arrive en v2 via Supabase.' })));

  mount(root, h('div.grid', { style: { gap: '16px' } },
    memCard, spotifyCard, srcCard, appearance, team, data, about));
}

