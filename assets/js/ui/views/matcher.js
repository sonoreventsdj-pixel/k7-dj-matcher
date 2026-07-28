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
import { exportM3U8, exportCrate, toCSV, printDocument, printShoppingList, slug } from '../../lib/exporters/index.js';
import * as playlist from '../../lib/playlist.js';
import { keyBadge, bpmBadge, bitrateBadge, btn, stat, emptyState } from '../components.js';
import { importDialog, crateToast } from './library.js';

const ui = {
  screen: 'form',
  open: new Set(),
  filter: 'all',
  progress: 0,
  progressLabel: '',
  url: '',
  exportSets: { main: true, alt: false, missing: true },
  exportFormats: { crate: true, m3u8: false, csv: false, pdf: true },
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
  const urlHint = h('div.small.muted-3', { style: { marginTop: '4px' } });
  const urlInput = h('input.input', {
    placeholder: 'Colle ton lien de playlist (Spotify ou Deezer)',
    value: ui.url,
    oninput: (e) => {
      ui.url = e.target.value;
      const v = e.target.value.trim();
      const d = v ? playlist.detectPlaylist(v) : null;
      if (!v) urlHint.textContent = '';
      else if (!d) urlHint.textContent = 'Lien non reconnu — il doit contenir /playlist/.';
      else if (d.provider === 'short') urlHint.textContent = 'Lien de partage : il sera converti automatiquement au lancement.';
      else if (d.provider === 'spotify' && d.kind !== 'album') urlHint.textContent = 'Playlist Spotify détectée. Attention : Spotify refuse souvent d\'en livrer le contenu (voir Réglages).';
      else urlHint.textContent = `${d.provider === 'deezer' ? 'Deezer' : 'Spotify'} détecté${d.kind === 'album' ? ' (album)' : ''}.`;
    },
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
  const myTracks = store.myTracks();
  const nTracks = myTracks.length;
  const sources = [...new Set(myTracks.map((t) => t.source).filter(Boolean))].slice(0, 3).join(', ');
  const libState = nTracks
    ? h('div.row', { style: { padding: '13px 15px', border: '1px solid color-mix(in srgb, var(--ok) 40%, transparent)', borderRadius: 'var(--r-ctl)', background: 'color-mix(in srgb, var(--ok) 8%, transparent)' } },
        h('span.badge.badge-ok', {}, '✓'),
        h('strong', { text: sources || 'Bibliothèque' }),
        h('span.muted.small', { text: `— ${nTracks.toLocaleString('fr-FR')} morceaux · ${store.profile().name}` }),
        h('div.spacer'),
        btn('Compléter / remplacer', { sm: true, onClick: () => importDialog(null, () => render(root)) }))
    : h('div.row', { style: { padding: '13px 15px', border: '1px solid color-mix(in srgb, var(--warn) 45%, transparent)', borderRadius: 'var(--r-ctl)', background: 'color-mix(in srgb, var(--warn) 9%, transparent)' } },
        h('span.badge.badge-warn', {}, '!'),
        h('strong', { text: 'Aucune bibliothèque' }),
        h('span.muted.small', { text: '— importe ton export Serato ou iTunes' }),
        h('div.spacer'),
        btn('Importer maintenant', { variant: 'btn-primary', sm: true, onClick: () => importDialog(null, () => render(root)) }));

  const memoryHint = memory.sizeFor(store.state.profile)
    ? h('p.muted-3.small', { text: `${memory.sizeFor(store.state.profile)} choix déjà mémorisés : ces titres seront reconnus automatiquement.` })
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
          const pl = await playlist.fetchPlaylist(url, (n, total, label) => {
            const el = document.getElementById('match-progress');
            if (el) el.textContent = label || `${n} titres récupérés…`;
          });
          entries = pl.entries; autoName = pl.name;
        } catch (e) {
          ui.screen = 'form'; render(root);
          if (e.message === 'NOT_CONNECTED') toast('Connecte Spotify d\'abord (bouton ci-dessus).', 'err');
          else if (e.message === 'SHORT_LINK') shortLinkHelp(e.shortLink);
          else if (e.message === 'SPOTIFY_NO_PLAYLIST_ACCESS' || e.message === 'SPOTIFY_FORBIDDEN') spotifyBlockedHelp(e.playlistName, url);
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
      h('div.field', {}, h('span.label', { text: 'URL de la playlist' }), urlInput, urlHint, spotifyBox),
      h('label.check', {}, dedupe, 'Supprimer les doublons'),
      h('div.field', {}, h('span.label', { text: 'Bibliothèque DJ' }), libState),
      h('div.field', {}, h('span.label', { text: 'Nom du match (facultatif)' }), nameInput),
      advanced,
      h('div', {}, launch, memoryHint)));
}

/**
 * Repli quand un lien de partage court n'a pas pu être résolu automatiquement
 * (ouverture en local, ou fonction Netlify indisponible).
 */
function shortLinkHelp(url) {
  modal({
    title: 'Lien de partage à convertir',
    body: h('div.grid', { style: { gap: '12px' } },
      h('p.muted', { text: 'Ce lien de partage masque l\'identifiant de la playlist, et le navigateur n\'a pas le droit de suivre la redirection lui-même.' }),
      h('p', { text: 'Ouvre-le dans un onglet : tu arrives sur la vraie page de la playlist. Copie l\'adresse depuis la barre du navigateur — elle contient /playlist/ suivi d\'un numéro — et recolle-la ici.' }),
      h('p.muted-3.small', { text: 'Exemple attendu : https://www.deezer.com/fr/playlist/1743878062' })),
    actions: [
      { label: 'Fermer' },
      { label: 'Ouvrir le lien', cls: 'btn-primary', onClick: () => window.open(url, '_blank', 'noopener') },
    ],
  });
}

/**
 * Spotify a durci l'accès développeur : une application en « Development mode »
 * lit le nom d'une playlist mais pas son contenu (403), même s'il s'agit de ses
 * propres playlists. Rien à corriger de notre côté — on explique le contournement.
 */
function spotifyBlockedHelp(playlistName, url) {
  const li = (...c) => h('li', { style: { marginBottom: '6px' } }, ...c);
  modal({
    title: 'Spotify bloque la lecture de cette playlist',
    width: '640px',
    body: h('div.grid', { style: { gap: '14px' } },
      h('p', {}, 'La playlist ',
        playlistName ? h('strong', { text: '« ' + playlistName + ' »' }) : 'demandée',
        ' est bien reconnue, mais Spotify refuse d\'en donner le contenu.'),
      h('p.muted.small', { text: 'Depuis le durcissement de son accès développeur, une application personnelle non validée par Spotify peut lire le nom d\'une playlist mais pas la liste de ses titres — y compris pour tes propres playlists. Ce n\'est pas réglable dans K7.' }),
      h('div', { style: { padding: '14px', borderRadius: 'var(--r-ctl)', background: 'var(--surface-2)' } },
        h('strong', { text: 'Les trois solutions, de la plus simple à la plus lourde :' }),
        h('ol', { style: { margin: '10px 0 0', paddingLeft: '20px', lineHeight: '1.6' } },
          li(h('strong', { text: 'Deezer' }), ' — colle plutôt un lien Deezer : ça fonctionne sans aucune configuration.'),
          li(h('strong', { text: 'Exporter la playlist en CSV' }), ' avec un outil déjà validé par Spotify, comme ',
            h('a', { href: 'https://exportify.net', target: '_blank', rel: 'noopener', text: 'exportify.net' }),
            ', puis dépose le fichier obtenu dans « Autre source » ci-dessous. K7 lit ce format directement.'),
          li(h('strong', { text: 'Copier-coller' }), ' la liste des titres (un « Artiste - Titre » par ligne) dans « Autre source ».'))),
    ),
    actions: [
      { label: 'Fermer' },
      url ? { label: 'Ouvrir Exportify', cls: 'btn-primary', onClick: () => window.open('https://exportify.net', '_blank', 'noopener') } : null,
    ].filter(Boolean),
  });
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

  const mine = store.myTracks();
  const rows = await matchPlaylist(entries, mine, {
    dedupe,
    onProgress: (done, total) => {
      ui.progress = Math.round((done / total) * 100);
      const el = document.getElementById('match-progress');
      if (el) el.textContent = `${ui.progress} % — ${done} / ${total} titres`;
    },
  });

  // Application de la mémoire des correspondances
  await memory.load();
  const byId = new Map(mine.map((t) => [t.id, t]));
  const ids = new Set(byId.keys());
  let learned = 0;
  for (const r of rows) {
    r.libraryById = byId;
    if (memory.apply(r, ids, store.state.profile)) learned++;
    delete r.libraryById;
  }

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
        session.owner && session.owner !== store.state.profile
          ? h('span.badge.badge-info', { text: 'partagé par ' + store.profileName(session.owner) }) : null,
        btn('Renommer', { sm: true, onClick: async () => {
          const n = await promptDialog('Renommer le match', session.name);
          if (n) { session.name = n; await store.saveMatch(session); render(root); }
        } }),
      )),
    h('div.card-pad', {},
      counters,
      h('div.row', { style: { marginBottom: '16px' } },
        btn('Exporter', { variant: 'btn-primary', ico: 'download', onClick: () => doExport() }),
        btn('', { ico: 'settings', title: 'Paramètres d\'export', onClick: (e) => exportSettings(e.currentTarget, root) }),
        h('div.spacer'),
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
        chosen ? bitrateBadge(chosen, { compact: true }) : null,
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
          bitrateBadge(c.track, { compact: true }),
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
/** Les trois lots exportables d'un match. */
function buckets() {
  const byId = new Map(store.myTracks().map((t) => [t.id, t]));
  const main = [], alt = [], missing = [];
  for (const r of session.rows) {
    if (r.chosenId && byId.get(r.chosenId)) main.push(byId.get(r.chosenId));
    else missing.push(r);
    for (const id of r.altIds || []) if (byId.get(id)) alt.push(byId.get(id));
  }
  return { main, alt, missing };
}

function exportSettings(anchor, root) {
  const b = buckets();
  const set = (key, label, count) => ({
    raw: h('label.check', {},
      h('input', { type: 'checkbox', checked: ui.exportSets[key],
        onchange: (e) => { ui.exportSets[key] = e.target.checked; } }),
      h('span', {}, label, h('span.muted-3.small', { text: ` (${count})` }))),
  });
  const fmt = (key, label, hint) => ({
    raw: h('label.check', {},
      h('input', { type: 'checkbox', checked: ui.exportFormats[key],
        onchange: (e) => { ui.exportFormats[key] = e.target.checked; } }),
      h('span', {}, label, hint ? h('span.muted-3.small', { text: ' ' + hint }) : null)),
  });
  popMenu(anchor, [
    { label: 'Quoi exporter', header: true },
    set('main', 'Versions principales', b.main.length),
    set('alt', 'Alternatives', b.alt.length),
    set('missing', 'À récupérer', b.missing.length),
    '-',
    { label: 'Dans quel format', header: true },
    fmt('crate', '.crate', '(Serato)'),
    fmt('m3u8', '.m3u8', '(iTunes, autres lecteurs)'),
    fmt('csv', '.csv'),
    fmt('pdf', '.pdf'),
  ]);
}

function doExport() {
  const b = buckets();
  const base = slug(session.name);
  const F = ui.exportFormats, S = ui.exportSets;

  if (!S.main && !S.alt && !S.missing) { toast('Choisis au moins un lot (roue crantée).', 'err'); return; }
  if (!F.crate && !F.m3u8 && !F.csv && !F.pdf) { toast('Choisis au moins un format (roue crantée).', 'err'); return; }

  // Un lot = une liste de morceaux de la bibliothèque
  const lots = [];
  if (S.main) lots.push({ key: 'main', label: 'Versions principales', suffix: '', tracks: b.main });
  if (S.alt) lots.push({ key: 'alt', label: 'Alternatives', suffix: '-alternatives', tracks: b.alt });

  let done = 0;
  for (const lot of lots) {
    if (!lot.tracks.length) { toast(`${lot.label} : aucun morceau à exporter.`, 'err'); continue; }
    if (F.crate) { const r = exportCrate(lot.tracks, `K7 — ${session.name}${lot.suffix ? ' — alternatives' : ''}`); crateToast(r.included, r.skipped); done++; }
    if (F.m3u8) { exportM3U8(lot.tracks, base + lot.suffix + '.m3u8'); done++; }
    if (F.csv) {
      download(base + lot.suffix + '.csv', toCSV(lot.tracks, [
        { key: 'title', label: 'Titre' }, { key: 'artist', label: 'Artiste' },
        { key: 'bpm', label: 'BPM' }, { key: 'camelot', label: 'Camelot' },
        { key: 'bitrate', label: 'Débit (kbps)' }, { key: 'format', label: 'Format' },
        { key: (t) => fmtDur(t.duration), label: 'Durée' }, { key: 'location', label: 'Fichier' },
      ]), 'text/csv;charset=utf-8');
      done++;
    }
    if (F.pdf) { printTrackList(lot.label + ' — ' + session.name, lot.tracks); done++; }
  }

  // Le lot « à récupérer » n'existe pas dans la bibliothèque : CSV / PDF seulement
  if (S.missing) {
    if (!b.missing.length) toast('Rien à récupérer : tout est trouvé.', 'ok');
    else {
      if (F.csv) {
        download(base + '-a-recuperer.csv', toCSV(b.missing.map((r, i) => ({ i: i + 1, ...r.source })), [
          { key: 'i', label: '#' }, { key: 'title', label: 'Titre' },
          { key: 'artist', label: 'Artiste' }, { key: (r) => fmtDur(r.duration), label: 'Durée' },
        ]), 'text/csv;charset=utf-8');
        done++;
      }
      if (F.pdf) { printShoppingList(session); done++; }
      if (!F.csv && !F.pdf) toast('« À récupérer » ne s\'exporte qu\'en CSV ou PDF.', 'err');
    }
  }
  if (done) toast(`${done} fichier(s) généré(s)`, 'ok');
}

/** PDF d'une liste de morceaux de la bibliothèque. */
function printTrackList(title, tracks) {
  printDocument({
    title,
    subtitle: `${tracks.length} morceau(x)`,
    sections: [{
      columns: [
        { label: '#', num: true, width: '5%' }, { label: 'Titre', width: '34%' },
        { label: 'Artiste', width: '26%' }, { label: 'BPM', num: true },
        { label: 'Tonalité' }, { label: 'Débit', num: true }, { label: 'Durée', num: true },
      ],
      rows: tracks.map((t, i) => [i + 1, `<b>${(t.title || '').replace(/</g, '&lt;')}</b>`,
        (t.artist || '').replace(/</g, '&lt;'), t.bpm ?? '',
        t.camelot ? `<span class="k">${t.camelot}</span>` : '',
        t.bitrate ? `${t.bitrate}` : '', fmtDur(t.duration)]),
    }],
  });
}

export async function openMatch(id) {
  await store.setCurrentMatch(id);
  session = store.currentMatch();
  ui.screen = session ? 'results' : 'form';
  ui.open.clear();
}

export function resetView() { session = null; ui.screen = 'form'; }
export function prefillUrl(url) { ui.url = url; ui.screen = 'form'; session = null; }
