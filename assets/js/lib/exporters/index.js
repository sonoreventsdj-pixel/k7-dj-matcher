/* Exports : CSV, M3U8, JSON de sauvegarde, et vue imprimable (PDF via
   l'impression du navigateur -> "Enregistrer au format PDF"). */

import { download, fmtDur, fmtDate } from '../../core/util.js';
import { toClassic } from '../camelot.js';
import { buildCrate, crateFilename } from './serato.js';

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
    header { border-bottom: 2px solid #3B39A8; padding-bottom: 10px; margin-bottom: 18px; }
    h1 { font-size: 21px; margin: 0 0 3px; letter-spacing: -.01em; }
    .sub { color: #5b5b6b; font-size: 12px; }
    h2 { font-size: 14px; margin: 22px 0 8px; color: #3B39A8; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em;
         color: #6b6b7b; border-bottom: 1px solid #d8d8e2; padding: 5px 6px; }
    td { padding: 6px; border-bottom: 1px solid #eeeef4; vertical-align: top; }
    tr { break-inside: avoid; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .k { display: inline-block; padding: 1px 6px; border-radius: 99px; background: #efeaf9; color: #4c1d95; font-size: 10px; font-weight: 700; }
    .b { display: inline-block; padding: 1px 6px; border-radius: 99px; background: #e6effb; color: #1d4f95; font-size: 10px; font-weight: 700; }
    .note { color: #6b6b7b; font-size: 11px; margin: 4px 0 10px; }
    footer { margin-top: 24px; border-top: 1px solid #d8d8e2; padding-top: 8px; color: #8a8a99; font-size: 10px; }
    @media print { .noprint { display: none; } }
    .noprint { position: fixed; top: 12px; right: 12px; }
    .noprint button { font: inherit; padding: 9px 16px; border-radius: 10px; border: 0;
      background: linear-gradient(120deg,#3B39A8,#7D54BF,#2A82D6); color:#fff; cursor: pointer; }
  `;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>${esc(title)}</title><style>${css}</style></head><body>
    <div class="noprint"><button onclick="window.print()">Imprimer / PDF</button></div>
    <header><h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}</header>
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
