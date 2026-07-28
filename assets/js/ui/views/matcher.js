/* Vue Matcher — le cœur de l'outil.
   Parcours : bibliothèque (Serato / iTunes) -> URL de playlist Spotify ou Deezer
   -> analyse -> choix de la bonne version -> mémorisation du choix.
   La mémoire fait qu'un titre déjà arbitré est reconnu automatiquement la fois
   suivante, version principale ET alternatives comprises. */

import {
  h, mount, toast, modal, confirmDialog, promptDialog, popMenu, pickFile,
  readText, readBuffer, fmtDur, debounce, download,
} from '../../core/util.js';
import * as store from '../../core/store.js';
import * as memory from '../../lib/memory.js';
import { parseFile, tracksFromText, tracksFromCSV } from '../../lib/parsers/index.js';
import { matchPlaylist, summarize } from '../../lib/matching.js';
import { exportM3U8, toCSV, printShoppingList, slug } from '../../lib/exporters/index.js';
import * as playlist from '../../lib/playlist.js';
import { keyBadge, bpmBadge, btn, stat, emptyState } from '../components.js';
import { importDialog } from './library.js';

const ui = {
  screen: 'form',
  open: new Set(),
  filter: 'all',
  progress: 0,
  progressLabel: '',
  url: '',
  exportFormats: { m3u8: true, csv: false, pdf: true },
};

let session = null;

export function render(root) {
  const cur = store.currentMatch();
  if (cur && ui.screen === 'form' && !session) { session = cur; ui.screen = 'results'; }
  if (ui.screen === 'results' && !session) ui.screen = 'form';

  if (ui.screen === 'running') return mount(root, runningScreen());
  if (ui.screen === 'results') return mount(root, resultsScreen(root));
  return mount(root, formScreen(root));
}

/* ============================== Écran 1 ================================= */
function formScreen(root) {
  const urlInput = h('input.input', {
    placeholder: 'Colle ton lien de playlist (Spotify ou Deezer)',
    value: ui.url,
    oninput: (e) => { ui.url = e.target.value; },
  });
  const dedupe = h('input', { type: 'checkbox', checked: true });
  const nameInput = h('input.input', { placeholder: 'Nom du match — laissé vide, on reprend le nom de la playlist' });

  /* ---- État Spotify ---- */
  const spotifyBox = h('div.row.small.muted', { style: { marginTop: '6px' } });
  (async () => {
    const connected = await playlist.isConnected();
    const clientId = await playlist.getClientId();
    spotifyBox.textContent = '';
    if (connected) {
      spotifyBox.append(h('span.badge.badge-ok', { text: '✓ Spotify connecté' }),
        btn('Déconnecter', { sm: true, onClick: async () => { await playlist.disconnectSpotify(); render(root); } }));
    } else if (clientId) {
      spotifyBox.append(h('span.badge.badge-warn', { text: 'Spotify non connecté' }),
        btn('Connecter Spotify', { sm: true, variant: 'btn-primary', onClick: async () => {
          try { await playlist.connectSpotify('matcher'); } catch (e) { toast(e.message, 'err'); }
        } }));
    } else {
      spotifyBox.append(h('span.badge.badge-warn', { text: 'Spotify à configurer' }),
        h('span', { text: 'Deezer marche sans rien configurer.' }),
        btn('Configurer', { sm: true, onClick: () => document.dispatchEvent(new CustomEvent('nav', { detail: 'settings' })) }));
    }
  })();

  /* ---- Sources alternatives (repli) ---- */
  const textArea = h('textarea.textarea', {
    placeholder: 'Artiste - Titre\nArtiste - Titre (Extended Mix)\n…',
    style: { minHeight: '150px' },
  });
  const orderSel = h('select.select', { style: { width: 'auto' } },
    h('option', { value: 'artist-first', text: 'Artiste - Titre' }),
    h('option', { value: 'title-first', text: 'Titre - Artiste' }));

  let fileEntries = null;
  const drop = h('div.dropzone', { text: 'Ou dépose un fichier de playlist : CSV, M3U/M3U8, TXT' });
  drop.addEventListener('click', async () => {
    const f = await pickFile('.csv,.tsv,.txt,.m3u,.m3u8,.json');
    if (f) loadFile(f);
  });
  ['dragover', 'dragenter'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (ev) => { ev.preventDefault(); const f = ev.dataTransfer.files?.[0]; if (f) loadFile(f); });

  async function loadFile(file) {
    try {
      const { tracks, kind } = await parseFile(file, { readText, readBuffer, textOrder: orderSel.value });
      fileEntries = tracks;
      drop.textContent = `${file.name} — ${tracks.length} titre(s) · ${kind}`;
      if (!nameInput.value) nameInput.value = file.name.replace(/\.[a-z0-9]+$/i, '');
    } catch (e) { toast('Fichier illisible : ' + e.message, 'err'); }
  }

  const advanced = h('details', { style: { marginTop: '4px' } },
    h('summary', { style: { cursor: 'pointer', color: 'var(--text-2)', fontSize: '13px' }, text: 'Autre source (coller une liste ou déposer un fichier)' }),
    h('div.grid', { style: { gap: '12px', marginTop: '12px' } },
      textArea,
      h('div.row', {}, h('span.label', { text: 'Format des lignes' }), orderSel),
      drop));

  /* ---- Bibliothèque ---- */
  const nTracks = store.state.tracks.length;
  const sources = [...new Set(store.state.tracks.map((t) => t.source).filter(Boolean))].slice(0, 3).join(', ');
  const libState = nTracks
    ? h('div.row', { style: { padding: '13px 15px', border: '1px solid color-mix(in srgb, var(--ok) 40%, transparent)', borderRadius: 'var(--r-ctl)', background: 'color-mix(in srgb, var(--ok) 8%, transparent)' } },
        h('span.badge.badge-ok', {}, '✓'),
        h('strong', { text: sources || 'Bibliothèque' }),
        h('span.muted.small', { text: `— ${nTracks.toLocaleString('fr-FR')} morceaux` }),
        h('div.spacer'),
        btn('Compléter / remplacer', { sm: true, onClick: () => importDialog(null, () => render(root)) }))
    : h('div.row', { style: { padding: '13px 15px', border: '1px solid color-mix(in srgb, var(--warn) 45%, transparent)', borderRadius: 'var(--r-ctl)', background: 'color-mix(in srgb, var(--warn) 9%, transparent)' } },
        h('span.badge.badge-warn', {}, '!'),
        h('strong', { text: 'Aucune bibliothèque' }),
        h('span.muted.small', { text: '— importe ton export Serato ou iTunes' }),
        h('div.spacer'),
        btn('Importer maintenant', { variant: 'btn-primary', sm: true, onClick: () => importDialog(null, () => render(root)) }));

  const memoryHint = memory.size()
    ? h('p.muted-3.small', { text: `${memory.size()} choix déjà mémorisés : ces titres seront reconnus automatiquement.` })
    : h('p.muted-3.small', { text: 'À chaque version que tu valides, le choix est mémorisé pour les prochains matchs.' });

  const launch = btn('Lancer le matching', {
    variant: 'btn-primary', ico: 'play',
    onClick: async () => {
      if (!nTracks) { toast('Importe d\'abord ta bibliothèque.', 'err'); return; }
      const url = urlInput.value.trim();
      let entries = null, autoName = null;

      if (url) {
        try {
          ui.screen = 'running'; ui.progressLabel = 'Lecture de la playlist…'; ui.progress = 0; render(root);
          const pl = await playlist.fetchPlaylist(url, (n) => {
            const el = document.getElementById('match-progress');
            if (el) el.textContent = `${n} titres récupérés…`;
          });
          entries = pl.entries; autoName = pl.name;
        } catch (e) {
          ui.screen = 'form'; render(root);
          if (e.message === 'NOT_CONNECTED') toast('Connecte Spotify d\'abord (bouton ci-dessus).', 'err');
          else toast(e.message, 'err');
          return;
        }
      } else if (fileEntries) {
        entries = fileEntries;
      } else {
        const txt = textArea.value.trim();
        if (!txt) { toast('Colle une URL de playlist, une liste, ou dépose un fichier.', 'err'); return; }
        entries = /(^|,)\s*("?)(track name|title|titre|artist)/i.test(txt.split('\n')[0])
          ? tracksFromCSV(txt) : tracksFromText(txt, { order: orderSel.value });
      }
      if (!entries?.length) { ui.screen = 'form'; render(root); toast('Aucun titre détecté.', 'err'); return; }
      await run(entries, nameInput.value.trim() || autoName || 'Match du ' + new Date().toLocaleDateString('fr-FR'), dedupe.checked, root);
    },
  });

  return h('div.card', {},
    h('div.card-head', {},
      h('div', {},
        h('h2', { text: 'Match ta playlist' }),
        h('div.sub', { text: 'Colle l\'URL d\'une playlist Spotify ou Deezer publique : on te dit ce que tu as déjà, sous quelle version, et ce qu\'il reste à récupérer.' })),
      store.state.matches.length ? btn('Matchs enregistrés', { sm: true, onClick: () => document.dispatchEvent(new CustomEvent('nav', { detail: 'sessions' })) }) : null),
    h('div.card-pad.grid', { style: { gap: '18px' } },
      h('div.field', {}, h('span.label', { text: 'URL de la playlist' }), urlInput, spotifyBox),
      h('label.check', {}, dedupe, 'Supprimer les doublons'),
      h('div.field', {}, h('span.label', { text: 'Bibliothèque DJ' }), libState),
      h('div.field', {}, h('span.label', { text: 'Nom du match (facultatif)' }), nameInput),
      advanced,
      h('div', {}, launch, memoryHint)));
}

/* ============================== Écran 2 ================================= */
function runningScreen() {
  return h('div.card.card-pad', { style: { textAlign: 'center', padding: '90px 20px' } },
    h('div.spin'),
    h('h2', { text: ui.progressLabel || 'Matching en cours…' }),
    h('p.muted', { style: { marginTop: '6px' }, id: 'match-progress', text: `${ui.progress} %` }));
}

async function run(entries, name, dedupe, root) {
  ui.screen = 'running'; ui.progress = 0; ui.progressLabel = 'Matching en cours…'; render(root);
  await new Promise((r) => setTimeout(r, 60));

  const rows = await matchPlaylist(entries, store.state.tracks, {
    dedupe,
    onProgress: (done, total) => {
      ui.progress = Math.round((done / total) * 100);
      const el = document.getElementById('match-progress');
      if (el) el.textContent = `${ui.progress} % — ${done} / ${total} titres`;
    },
  });

  // Application de la mémoire des correspondances
  await memory.load();
  const byId = new Map(store.state.tracks.map((t) => [t.id, t]));
  const ids = new Set(byId.keys());
  let learned = 0;
  for (const r of rows) { r.libraryById = byId; if (memory.apply(r, ids)) learned++; delete r.libraryById; }

  session = store.newMatch(name, rows, { playlistSize: entries.length });
  await store.saveMatch(session);
  await store.setCurrentMatch(session.id);
  ui.screen = 'results'; ui.open.clear(); ui.filter = 'all';
  render(root);
  toast(`${rows.length} titres analysés${learned ? ` — ${learned} reconnus depuis la mémoire` : ''}`, 'ok');
}

/* ============================== Écran 3 ================================= */
function resultsScreen(root) {
  const s = summarize(session.rows);
  const persist = debounce(() => store.saveMatch(session), 500);

  const counters = h('div.stats-row', { style: { marginBottom: '18px' } },
    clickableStat(s.total, 'Total', '', 'all', root),
    clickableStat(s.review, 'À vérifier', 'g-purple', 'review', root),
    clickableStat(s.matched, 'Matchés', 'g-green', 'matched', root),
    stat(s.alternatives, 'Alternatives', 'g-blue'),
    clickableStat(s.missing, 'À récupérer', '', 'missing', root),
  );

  const rows = session.rows.filter((r) => {
    if (ui.filter === 'all') return true;
    if (ui.filter === 'missing') return !r.chosenId;
    if (ui.filter === 'matched') return r.chosenId && r.confirmed;
    if (ui.filter === 'review') return r.chosenId && !r.confirmed;
    return true;
  });

  const list = h('div', {}, rows.length
    ? rows.map((r) => matchRow(r, session.rows.indexOf(r) + 1, root, persist))
    : emptyState('Rien ici', 'Aucun titre dans ce filtre.'));

  return h('div.card', {},
    h('div.card-head', {},
      h('div', {},
        h('h2', { text: session.name }),
        h('div.sub', { text: 'Clique sur une ligne pour choisir la version principale ou ajouter des alternatives. Chaque choix est mémorisé.' })),
      h('div.row.row-tight',
        {},
        btn('Nouveau match', { onClick: () => { session = null; store.setCurrentMatch(null); ui.screen = 'form'; render(root); } }),
        btn('Renommer', { sm: true, onClick: async () => {
          const n = await promptDialog('Renommer le match', session.name);
          if (n) { session.name = n; await store.saveMatch(session); render(root); }
        } }),
      )),
    h('div.card-pad', {},
      counters,
      h('div.row', { style: { marginBottom: '16px' } },
        btn('Exporter', { variant: 'btn-primary', ico: 'download', onClick: () => doExport() }),
        btn('', { ico: 'settings', title: 'Paramètres d\'export', onClick: (e) => exportSettings(e.currentTarget) }),
        h('div.spacer'),
        btn('Envoyer vers une setlist', { sm: true, ico: 'arrowRight', onClick: () => toSetlist(root) }),
        btn('Tout confirmer et mémoriser', { sm: true, ico: 'check', onClick: async () => {
          let n = 0;
          for (const r of session.rows) {
            if (!r.chosenId) continue;
            r.confirmed = true;
            await memory.remember(r.source, { chosenId: r.chosenId, altIds: r.altIds || [], owner: store.state.profile });
            n++;
          }
          await store.saveMatch(session); render(root);
          toast(`${n} correspondances confirmées et mémorisées`, 'ok');
        } }),
      ),
      list));
}

function clickableStat(value, label, cls, filter, root) {
  const el = stat(value, label, cls);
  el.style.cursor = 'pointer';
  if (ui.filter === filter) el.style.outline = '2px solid var(--mp-primary)';
  el.addEventListener('click', () => { ui.filter = ui.filter === filter ? 'all' : filter; render(root); });
  return el;
}

/* ------------------------------ Une ligne ------------------------------- */
function matchRow(r, index, root, persist) {
  const chosen = r.candidates.find((c) => c.track.id === r.chosenId)?.track || null;
  const isOpen = ui.open.has(r.id);
  const statusCls = !r.chosenId ? 'st-miss' : r.confirmed ? 'st-ok' : 'st-warn';

  const head = h('div.match-head', {
    onclick: (e) => {
      if (e.target.closest('button, input, label')) return;
      isOpen ? ui.open.delete(r.id) : ui.open.add(r.id);
      render(root);
    },
  },
    h('div.match-idx', { text: String(index) }),
    h('div', { style: { minWidth: '0' } },
      h('div.line', {},
        h('span.mark', { style: { color: r.candidates.length ? 'var(--ok)' : 'var(--danger)' }, text: r.candidates.length ? '✓' : '✗' }),
        h('span.t', { text: r.source.title }),
        h('span.a', { text: r.source.artist || '' })),
      h('div.line.sub', {},
        h('span.mark', { style: { color: !r.chosenId ? 'var(--danger)' : r.confirmed ? 'var(--ok)' : 'var(--warn)' },
          text: !r.chosenId ? '!' : r.confirmed ? '➜' : '!' }),
        chosen ? h('span.t', { text: chosen.title }) : h('span.t.muted', { text: 'À récupérer' }),
        chosen ? h('span.a', { text: chosen.artist || '' }) : null,
        chosen?.camelot ? keyBadge(chosen.camelot, { classic: false }) : null,
        chosen?.bpm ? bpmBadge(chosen.bpm) : null,
      )),
    h('div.match-meta', {},
      r.fromMemory ? h('span.badge.badge-info', { title: 'Choix repris de la mémoire', text: '★ mémorisé' }) : null,
      (r.altIds || []).length ? h('span.badge.badge-info', { text: `+${r.altIds.length} alt.` }) : null,
      chosen?.playCount ? h('span.muted-3.small.mono', { text: `${chosen.playCount} ▶` }) : null,
      h('span.muted-3.small.mono', { text: fmtDur(r.source.duration) }),
      h('span.chev', { text: '▼' })));

  const row = h('div.match-row.' + statusCls + (isOpen ? '.open' : ''), {}, head);
  if (isOpen) row.append(candidateList(r, root, persist));
  return row;
}

/** Enregistre la décision courante dans la mémoire. */
async function memorize(r) {
  await memory.remember(r.source, { chosenId: r.chosenId, altIds: r.altIds || [], owner: store.state.profile });
}

function candidateList(r, root, persist) {
  const box = h('div.cand-list');

  for (const c of r.candidates) {
    const isChosen = r.chosenId === c.track.id;
    const isAlt = (r.altIds || []).includes(c.track.id);
    box.append(h('div.cand' + (isChosen ? '.chosen' : '') + (isAlt ? '.alt' : ''), {},
      h('label.check', { title: 'Choisir comme principal' },
        h('input', {
          type: 'radio', name: 'cand-' + r.id, checked: isChosen,
          onchange: async () => {
            r.chosenId = c.track.id;
            r.status = 'matched'; r.confirmed = true; r.fromMemory = false;
            r.altIds = (r.altIds || []).filter((id) => id !== c.track.id);
            await memorize(r); persist(); render(root);
          },
        })),
      h('button.cand-add' + (isAlt ? '.on' : ''), {
        title: 'Ajouter aux alternatives', text: '≡+',
        onclick: async () => {
          r.altIds = r.altIds || [];
          if (isAlt) r.altIds = r.altIds.filter((id) => id !== c.track.id);
          else if (c.track.id !== r.chosenId) r.altIds.push(c.track.id);
          if (r.chosenId) await memorize(r);
          persist(); render(root);
        },
      }),
      h('div', { style: { minWidth: '0' } },
        h('div.truncate', { style: { fontWeight: '500' }, text: c.track.title }),
        h('div.row.row-tight', { style: { marginTop: '2px' } },
          h('span.muted.small.truncate', { text: c.track.artist || 'Artiste inconnu' }),
          c.track.camelot ? keyBadge(c.track.camelot, { classic: false }) : null,
          c.track.bpm ? bpmBadge(c.track.bpm) : null,
          c.track.playCount ? h('span.muted-3.small.mono', { text: `${c.track.playCount} ▶` }) : null,
          h('span.muted-3.small.mono', { text: fmtDur(c.track.duration) }))),
      h('div.score', { style: { color: c.score >= 0.9 ? 'var(--ok)' : c.score >= 0.6 ? 'var(--warn)' : 'var(--text-3)' },
        text: Math.round(c.score * 100) + ' %' })));
  }

  box.append(h('div.cand', { style: { gridTemplateColumns: '22px 1fr' } },
    h('label.check', {}, h('input', {
      type: 'radio', name: 'cand-' + r.id, checked: !r.chosenId,
      onchange: async () => {
        r.chosenId = null; r.status = 'missing'; r.confirmed = true; r.altIds = []; r.fromMemory = false;
        await memorize(r); persist(); render(root);
      },
    })),
    h('span.muted', { text: '⊗  Aucune correspondance → À récupérer' })));

  box.append(h('div.row', { style: { marginTop: '4px' } },
    r.chosenId ? btn(r.confirmed ? 'Sélection mémorisée' : 'Confirmer et mémoriser', {
      variant: r.confirmed ? 'btn-ghost' : 'btn-primary', sm: true, ico: 'check',
      onClick: async () => {
        r.confirmed = !r.confirmed;
        if (r.confirmed) await memorize(r);
        persist(); render(root);
      },
    }) : null,
    r.fromMemory || r.confirmed ? btn('Oublier ce choix', { sm: true, onClick: async () => {
      await memory.forget(memory.memoryKey(r.source));
      r.fromMemory = false; r.confirmed = false;
      toast('Choix oublié', 'ok'); persist(); render(root);
    } }) : null,
    h('span.muted-3.small', { text: r.confirmed ? 'Sera réappliqué automatiquement la prochaine fois' : 'Compté dans « À vérifier »' })));

  return box;
}

/* ------------------------------- Exports -------------------------------- */
function exportSettings(anchor) {
  const mk = (key, label, hint) => {
    const cb = h('input', { type: 'checkbox', checked: ui.exportFormats[key],
      onchange: (e) => { ui.exportFormats[key] = e.target.checked; } });
    return { raw: h('label.check', {}, cb, h('span', {}, label, hint ? h('span.muted-3.small', { text: ' ' + hint }) : null)) };
  };
  popMenu(anchor, [
    { label: 'Principales & alternatives', header: true },
    mk('m3u8', '.m3u8', '(Serato, iTunes, la plupart des lecteurs)'),
    { label: 'À récupérer', header: true },
    mk('csv', '.csv'),
    mk('pdf', '.pdf'),
  ]);
}

function doExport() {
  const byId = new Map(store.state.tracks.map((t) => [t.id, t]));
  const picked = [];
  for (const r of session.rows) {
    if (r.chosenId && byId.get(r.chosenId)) picked.push(byId.get(r.chosenId));
    for (const id of r.altIds || []) if (byId.get(id)) picked.push(byId.get(id));
  }
  const missing = session.rows.filter((r) => !r.chosenId);
  const base = slug(session.name);
  let n = 0;

  if (ui.exportFormats.m3u8) {
    if (!picked.length) toast('Aucune correspondance à exporter en M3U8.', 'err');
    else { exportM3U8(picked, base + '.m3u8'); n++; }
  }
  if (ui.exportFormats.csv) {
    const csv = toCSV(missing.map((r, i) => ({ i: i + 1, ...r.source })), [
      { key: 'i', label: '#' }, { key: 'title', label: 'Titre' },
      { key: 'artist', label: 'Artiste' }, { key: (r) => fmtDur(r.duration), label: 'Durée' },
    ]);
    download(base + '-a-recuperer.csv', csv, 'text/csv;charset=utf-8'); n++;
  }
  if (ui.exportFormats.pdf) { printShoppingList(session); n++; }
  if (!n) toast('Aucun format sélectionné (roue crantée).', 'err');
}

/* --------------------- Envoi vers le module Setlist --------------------- */
async function toSetlist(root) {
  const ids = session.rows.filter((r) => r.chosenId).map((r) => r.chosenId);
  if (!ids.length) { toast('Aucune correspondance à envoyer.', 'err'); return; }
  const name = await promptDialog('Créer une setlist', session.name, 'Nom de la setlist');
  if (!name) return;
  const sl = store.newSetlist(name);
  sl.items = ids.map((id) => ({ trackId: id }));
  sl.notes = `Créée depuis le match « ${session.name} ».`;
  await store.saveSetlist(sl);
  await store.setCurrentSetlist(sl.id);
  toast('Setlist créée', 'ok');
  document.dispatchEvent(new CustomEvent('nav', { detail: 'setlist' }));
}

export async function openMatch(id) {
  await store.setCurrentMatch(id);
  session = store.currentMatch();
  ui.screen = session ? 'results' : 'form';
  ui.open.clear();
}

export function resetView() { session = null; ui.screen = 'form'; }
export function prefillUrl(url) { ui.url = url; ui.screen = 'form'; session = null; }
