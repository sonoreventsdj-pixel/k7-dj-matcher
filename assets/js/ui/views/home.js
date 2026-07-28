/* Accueil : état des lieux + raccourcis vers le parcours principal. */

import { h, mount, icon, fmtDateTime } from '../../core/util.js';
import * as store from '../../core/store.js';
import * as memory from '../../lib/memory.js';
import { summarize } from '../../lib/matching.js';
import { btn } from '../components.js';
import { importDialog } from './library.js';

const go = (v) => document.dispatchEvent(new CustomEvent('nav', { detail: v }));

export function render(root) {
  const nTracks = store.state.tracks.length;
  const lastMatch = store.state.matches[0] || null;
  const lastSet = store.state.setlists[0] || null;

  const hero = h('div.hero', {},
    h('h2', { text: `Bonjour ${store.profile().name} 👋` }),
    h('p', { text: nTracks
      ? 'Colle une URL de playlist Spotify ou Deezer : on la confronte à ta bibliothèque, tu valides les bonnes versions, et l\'outil s\'en souvient pour la prochaine fois.'
      : 'Première étape : importe ta bibliothèque Serato ou iTunes. Ensuite tu pourras matcher n\'importe quelle playlist Spotify ou Deezer.' }),
    h('div.row', {},
      nTracks
        ? btn('Matcher une playlist', { variant: 'btn-primary', ico: 'match', onClick: () => go('matcher') })
        : btn('Importer ma bibliothèque', { variant: 'btn-primary', ico: 'upload', onClick: () => importDialog(null, () => render(root)) }),
      btn('Construire une setlist', { ico: 'setlist', onClick: () => go('setlist') })));

  const tiles = h('div.cols-3', { style: { marginTop: '16px' } },
    tile('library', 'var(--grad-blue)', 'Bibliothèque',
      nTracks ? `${nTracks.toLocaleString('fr-FR')} morceaux` : 'Vide — à importer',
      'Serato « database V2 », iTunes XML, CSV.', () => go('library')),
    tile('match', 'var(--grad-purple)', 'Matcher',
      lastMatch ? lastMatch.name : 'Aucun match',
      lastMatch ? matchLine(lastMatch) : 'Playlist Spotify / Deezer → ta bibliothèque.', () => go('matcher')),
    tile('setlist', 'var(--grad-green)', 'Setlist',
      lastSet ? lastSet.name : 'Aucune setlist',
      lastSet ? `${lastSet.items.length} morceaux · ${fmtDateTime(lastSet.updatedAt)}` : 'Camelot, BPM, énergie, drag & drop.', () => go('setlist')));

  const memCard = h('div.tile', { style: { marginTop: '16px' } },
    h('div.ico', { style: { background: 'var(--grad-mixed)' } }, icon('check', 20)),
    h('div', { style: { minWidth: '0' } },
      h('h3', { text: 'Mémoire des correspondances' }),
      h('p.muted.small', { id: 'home-memory', text: 'Chargement…' })),
    h('div.spacer'),
    btn('Gérer', { sm: true, onClick: () => go('settings') }));
  (async () => {
    await memory.load();
    const el = document.getElementById('home-memory');
    if (el) el.textContent = memory.size()
      ? `${memory.size()} choix de version mémorisés — ils seront réappliqués automatiquement.`
      : 'Aucun choix mémorisé pour l\'instant. Valide des versions dans le Matcher.';
  })();

  mount(root, h('div', {}, hero, tiles, memCard));
}

function matchLine(m) {
  const s = summarize(m.rows);
  return `${s.matched} matchés · ${s.review} à vérifier · ${s.missing} à récupérer`;
}

function tile(ico, grad, title, main, sub, onClick) {
  const t = h('div.tile', { style: { cursor: 'pointer' }, onclick: onClick },
    h('div.ico', { style: { background: grad } }, icon(ico, 20)),
    h('div', { style: { minWidth: '0' } },
      h('h3', { text: title }),
      h('div.truncate', { style: { fontWeight: '600', marginTop: '2px' }, text: main }),
      h('p.muted.small', { style: { marginTop: '3px' }, text: sub })));
  return t;
}
