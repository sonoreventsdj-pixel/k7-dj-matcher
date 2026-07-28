/* Vue Setlist : construction par glisser-déposer, suggestions harmoniques
   scorées, courbe d'énergie et suite des tonalités, exports CSV / PDF. */

import {
  h, mount, toast, modal, confirmDialog, promptDialog, popMenu, fmtDur, icon, debounce,
} from '../../core/util.js';
import * as store from '../../core/store.js';
import { compatibility, suggest, scoreClass } from '../../lib/scoring.js';
import { harmonicScore, toClassic, compatibleKeys } from '../../lib/camelot.js';
import { exportSetlistCSV, exportM3U8, printSetlist, slug } from '../../lib/exporters/index.js';
import { keyBadge, bpmBadge, energyDots, scoreRing, btn, emptyState, stat } from '../components.js';

const ui = { seedId: null, q: '', suggestFrom: 'last', selected: null };

export function render(root) {
  const sl = store.currentSetlist();
  if (!sl) return mount(root, noSetlist(root));

  const save = debounce(() => store.saveSetlist(sl), 350);
  const byId = new Map(store.state.tracks.map((t) => [t.id, t]));
  const items = sl.items.map((it) => byId.get(it.trackId)).filter(Boolean);

  const totalSec = items.reduce((a, t) => a + (t.duration || 0), 0);
  const avgBpm = items.filter((t) => t.bpm).length
    ? Math.round(items.filter((t) => t.bpm).reduce((a, t) => a + t.bpm, 0) / items.filter((t) => t.bpm).length) : 0;

  const header = h('div.card-head', {},
    h('div', {},
      h('h2', { text: sl.name }),
      h('div.sub', { text: `${items.length} morceaux · ${Math.round(totalSec / 60)} min${avgBpm ? ` · ${avgBpm} BPM moyen` : ''} · ${store.profileName(sl.owner)}${sl.shared === false ? ' · privée' : ' · partagée'}` })),
    h('div.row.row-tight',
      {},
      btn('Nouvelle', { ico: 'plus', onClick: () => createSetlist(root) }),
      btn('Changer', { sm: true, onClick: (e) => switchMenu(e.currentTarget, root) }),
      btn('', { ico: 'download', title: 'Exporter', onClick: (e) => exportMenu(e.currentTarget, sl, items) }),
      btn('', { ico: 'settings', title: 'Options', onClick: (e) => optionsMenu(e.currentTarget, sl, root) }),
    ));

  const left = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h3', { text: 'Ordre de passage' }),
      h('div.sub.small', { text: 'Glisse pour réordonner. Les transitions sont notées automatiquement.' }))),
    h('div.card-pad', {}, itemsList(sl, items, root, save)));

  const right = h('div.grid', {},
    energyCard(items),
    keyChainCard(items),
    suggestCard(sl, items, root, save));

  mount(root, h('div', {},
    h('div.card', { style: { marginBottom: '16px' } }, header),
    h('div.setlist-grid', {}, left, right)));
}

/* ---------------------------- Aucune setlist ---------------------------- */
function noSetlist(root) {
  return h('div.card.card-pad', {}, emptyState(
    'Aucune setlist',
    store.state.setlists.length ? 'Choisis une setlist existante ou crées-en une nouvelle.' : 'Crée ta première setlist, puis pioche dans la bibliothèque.',
    h('div.row', { style: { justifyContent: 'center' } },
      btn('Nouvelle setlist', { variant: 'btn-primary', ico: 'plus', onClick: () => createSetlist(root) }),
      store.state.setlists.length ? btn('Ouvrir une setlist', { onClick: (e) => switchMenu(e.currentTarget, root) }) : null)));
}

async function createSetlist(root) {
  const name = await promptDialog('Nouvelle setlist', '', 'Nom de la setlist');
  if (!name) return;
  const sl = store.newSetlist(name);
  await store.saveSetlist(sl);
  await store.setCurrentSetlist(sl.id);
  render(root);
}

function switchMenu(anchor, root) {
  const items = store.state.setlists.filter(store.visible).map((s) => ({
    label: `${s.name} (${s.items.length})`,
    onClick: async () => { await store.setCurrentSetlist(s.id); render(root); },
  }));
  popMenu(anchor, items.length ? [{ label: 'Setlists', header: true }, ...items] : [{ label: 'Aucune setlist', header: true }]);
}

function optionsMenu(anchor, sl, root) {
  popMenu(anchor, [
    { label: 'Renommer', onClick: async () => { const n = await promptDialog('Renommer', sl.name); if (n) { sl.name = n; await store.saveSetlist(sl); render(root); } } },
    { label: 'Modifier les notes', onClick: async () => { const n = await promptDialog('Notes de la setlist', sl.notes || '', 'Notes'); sl.notes = n || ''; await store.saveSetlist(sl); render(root); } },
    { label: sl.shared === false ? 'Rendre partagée' : 'Rendre privée', onClick: async () => { sl.shared = sl.shared === false; await store.saveSetlist(sl); toast(sl.shared === false ? 'Setlist privée' : 'Setlist partagée', 'ok'); render(root); } },
    { label: 'Dupliquer', onClick: async () => { const c = await store.duplicateSetlist(sl.id); if (c) { await store.setCurrentSetlist(c.id); render(root); } } },
    '-',
    { label: 'Vider la setlist', onClick: async () => { if (!await confirmDialog('Vider', 'Tous les morceaux seront retirés.')) return; sl.items = []; await store.saveSetlist(sl); render(root); } },
    { label: 'Supprimer la setlist', onClick: async () => { if (!await confirmDialog('Supprimer', `« ${sl.name} » sera supprimée.`)) return; await store.deleteSetlist(sl.id); render(root); } },
  ]);
}

/* ------------------------------ Liste ordonnée -------------------------- */
function itemsList(sl, items, root, save) {
  if (!items.length) {
    return emptyState('Setlist vide', 'Ajoute un morceau depuis les suggestions à droite, ou pioche dans la bibliothèque.',
      btn('Ajouter un morceau', { variant: 'btn-primary', ico: 'plus', onClick: () => pickTrack(sl, root, save) }));
  }
  const box = h('div');
  const rules = store.state.rules;

  items.forEach((t, i) => {
    if (i > 0) {
      const c = compatibility(items[i - 1], t, rules);
      const cls = scoreClass(c.score);
      box.append(h('div.trans.' + cls, {},
        h('div.bar'),
        h('span', { text: `${c.score}/100 — ${c.parts.key.label} · ${c.parts.bpm.label}` })));
    }
    const row = h('div.sl-item', { draggable: 'true', dataset: { idx: String(i) } },
      h('span.handle', { text: '⠿' }),
      h('span.pos', { text: String(i + 1) }),
      h('div.body', {},
        h('div.t', { text: t.title }),
        h('div.a', { text: t.artist || 'Artiste inconnu' })),
      h('div.row.row-tight',
        {},
        t.camelot ? keyBadge(t.camelot, { classic: false }) : null,
        t.bpm ? bpmBadge(t.bpm) : null,
        energyDots(t.energy),
        h('span.muted-3.small.mono', { text: fmtDur(t.duration) }),
        btn('', { ico: 'x', sm: true, title: 'Retirer', onClick: () => { sl.items.splice(i, 1); save(); render(root); } })));

    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      ui.seedId = t.id; ui.suggestFrom = 'selected'; render(root);
    });
    if (ui.seedId === t.id && ui.suggestFrom === 'selected') row.style.borderColor = 'var(--mp-primary)';

    /* Glisser-déposer */
    row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', () => row.classList.remove('over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault(); row.classList.remove('over');
      const from = Number(e.dataTransfer.getData('text/plain'));
      const to = i;
      if (Number.isNaN(from) || from === to) return;
      const [moved] = sl.items.splice(from, 1);
      sl.items.splice(to, 0, moved);
      save(); render(root);
    });
    box.append(row);
  });

  box.append(h('div.row', { style: { marginTop: '12px' } },
    btn('Ajouter un morceau', { ico: 'plus', sm: true, onClick: () => pickTrack(sl, root, save) })));
  return box;
}

/* ----------------------------- Courbe d'énergie ------------------------- */
function energyCard(items) {
  const card = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h3', { text: 'Courbe d\'énergie' }),
      h('div.sub.small', { text: 'Énergie 1-10 et BPM au fil du set' }))));
  const pad = h('div.card-pad');

  if (items.length < 2) {
    pad.append(h('p.muted.small', { text: 'Ajoute au moins deux morceaux pour voir la courbe.' }));
    card.append(pad); return card;
  }

  const W = 520, H = 130, m = { t: 12, r: 10, b: 18, l: 24 };
  const n = items.length;
  const x = (i) => m.l + (i / Math.max(1, n - 1)) * (W - m.l - m.r);
  const yE = (e) => H - m.b - ((Math.max(1, Math.min(10, e || 1)) - 1) / 9) * (H - m.t - m.b);

  const bpms = items.map((t) => t.bpm).filter(Boolean);
  const bMin = bpms.length ? Math.min(...bpms) : 0, bMax = bpms.length ? Math.max(...bpms) : 1;
  const yB = (b) => H - m.b - ((b - bMin) / Math.max(1, bMax - bMin)) * (H - m.t - m.b);

  const ptsE = items.map((t, i) => `${x(i)},${yE(t.energy)}`).join(' ');
  const ptsB = bpms.length > 1 ? items.map((t, i) => (t.bpm ? `${x(i)},${yB(t.bpm)}` : null)).filter(Boolean).join(' ') : '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'curve');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `
    <defs>
      <linearGradient id="egrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7C3AED" stop-opacity=".45"/>
        <stop offset="100%" stop-color="#7C3AED" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${[1, 4, 7, 10].map((e) => `<line x1="${m.l}" y1="${yE(e)}" x2="${W - m.r}" y2="${yE(e)}" stroke="var(--line)" stroke-width="1"/>
      <text x="2" y="${yE(e) + 3}" font-size="8" fill="var(--text-3)">${e}</text>`).join('')}
    <polygon points="${m.l},${H - m.b} ${ptsE} ${x(n - 1)},${H - m.b}" fill="url(#egrad)"/>
    ${ptsB ? `<polyline points="${ptsB}" fill="none" stroke="var(--mp-blue-2)" stroke-width="1.4" stroke-dasharray="4 3" opacity=".8"/>` : ''}
    <polyline points="${ptsE}" fill="none" stroke="#7C3AED" stroke-width="2.2" stroke-linejoin="round"/>
    ${items.map((t, i) => `<circle cx="${x(i)}" cy="${yE(t.energy)}" r="3" fill="#7C3AED"><title>${(t.title || '').replace(/[<&]/g, '')} — énergie ${t.energy ?? '?'}</title></circle>`).join('')}
  `;
  pad.append(svg, h('div.row.row-tight', { style: { marginTop: '8px' } },
    h('span.badge', { style: { background: 'color-mix(in srgb, #7C3AED 20%, transparent)', color: '#a78bfa' }, text: 'Énergie' }),
    bpms.length > 1 ? h('span.badge.badge-bpm', { text: `BPM ${bMin}→${bMax}` }) : null));
  card.append(pad);
  return card;
}

/* ---------------------------- Suite des tonalités ----------------------- */
function keyChainCard(items) {
  const card = h('div.card', {},
    h('div.card-head', {}, h('div', {}, h('h3', { text: 'Suite des tonalités' }),
      h('div.sub.small', { text: 'Les sauts risqués sont signalés en rouge' }))));
  const pad = h('div.card-pad');
  if (!items.length) { pad.append(h('p.muted.small', { text: 'Setlist vide.' })); card.append(pad); return card; }

  const chain = h('div.keychain');
  items.forEach((t, i) => {
    if (i > 0) {
      const hs = harmonicScore(items[i - 1].camelot, t.camelot);
      const col = hs.score >= 85 ? 'var(--ok)' : hs.score >= 60 ? 'var(--warn)' : 'var(--danger)';
      chain.append(h('span', { style: { color: col, fontSize: '13px', alignSelf: 'center' }, title: hs.label, text: '→' }));
    }
    chain.append(t.camelot ? keyBadge(t.camelot, { classic: false }) : h('span.badge.muted-3', { text: '?' }));
  });
  pad.append(chain);

  const bad = items.slice(1).filter((t, i) => harmonicScore(items[i].camelot, t.camelot).score < 60).length;
  pad.append(h('p.muted.small', { style: { marginTop: '10px' },
    text: bad ? `${bad} transition(s) harmoniquement risquée(s).` : 'Toutes les transitions sont cohérentes.' }));
  card.append(pad);
  return card;
}

/* ------------------------------ Suggestions ----------------------------- */
function suggestCard(sl, items, root, save) {
  const rules = store.state.rules;
  const inSet = new Set(sl.items.map((i) => i.trackId));
  const last = items[items.length - 1] || null;
  const seed = ui.suggestFrom === 'selected' && ui.seedId
    ? store.trackById(ui.seedId)
    : last;

  const card = h('div.card', {},
    h('div.card-head', {},
      h('div', {},
        h('h3', { text: 'Morceaux compatibles' }),
        h('div.sub.small', { text: seed ? `À partir de « ${seed.title} »` : 'Sélectionne un morceau de départ' })),
      seed && ui.suggestFrom === 'selected'
        ? btn('Depuis la fin', { sm: true, onClick: () => { ui.suggestFrom = 'last'; ui.seedId = null; render(root); } })
        : null));
  const pad = h('div.card-pad');

  if (!seed) {
    pad.append(h('p.muted.small', { text: 'Ajoute un premier morceau : les suggestions se calculent à partir du dernier titre de la setlist.' }),
      h('div.row', { style: { marginTop: '10px' } },
        btn('Choisir un morceau de départ', { variant: 'btn-primary', sm: true, ico: 'plus', onClick: () => pickTrack(sl, root, save) })));
    card.append(pad); return card;
  }

  const list = suggest(seed, store.state.tracks, rules, { limit: 12, exclude: inSet });
  if (!list.length) {
    pad.append(h('p.muted.small', { text: 'Aucun morceau compatible restant dans la bibliothèque.' }));
    card.append(pad); return card;
  }

  for (const s of list) {
    const t = s.track;
    pad.append(h('div.sugg', {},
      h('div', { style: { minWidth: '0' } },
        h('div.truncate', { style: { fontWeight: '600' }, text: t.title }),
        h('div.row.row-tight', { style: { marginTop: '3px' } },
          h('span.muted.small.truncate', { text: t.artist || '' }),
          t.camelot ? keyBadge(t.camelot, { classic: false }) : null,
          t.bpm ? bpmBadge(t.bpm) : null),
        h('div.why', { text: `${s.parts.key.label} · ${s.parts.bpm.label} · ${s.parts.energy.label}` })),
      scoreRing(s.score),
      btn('', { ico: 'plus', sm: true, title: 'Ajouter à la setlist', onClick: () => {
        sl.items.push({ trackId: t.id });
        ui.suggestFrom = 'last'; ui.seedId = null;
        save(); render(root);
      } })));
  }
  card.append(pad);
  return card;
}

/* --------------------------- Sélecteur de morceau ----------------------- */
function pickTrack(sl, root, save) {
  const listBox = h('div', { style: { maxHeight: '48vh', overflow: 'auto', marginTop: '12px' } });
  const search = h('input.input', { placeholder: 'Rechercher…' });
  const inSet = new Set(sl.items.map((i) => i.trackId));

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const list = store.state.tracks
      .filter((t) => !q || `${t.title} ${t.artist} ${t.genre} ${(t.tags || []).join(' ')}`.toLowerCase().includes(q))
      .slice(0, 120);
    listBox.textContent = '';
    if (!list.length) { listBox.append(h('p.muted.small', { text: 'Aucun morceau.' })); return; }
    for (const t of list) {
      listBox.append(h('div.sugg', { style: { gridTemplateColumns: '1fr auto' } },
        h('div', { style: { minWidth: '0' } },
          h('div.truncate', { style: { fontWeight: '600' }, text: t.title }),
          h('div.row.row-tight', { style: { marginTop: '3px' } },
            h('span.muted.small.truncate', { text: t.artist || '' }),
            t.camelot ? keyBadge(t.camelot, { classic: false }) : null,
            t.bpm ? bpmBadge(t.bpm) : null)),
        btn(inSet.has(t.id) ? 'Déjà dedans' : 'Ajouter', {
          sm: true, variant: inSet.has(t.id) ? 'btn-ghost' : 'btn-primary',
          onClick: () => { sl.items.push({ trackId: t.id }); inSet.add(t.id); save(); toast('Ajouté', 'ok'); draw(); render(root); },
        })));
    }
  };
  search.addEventListener('input', debounce(draw, 150));
  draw();

  modal({
    title: 'Ajouter depuis la bibliothèque',
    width: '620px',
    body: h('div', {}, h('div.search', {}, search), listBox),
    actions: [{ label: 'Fermer' }],
  });
}

/* -------------------------------- Exports ------------------------------- */
function exportMenu(anchor, sl, items) {
  popMenu(anchor, [
    { label: 'Exporter la setlist', header: true },
    { label: 'CSV (tableur)', onClick: () => exportSetlistCSV(sl, store.state.tracks) },
    { label: 'M3U8 (Rekordbox, iTunes)', onClick: () => exportM3U8(items, slug(sl.name) + '.m3u8') },
    { label: 'PDF imprimable (format cabine)', onClick: () => printSetlist(sl, store.state.tracks, { owner: store.profileName(sl.owner) }) },
  ]);
}
