/* Vue Matchs : les rapprochements enregistrés — rouvrir, dupliquer,
   renommer, supprimer, privé / partagé. */

import { h, mount, toast, confirmDialog, promptDialog, popMenu, fmtDateTime } from '../../core/util.js';
import * as store from '../../core/store.js';
import { summarize } from '../../lib/matching.js';
import { btn, emptyState } from '../components.js';
import { openMatch } from './matcher.js';

export function render(root) {
  mount(root, h('div.card', {},
    h('div.card-head', {},
      h('div', {}, h('h2', { text: 'Matchs enregistrés' }),
        h('div.sub', { text: 'Rouvre un rapprochement pour ajuster les versions. Les matchs partagés sont visibles par Kévin et Andy.' }))),
    h('div.card-pad', {}, matchesPane(root))));
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
