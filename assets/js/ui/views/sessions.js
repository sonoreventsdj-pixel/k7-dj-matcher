/* Vue Sessions : setlists et matchs enregistrés — charger, dupliquer,
   renommer, supprimer, privé / partagé. */

import { h, mount, toast, confirmDialog, promptDialog, popMenu, fmtDateTime } from '../../core/util.js';
import * as store from '../../core/store.js';
import { summarize } from '../../lib/matching.js';
import { btn, emptyState } from '../components.js';
import { openMatch } from './matcher.js';

let tab = 'setlists';

export function render(root) {
  const tabs = h('div.tabs', {},
    h('button' + (tab === 'setlists' ? '.active' : ''), { text: `Setlists (${store.state.setlists.length})`, onclick: () => { tab = 'setlists'; render(root); } }),
    h('button' + (tab === 'matches' ? '.active' : ''), { text: `Matchs (${store.state.matches.length})`, onclick: () => { tab = 'matches'; render(root); } }));

  const body = tab === 'setlists' ? setlistsPane(root) : matchesPane(root);

  mount(root, h('div.card', {},
    h('div.card-head', {},
      h('div', {}, h('h2', { text: 'Sessions' }),
        h('div.sub', { text: 'Tes setlists et tes matchs enregistrés. Les éléments partagés sont visibles par Kévin et Andy.' }))),
    h('div.card-pad', {}, tabs, h('div', { style: { marginTop: '18px' } }, body))));
}

/* ------------------------------ Setlists -------------------------------- */
function setlistsPane(root) {
  const list = store.state.setlists.filter(store.visible);
  if (!list.length) {
    return emptyState('Aucune setlist', 'Crée ta première setlist depuis l\'onglet Setlist.',
      btn('Aller à Setlist', { variant: 'btn-primary', onClick: () => document.dispatchEvent(new CustomEvent('nav', { detail: 'setlist' })) }));
  }
  const box = h('div');
  for (const s of list) {
    const isCur = s.id === store.state.currentSetlistId;
    box.append(h('div.sess', isCur ? { style: { borderColor: 'var(--mp-primary)' } } : {},
      h('span.avatar.' + (s.owner === 'andy' ? 'andy' : 'kevin'), { text: s.owner === 'andy' ? 'A' : 'K' }),
      h('div.body', {},
        h('div.t', {}, s.name, isCur ? h('span.badge.badge-info', { style: { marginLeft: '8px' }, text: 'ouverte' }) : null),
        h('div.m', { text: `${s.items.length} morceaux · ${store.profileName(s.owner)} · ${s.shared === false ? 'privée' : 'partagée'} · modifiée le ${fmtDateTime(s.updatedAt)}` })),
      btn('Ouvrir', { sm: true, variant: 'btn-primary', onClick: async () => {
        await store.setCurrentSetlist(s.id);
        document.dispatchEvent(new CustomEvent('nav', { detail: 'setlist' }));
      } }),
      btn('', { ico: 'settings', sm: true, onClick: (e) => popMenu(e.currentTarget, [
        { label: 'Renommer', onClick: async () => { const n = await promptDialog('Renommer', s.name); if (n) { s.name = n; await store.saveSetlist(s); render(root); } } },
        { label: 'Dupliquer', onClick: async () => { await store.duplicateSetlist(s.id); toast('Setlist dupliquée', 'ok'); render(root); } },
        { label: s.shared === false ? 'Rendre partagée' : 'Rendre privée', onClick: async () => { s.shared = s.shared === false; await store.saveSetlist(s); render(root); } },
        '-',
        { label: 'Supprimer', onClick: async () => { if (!await confirmDialog('Supprimer', `« ${s.name} » sera supprimée.`)) return; await store.deleteSetlist(s.id); toast('Supprimée', 'ok'); render(root); } },
      ]) })));
  }
  return box;
}

/* -------------------------------- Matchs -------------------------------- */
function matchesPane(root) {
  const list = store.state.matches.filter(store.visible);
  if (!list.length) {
    return emptyState('Aucun match', 'Lance un premier rapprochement depuis l\'onglet Matcher.',
      btn('Aller au Matcher', { variant: 'btn-primary', onClick: () => document.dispatchEvent(new CustomEvent('nav', { detail: 'matcher' })) }));
  }
  const box = h('div');
  for (const m of list) {
    const s = summarize(m.rows);
    box.append(h('div.sess', m.id === store.state.currentMatchId ? { style: { borderColor: 'var(--mp-primary)' } } : {},
      h('span.avatar.' + (m.owner === 'andy' ? 'andy' : 'kevin'), { text: m.owner === 'andy' ? 'A' : 'K' }),
      h('div.body', {},
        h('div.t', { text: m.name }),
        h('div.m', {},
          h('span', { text: `${s.total} titres · ` }),
          h('span', { style: { color: 'var(--ok)' }, text: `${s.matched} matchés` }),
          h('span', { text: ' · ' }),
          h('span', { style: { color: 'var(--warn)' }, text: `${s.review} à vérifier` }),
          h('span', { text: ' · ' }),
          h('span', { style: { color: 'var(--danger)' }, text: `${s.missing} à récupérer` }),
          h('span', { text: ` · ${fmtDateTime(m.updatedAt)}` }))),
      btn('Ouvrir', { sm: true, variant: 'btn-primary', onClick: async () => {
        await openMatch(m.id, root);
        document.dispatchEvent(new CustomEvent('nav', { detail: 'matcher' }));
      } }),
      btn('', { ico: 'settings', sm: true, onClick: (e) => popMenu(e.currentTarget, [
        { label: 'Renommer', onClick: async () => { const n = await promptDialog('Renommer', m.name); if (n) { m.name = n; await store.saveMatch(m); render(root); } } },
        { label: 'Dupliquer', onClick: async () => { await store.duplicateMatch(m.id); toast('Match dupliqué', 'ok'); render(root); } },
        { label: m.shared === false ? 'Rendre partagé' : 'Rendre privé', onClick: async () => { m.shared = m.shared === false; await store.saveMatch(m); render(root); } },
        '-',
        { label: 'Supprimer', onClick: async () => { if (!await confirmDialog('Supprimer', `« ${m.name} » sera supprimé.`)) return; await store.deleteMatch(m.id); toast('Supprimé', 'ok'); render(root); } },
      ]) })));
  }
  return box;
}
