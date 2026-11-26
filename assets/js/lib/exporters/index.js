/* Exports : CSV, M3U8, JSON de sauvegarde, et vue imprimable (PDF via
   l'impression du navigateur -> "Enregistrer au format PDF"). */

import { download, fmtDur, fmtDate } from '../../core/util.js';
import { toClassic } from '../camelot.js';
import { buildCrate, crateFilename } from './serato.js';
import { logoDataUri } from '../brand.js';

/* ------------------------------- CSV ------------------------------------ */
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCSV(rows, headers) {
  const keys = headers.map((h) => h.key);
  const out = [headers.map((h) => cell(h.label)).join(',')];
  for (const r of rows) out.push(keys.map((k) => cell(typeof k === 'function' ? k(r) : r[k])).join(','));
  return '﻿' + out.join('\r\n');
}

export const TRACK_HEADERS = [
  { key: 'title', label: 'Titre' },
  { key: 'artist', label: 'Artiste' },
  { key: 'bpm', label: 'BPM' },
  { key: 'camelot', label: 'Camelot' },
  { key: (t) => t.camelot ? toClassic(t.camelot) : (t.key || ''), label: 'Tonalité' },
  { key: 'genre', label: 'Genre' },
  { key: 'year', label: 'Année' },
  { key: (t) => (t.tags || []).join(' | '), label: 'Tags' },
  { key: (t) => fmtDur(t.duration), label: 'Durée' },
  { key: 'bitrate', label: 'Débit (kbps)' },
  { key: 'format', label: 'Format' },
  { key: 'notes', label: 'Notes' },
];

export function exportTracksCSV(tracks, filename = 'bibliotheque.csv') {
  download(filename, toCSV(tracks, TRACK_HEADERS), 'text/csv;charset=utf-8');
}

/* ------------------------------- M3U8 ----------------------------------- */
export function toM3U8(tracks) {
  const lines = ['#EXTM3U'];
  for (const t of tracks) {
    const dur = t.duration ? Math.round(t.duration) : -1;
    lines.push(`#EXTINF:${dur},${[t.artist, t.title].filter(Boolean).join(' - ')}`);
    lines.push(t.location || `${[t.artist, t.title].filter(Boolean).join(' - ')}`);
  }
  return lines.join('\n') + '\n';
}

export function exportM3U8(tracks, filename = 'playlist.m3u8') {
  download(filename, toM3U8(tracks), 'audio/x-mpegurl');
}

/* ------------------------- Playlist iTunes (.xml) ------------------------ */
/* Fichier plist qu'iTunes / Musique importe tel quel :
   Fichier -> Bibliothèque -> Importer une liste de lecture…
   Les morceaux sont retrouvés par leur chemin de fichier (Location) : ils
   doivent donc exister dans la bibliothèque locale — c'est le cas puisqu'ils
   en viennent. */
const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Ré-encode un chemin file:// lisible en URL valide pour iTunes. */
function itunesLocation(loc) {
  const s = String(loc || '');
  if (!s.startsWith('file://')) return s;
  try {
    // encodeURI garde / : et les non-ASCII sont %-encodés ; on protège # et ?
    return encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F');
  } catch { return s; }
}

export function toItunesXML(tracks, playlistName) {
  const included = [];
  const skipped = [];
  for (const t of tracks) (t.location ? included : skipped).push(t);

  const trackDicts = included.map((t, i) => {
    const id = 1001 + i;
    const lines = [
      `\t\t\t<key>Track ID</key><integer>${id}</integer>`,
      `\t\t\t<key>Name</key><string>${xmlEsc(t.title)}</string>`,
    ];
    if (t.artist) lines.push(`\t\t\t<key>Artist</key><string>${xmlEsc(t.artist)}</string>`);
    if (t.album) lines.push(`\t\t\t<key>Album</key><string>${xmlEsc(t.album)}</string>`);
    if (t.duration) lines.push(`\t\t\t<key>Total Time</key><integer>${Math.round(t.duration * 1000)}</integer>`);
    lines.push('\t\t\t<key>Track Type</key><string>File</string>');
    lines.push(`\t\t\t<key>Location</key><string>${xmlEsc(itunesLocation(t.location))}</string>`);
    return `\t\t<key>${id}</key>\n\t\t<dict>\n${lines.join('\n')}\n\t\t</dict>`;
  }).join('\n');

  const items = included.map((t, i) => `\t\t\t\t<dict><key>Track ID</key><integer>${1001 + i}</integer></dict>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Major Version</key><integer>1</integer>
\t<key>Minor Version</key><integer>1</integer>
\t<key>Features</key><integer>5</integer>
\t<key>Tracks</key>
\t<dict>
${trackDicts}
\t</dict>
\t<key>Playlists</key>
\t<array>
\t\t<dict>
\t\t\t<key>Name</key><string>${xmlEsc(playlistName)}</string>
\t\t\t<key>Playlist ID</key><integer>1</integer>
\t\t\t<key>All Items</key><true/>
\t\t\t<key>Playlist Items</key>
\t\t\t<array>
${items}
\t\t\t</array>
\t\t</dict>
\t</array>
</dict>
</plist>
`;
  return { xml, included, skipped };
}

/** Génère la playlist iTunes et la télécharge. @returns { included, skipped } */
export function exportItunesXML(tracks, playlistName, filename) {
  const { xml, included, skipped } = toItunesXML(tracks, playlistName);
  if (included.length) download(filename, xml, 'text/xml;charset=utf-8');
  return { included, skipped };
}

/* ---------------------------- Serato .crate ----------------------------- */
/**
 * Génère une crate Serato et la télécharge.
 * @returns { included, skipped } pour prévenir des morceaux sans chemin de fichier.
 */
export function exportCrate(tracks, name) {
  const { blob, included, skipped } = buildCrate(tracks);
  if (included.length) download(crateFilename(name), blob, 'application/octet-stream');
  return { included, skipped };
}

/* ------------------------------- JSON ----------------------------------- */
export function exportJSON(obj, filename = 'sauvegarde.json') {
  download(filename, JSON.stringify(obj, null, 2), 'application/json');
}

/* ---------------------------- Vue imprimable ---------------------------- */
/**
 * Ouvre une fenêtre autonome, prête à imprimer / enregistrer en PDF.
 * `sections` : [{ title, columns:[{label,width}], rows:[[...cells]] , note }]
 */
export function printDocument({ title, subtitle, sections, footer }) {
  const css = `
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body { font: 12px/1.5 -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #16161d; margin: 0; }
    header { border-bottom: 2px solid #5C3B8A; padding-bottom: 10px; margin-bottom: 18px;
             display: flex; align-items: center; gap: 12px; }
    header img { width: 38px; height: 38px; flex: 0 0 38px; }
    h1 { font-size: 21px; margin: 0 0 3px; letter-spacing: -.01em; }
    .sub { color: #5b5b6b; font-size: 12px; }
    h2 { font-size: 14px; margin: 22px 0 8px; color: #5C3B8A; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em;
         color: #6b6b7b; border-bottom: 1px solid #d8d8e2; padding: 5px 6px; }
    td { padding: 6px; border-bottom: 1px solid #eeeef4; vertical-align: top; }
    tr { break-inside: avoid; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .k { display: inline-block; padding: 1px 6px; border-radius: 99px; background: #efeaf9; color: #5C3B8A; font-size: 10px; font-weight: 700; }
    .b { display: inline-block; padding: 1px 6px; border-radius: 99px; background: #e6effb; color: #1d4f95; font-size: 10px; font-weight: 700; }
    .note { color: #6b6b7b; font-size: 11px; margin: 4px 0 10px; }
    footer { margin-top: 24px; border-top: 1px solid #d8d8e2; padding-top: 8px; color: #8a8a99; font-size: 10px; }
    @media print { .noprint { display: none; } }
    .noprint { position: fixed; top: 12px; right: 12px; }
    .noprint button { font: inherit; padding: 9px 16px; border-radius: 10px; border: 0;
      background: linear-gradient(135deg,#201F54,#5C3B8A,#2162A1); color:#fff; cursor: pointer; }
  `;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>${esc(title)}</title><style>${css}</style></head><body>
    <div class="noprint"><button onclick="window.print()">Imprimer / PDF</button></div>
    <header>
      <img src="${logoDataUri({ fill: 'gradient', size: 38 })}" alt="K7">
      <div><h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}</div>
    </header>
    ${sections.map((s) => `
      ${s.title ? `<h2>${esc(s.title)}</h2>` : ''}
      ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
      ${s.rows.length ? `<table><thead><tr>${s.columns.map((c) => `<th class="${c.num ? 'num' : ''}"${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${s.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${s.columns[i]?.num ? 'num' : ''}">${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '<div class="note">Aucun élément.</div>'}
    `).join('')}
    <footer>${esc(footer || '')} — généré le ${fmtDate(Date.now())} par K7</footer>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Autorise les fenêtres pop-up pour générer le PDF.'); return null; }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* l'utilisateur imprimera à la main */ } }, 450);
  return w;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const slug = (s) => String(s || 'export').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'export';

/* ------------------------ Document métier prêt -------------------------- */
export function printShoppingList(matchSession) {
  const missing = matchSession.rows.filter((r) => r.status === 'missing' || !r.chosenId);
  printDocument({
    title: 'À récupérer — ' + (matchSession.name || 'Match'),
    subtitle: `${missing.length} morceau(x) manquant(s) sur ${matchSession.rows.length}`,
    sections: [{
      note: 'Liste des titres de la playlist absents de la bibliothèque.',
      columns: [
        { label: '#', num: true, width: '6%' },
        { label: 'Titre', width: '48%' },
        { label: 'Artiste', width: '34%' },
        { label: 'Durée', num: true },
      ],
      rows: missing.map((r, i) => [i + 1, `<b>${esc(r.source.title)}</b>`, esc(r.source.artist || ''), fmtDur(r.source.duration)]),
    }],
  });
}
