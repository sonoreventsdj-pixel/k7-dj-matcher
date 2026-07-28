/* Vue Bibliothèque : import multi-format, table filtrable / triable / éditable. */

import {
  h, mount, clear, toast, modal, confirmDialog, pickFile, readText, readBuffer,
  fmtDur, num, debounce, icon, popMenu,
} from '../../core/util.js';
import * as store from '../../core/store.js';
import { parseFile, tracksFromCSV, tracksFromText, makeTrack, quality } from '../../lib/parsers/index.js';
import { toCamelot, toClassic, CAMELOT_CODES } from '../../lib/camelot.js';
import { exportTracksCSV, exportM3U8, exportCrate, printDocument, slug } from '../../lib/exporters/index.js';
import { keyBadge, bpmBadge, bitrateBadge, btn, emptyState } from '../components.js';

const ui = {
  q: '', genre: '', key: '', bpmMin: '', bpmMax: '', tag: '', qual: '',
  sort: 'title', dir: 1, page: 0, pageSize: 50, selected: new Set(),
};

export function render(root) {
  const wrap = h('div');

  /* ------------------------------- En-tête ------------------------------ */
  wrap.append(h('div.card', {},
    h('div.card-head', {},
      h('div', {},
        h('h2', { text: 'Bibliothèque' }),
        h('div.sub', { text: `${store.state.tracks.length} morceau(x) — titre, artiste, BPM, tonalité, genre, année, débit, tags, notes` })),
      h('div.row.row-tight',
        {},
        btn('Importer', { variant: 'btn-primary', ico: 'upload', onClick: () => importDialog(root) }),
        btn('', { ico: 'plus', title: 'Ajouter un morceau à la main', onClick: () => editDialog(null, root) }),
        btn('', { ico: 'download', title: 'Exporter', onClick: (e) => exportMenu(e.currentTarget) }),
      )),
    h('div.card-pad', {}, filtersBar(root), tableBlock(root)),
  ));

  mount(root, wrap);
}

/* ------------------------------- Filtres -------------------------------- */
function filtersBar(root) {
  const rerender = debounce(() => render(root), 180);
  const genres = [...new Set(store.state.tracks.map((t) => t.genre).filter(Boolean))].sort();
  const tags = [...new Set(store.state.tracks.flatMap((t) => t.tags || []))].sort();

  const search = h('div.search', { style: { flex: '1 1 220px', minWidth: '200px' } },
    h('input.input', {
      placeholder: 'Rechercher un titre, un artiste, un tag…', value: ui.q,
      oninput: (e) => { ui.q = e.target.value; ui.page = 0; rerender(); },
    }));

  const sel = (value, options, onChange, placeholder) => {
    const s = h('select.select', { onchange: (e) => { onChange(e.target.value); ui.page = 0; render(root); } });
    s.append(h('option', { value: '', text: placeholder }));
    for (const o of options) s.append(h('option', { value: o, text: o, selected: String(value) === String(o) }));
    return s;
  };

  return h('div', { style: { marginBottom: '16px' } },
    h('div.row', { style: { marginBottom: '10px' } },
      search,
      btn('Filtres', { ico: 'settings', sm: true, onClick: () => {
        const box = document.getElementById('lib-filters');
        box.classList.toggle('hidden');
      } }),
      ui.selected.size ? btn(`Supprimer (${ui.selected.size})`, {
        variant: 'btn-danger', sm: true, ico: 'trash',
        onClick: async () => {
          if (!await confirmDialog('Supprimer', `${ui.selected.size} morceau(x) seront retirés de la bibliothèque.`)) return;
          await store.removeTracks([...ui.selected]);
          ui.selected.clear(); toast('Morceaux supprimés', 'ok'); render(root);
        },
      }) : null,
    ),
    h('div#lib-filters.filters.hidden', {},
      sel(ui.genre, genres, (v) => ui.genre = v, 'Tous les genres'),
      sel(ui.key, CAMELOT_CODES, (v) => ui.key = v, 'Toutes les tonalités'),
      sel(ui.tag, tags, (v) => ui.tag = v, 'Tous les tags'),
      h('input.input', { type: 'number', placeholder: 'BPM min', value: ui.bpmMin,
        oninput: debounce((e) => { ui.bpmMin = e.target.value; render(root); }, 350) }),
      h('input.input', { type: 'number', placeholder: 'BPM max', value: ui.bpmMax,
        oninput: debounce((e) => { ui.bpmMax = e.target.value; render(root); }, 350) }),
      sel(ui.qual, ['320 kbps et +', 'Moins de 320', 'Moins de 192', 'Sans perte', 'Débit inconnu'],
        (v) => ui.qual = v, 'Toute qualité'),
    ),
  );
}

export function filtered() {
  const q = ui.q.trim().toLowerCase();
  let list = store.state.tracks.filter((t) => {
    if (q) {
      const hay = `${t.title} ${t.artist} ${t.album} ${t.genre} ${(t.tags || []).join(' ')} ${t.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (ui.genre && t.genre !== ui.genre) return false;
    if (ui.key && t.camelot !== ui.key) return false;
    if (ui.tag && !(t.tags || []).includes(ui.tag)) return false;
    if (ui.bpmMin && (!t.bpm || t.bpm < Number(ui.bpmMin))) return false;
    if (ui.bpmMax && (!t.bpm || t.bpm > Number(ui.bpmMax))) return false;
    if (ui.qual) {
      const qy = quality(t);
      if (ui.qual === '320 kbps et +' && qy.rank < 3) return false;
      if (ui.qual === 'Moins de 320' && !(t.bitrate && t.bitrate < 320 && qy.level !== 'lossless')) return false;
      if (ui.qual === 'Moins de 192' && !(t.bitrate && t.bitrate < 192 && qy.level !== 'lossless')) return false;
      if (ui.qual === 'Sans perte' && qy.level !== 'lossless') return false;
      if (ui.qual === 'Débit inconnu' && qy.level !== 'unknown') return false;
    }
    return true;
  });
  const k = ui.sort;
  list.sort((a, b) => {
    const A = a[k], B = b[k];
    if (A == null && B == null) return 0;
    if (A == null) return 1;
    if (B == null) return -1;
    if (typeof A === 'number' && typeof B === 'number') return (A - B) * ui.dir;
    return String(A).localeCompare(String(B), 'fr') * ui.dir;
  });
  return list;
}

/* -------------------------------- Table --------------------------------- */
function tableBlock(root) {
  const list = filtered();
  if (!store.state.tracks.length) {
    return emptyState('Bibliothèque vide',
      'Importe ton fichier Serato « database V2 », ta bibliothèque iTunes, un CSV, ou colle une liste de titres.',
      btn('Importer une bibliothèque', { variant: 'btn-primary', ico: 'upload', onClick: () => importDialog(root) }));
  }
  if (!list.length) return emptyState('Aucun résultat', 'Aucun morceau ne correspond aux filtres.');

  const pages = Math.max(1, Math.ceil(list.length / ui.pageSize));
  ui.page = Math.min(ui.page, pages - 1);
  const slice = list.slice(ui.page * ui.pageSize, (ui.page + 1) * ui.pageSize);

  const th = (label, key, cls = '') => h('th' + (key ? '.sortable' : '') + (cls ? '.' + cls : ''), {
    onclick: key ? () => { if (ui.sort === key) ui.dir *= -1; else { ui.sort = key; ui.dir = 1; } render(root); } : null,
  }, label + (ui.sort === key ? (ui.dir === 1 ? ' ↑' : ' ↓') : ''));

  const allChecked = slice.every((t) => ui.selected.has(t.id));
  const table = h('table.tbl', {},
    h('thead', {}, h('tr', {},
      h('th', { style: { width: '34px' } },
        h('label.check', {}, h('input', {
          type: 'checkbox', checked: allChecked,
          onchange: (e) => { slice.forEach((t) => e.target.checked ? ui.selected.add(t.id) : ui.selected.delete(t.id)); render(root); },
        }))),
      th('Titre', 'title'), th('Artiste', 'artist'), th('BPM', 'bpm', 'num'),
      th('Tonalité', 'camelot'), th('Genre', 'genre'),
      th('Année', 'year', 'num'), th('Durée', 'duration', 'num'), th('Débit', 'bitrate'), th('Tags'),
      h('th', { style: { width: '46px' } }, ''),
    )),
    h('tbody', {}, slice.map((t) => trackRow(t, root))),
  );

  const pager = h('div.between', { style: { marginTop: '14px' } },
    h('span.muted.small', { text: `${list.length} morceau(x) — page ${ui.page + 1} / ${pages}` }),
    h('div.row.row-tight',
      {},
      btn('‹', { sm: true, disabled: ui.page === 0, onClick: () => { ui.page--; render(root); } }),
      btn('›', { sm: true, disabled: ui.page >= pages - 1, onClick: () => { ui.page++; render(root); } }),
      (() => {
        const s = h('select.select', { style: { width: 'auto' }, onchange: (e) => { ui.pageSize = Number(e.target.value); ui.page = 0; render(root); } });
        for (const n of [25, 50, 100, 250]) s.append(h('option', { value: n, text: n, selected: ui.pageSize === n }));
        return s;
      })(),
    ));

  return h('div', {}, h('div.table-wrap', { style: { maxHeight: '62vh' } }, table), pager);
}

function trackRow(t, root) {
  const save = debounce(async (patch) => { await store.updateTrack(t.id, patch); }, 400);
  const cell = (value, patchKey, opts = {}) => h('input.cell-edit', {
    value: value ?? '', type: opts.type || 'text',
    style: opts.width ? { maxWidth: opts.width } : null,
    oninput: (e) => {
      let v = e.target.value;
      if (opts.type === 'number') v = num(v);
      if (patchKey === 'tags') v = String(e.target.value).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      save({ [patchKey]: v });
    },
  });

  return h('tr', {},
    h('td', {}, h('label.check', {}, h('input', {
      type: 'checkbox', checked: ui.selected.has(t.id),
      onchange: (e) => { e.target.checked ? ui.selected.add(t.id) : ui.selected.delete(t.id); render(root); },
    }))),
    h('td', { style: { minWidth: '200px' } }, cell(t.title, 'title')),
    h('td', { style: { minWidth: '160px' } }, cell(t.artist, 'artist')),
    h('td.num', {}, cell(t.bpm, 'bpm', { type: 'number', width: '62px' })),
    h('td', {}, keySelect(t, save)),
    h('td', { style: { minWidth: '110px' } }, cell(t.genre, 'genre')),
    h('td.num', {}, cell(t.year, 'year', { type: 'number', width: '62px' })),
    h('td.num.mono.muted', { text: fmtDur(t.duration) }),
    h('td', {}, bitrateBadge(t)),
    h('td', { style: { minWidth: '120px' } }, cell((t.tags || []).join(', '), 'tags')),
    h('td', {}, btn('', { ico: 'edit', sm: true, title: 'Éditer', onClick: () => editDialog(t, root) })),
  );
}

function keySelect(t, save) {
  const s = h('select.select', { style: { width: '104px', padding: '5px 8px', fontSize: '12.5px' },
    onchange: (e) => save({ camelot: e.target.value || null, key: e.target.value ? toClassic(e.target.value) : null }) });
  s.append(h('option', { value: '', text: '—' }));
  for (const c of CAMELOT_CODES) s.append(h('option', { value: c, text: `${c} · ${toClassic(c)}`, selected: t.camelot === c }));
  return s;
}

/* ----------------------------- Édition fiche ---------------------------- */
export function editDialog(track, root) {
  const t = track || makeTrack({ owner: store.state.profile });
  const f = {};
  const field = (label, key, opts = {}) => {
    const input = opts.node || h('input.input', { value: t[key] ?? '', type: opts.type || 'text', placeholder: opts.ph || '' });
    f[key] = input;
    return h('div.field', {}, h('span.label', { text: label }), input);
  };

  const keySel = h('select.select');
  keySel.append(h('option', { value: '', text: '—' }));
  for (const c of CAMELOT_CODES) keySel.append(h('option', { value: c, text: `${c} · ${toClassic(c)}`, selected: t.camelot === c }));

  const body = h('div.grid', {},
    field('Titre', 'title', { ph: 'Titre du morceau' }),
    field('Artiste', 'artist'),
    h('div.cols-2', {},
      field('BPM', 'bpm', { type: 'number' }),
      field('Tonalité (Camelot)', 'camelot', { node: keySel })),
    h('div.cols-2', {},
      field('Genre', 'genre'),
      field('Débit (kbps)', 'bitrate', { type: 'number', ph: '320' })),
    h('div.cols-2', {},
      field('Année', 'year', { type: 'number' }),
      field('Durée (m:ss)', 'duration', { node: h('input.input', { value: fmtDur(t.duration) === '—' ? '' : fmtDur(t.duration), placeholder: '3:45' }) })),
    field('Tags (séparés par des virgules)', 'tags', { node: h('input.input', { value: (t.tags || []).join(', ') }) }),
    field('Notes', 'notes', { node: h('textarea.textarea', { style: { minHeight: '80px' }, value: t.notes || '' }) }),
  );

  modal({
    title: track ? 'Modifier le morceau' : 'Nouveau morceau',
    body,
    actions: [
      track ? { label: 'Supprimer', cls: 'btn-danger', onClick: async () => {
        if (!await confirmDialog('Supprimer', `« ${t.title} » sera retiré de la bibliothèque.`)) return;
        await store.removeTracks([t.id]); toast('Morceau supprimé', 'ok'); render(root);
      } } : null,
      { label: 'Annuler' },
      { label: 'Enregistrer', cls: 'btn-primary', onClick: async () => {
        const patch = makeTrack({
          id: t.id,
          title: f.title.value, artist: f.artist.value, bpm: f.bpm.value,
          key: f.camelot.value, genre: f.genre.value, bitrate: f.bitrate.value,
          year: f.year.value, duration: f.duration.value, tags: f.tags.value,
          notes: f.notes.value, owner: t.owner || store.state.profile,
          format: t.format, playCount: t.playCount, location: t.location,
          source: t.source, addedAt: t.addedAt,
        });
        if (!patch.title && !patch.artist) { toast('Il faut au moins un titre.', 'err'); return false; }
        if (track) await store.updateTrack(t.id, patch);
        else await store.addTracks([patch], { dedupe: false });
        toast('Enregistré', 'ok'); render(root);
      } },
    ].filter(Boolean),
  });
}

/* -------------------------------- Import -------------------------------- */
export function importDialog(root, onDone) {
  let mode = 'file';
  const textArea = h('textarea.textarea', {
    placeholder: 'Artiste - Titre\nArtiste - Titre (Extended Mix)\n…',
    style: { minHeight: '190px' },
  });
  const orderSel = h('select.select', { style: { width: 'auto' } },
    h('option', { value: 'artist-first', text: 'Artiste - Titre' }),
    h('option', { value: 'title-first', text: 'Titre - Artiste' }));
  const dedupe = h('input', { type: 'checkbox', checked: true });
  const info = h('div.muted.small');

  const drop = h('div.dropzone', {},
    h('div', { style: { fontWeight: '600', color: 'var(--text)' }, text: 'Cliquer ou glisser-déposer ta bibliothèque' }),
    h('div.small.muted-3', { style: { marginTop: '4px' },
      text: 'Serato : le fichier « database V2 » (dossier _Serato_) ou une .crate — iTunes / Apple Music : « Bibliothèque.xml » — aussi : CSV, M3U, JSON, XML' }));
  let picked = null;

  const handleFiles = async (files) => {
    picked = files;
    info.textContent = files.length === 1 ? files[0].name : `${files.length} fichiers sélectionnés`;
  };
  drop.addEventListener('click', async () => {
    const files = await pickFile('', true);
    if (files?.length) handleFiles(files);
  });
  ['dragover', 'dragenter'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const files = Array.from(ev.dataTransfer.files || []);
    if (files.length) handleFiles(files);
  });

  const tabs = h('div.tabs', { style: { marginBottom: '16px' } },
    h('button.active', { text: 'Fichier', onclick: (e) => switchTab(e, 'file') }),
    h('button', { text: 'Coller du texte', onclick: (e) => switchTab(e, 'text') }));

  const paneFile = h('div', {}, drop, info);
  const paneText = h('div.hidden', {},
    h('div.field', {}, h('span.label', { text: 'Une ligne par morceau' }), textArea),
    h('div.row', { style: { marginTop: '10px' } }, h('span.label', { text: 'Format' }), orderSel));

  function switchTab(e, m) {
    mode = m;
    tabs.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    paneFile.classList.toggle('hidden', m !== 'file');
    paneText.classList.toggle('hidden', m !== 'text');
  }

  modal({
    title: 'Importer dans la bibliothèque',
    width: '620px',
    body: h('div', {}, tabs, paneFile, paneText,
      h('label.check', { style: { marginTop: '16px' } }, dedupe, 'Ignorer les doublons (même titre + artiste)')),
    actions: [
      { label: 'Annuler' },
      { label: 'Importer', cls: 'btn-primary', onClick: async () => {
        try {
          let tracks = [];
          if (mode === 'text') {
            const txt = textArea.value.trim();
            if (!txt) { toast('Rien à importer.', 'err'); return false; }
            tracks = txt.includes(',') && /titre|title|artist/i.test(txt.split('\n')[0])
              ? tracksFromCSV(txt)
              : tracksFromText(txt, { order: orderSel.value });
          } else {
            if (!picked?.length) { toast('Choisis un fichier.', 'err'); return false; }
            for (const file of picked) {
              const { tracks: ts, kind } = await parseFile(file, { readText, readBuffer, textOrder: orderSel.value });
              tracks = tracks.concat(ts.map((t) => ({ ...t, source: kind })));
            }
          }
          if (!tracks.length) { toast('Aucun morceau détecté dans ce fichier.', 'err'); return false; }
          const res = await store.addTracks(tracks, { dedupe: dedupe.checked });
          toast(`${res.added} morceau(x) importé(s)${res.skipped ? `, ${res.skipped} doublon(s) ignoré(s)` : ''}`, 'ok');
          onDone?.(res);
          if (root) render(root);
        } catch (err) {
          console.error(err);
          toast('Import impossible : ' + err.message, 'err');
          return false;
        }
      } },
    ],
  });
}

/** Message après un export Serato : combien de morceaux sans chemin de fichier. */
export function crateToast(included, skipped) {
  if (!included.length) {
    toast('Aucun morceau n\'a de chemin de fichier : impossible de créer la crate. Réimporte ta bibliothèque depuis « database V2 ».', 'err');
    return;
  }
  toast(`Crate créée — ${included.length} morceau(x)` +
    (skipped.length ? `, ${skipped.length} ignoré(s) faute de chemin de fichier` : '') +
    '. Dépose-la dans _Serato_/Subcrates puis relance Serato.', 'ok');
}

/* -------------------------------- Export -------------------------------- */
function exportMenu(anchor) {
  const list = filtered();
  popMenu(anchor, [
    { label: `Export de ${list.length} morceau(x)`, header: true },
    { label: 'CSV (tableur)', onClick: () => exportTracksCSV(list, 'bibliotheque.csv') },
    { label: 'Crate Serato (.crate)', onClick: () => {
      const { included, skipped } = exportCrate(list, 'K7 — Bibliothèque');
      crateToast(included, skipped);
    } },
    { label: 'M3U8 (iTunes, autres lecteurs)', onClick: () => exportM3U8(list, 'bibliotheque.m3u8') },
    { label: 'PDF imprimable', onClick: () => printDocument({
      title: 'Bibliothèque',
      subtitle: `${list.length} morceaux`,
      sections: [{
        columns: [
          { label: 'Titre', width: '30%' }, { label: 'Artiste', width: '24%' },
          { label: 'BPM', num: true }, { label: 'Tonalité' }, { label: 'Genre' },
          { label: 'Débit', num: true }, { label: 'Durée', num: true },
        ],
        rows: list.map((t) => [t.title, t.artist, t.bpm ?? '', t.camelot ? `${t.camelot} ${toClassic(t.camelot) || ''}` : '', t.genre, t.bitrate ?? '', fmtDur(t.duration)]),
      }],
    }) },
    '-',
    { label: 'Vider la bibliothèque', onClick: async () => {
      if (!await confirmDialog('Vider la bibliothèque', 'Tous les morceaux seront supprimés. Les matchs enregistrés perdront leurs correspondances.')) return;
      await store.clearLibrary(); toast('Bibliothèque vidée', 'ok');
      document.dispatchEvent(new CustomEvent('nav', { detail: 'library' }));
    } },
  ]);
}
