/* Helpers DOM + formatage. Aucune dépendance externe. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Crée un élément. h('div.card', {onclick}, ...enfants) */
export function h(tag, attrs = {}, ...children) {
  let name = 'div', id = null;
  const classes = [];
  tag.replace(/^([a-zA-Z0-9-]+)?/, (m) => { if (m) name = m; return ''; });
  tag.replace(/#([\w-]+)/g, (_, v) => { id = v; return ''; });
  tag.replace(/\.([\w-]+)/g, (_, v) => { classes.push(v); return ''; });

  const el = document.createElement(name);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');

  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(4)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...children) => { clear(el); append(el, children); return el; };

export const uid = () => 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Secondes -> m:ss */
export function fmtDur(sec) {
  if (!sec && sec !== 0) return '—';
  const s = Math.round(Number(sec) || 0);
  if (!s) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** "3:45" | "225" | "225000" (ms) -> secondes */
export function parseDur(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(s)) {
    const p = s.split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  const n = Number(s.replace(',', '.'));
  if (!isFinite(n)) return null;
  return n > 10000 ? Math.round(n / 1000) : Math.round(n); // heuristique ms
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return isFinite(n) ? n : null;
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function debounce(fn, ms = 220) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------- Toasts --------------------------------- */
export function toast(msg, kind = '') {
  let host = $('#toasts');
  if (!host) { host = h('div#toasts'); document.body.append(host); }
  const el = h('div.toast' + (kind ? '.' + kind : ''), { text: msg });
  host.append(el);
  setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, 3200);
}

/* ------------------------------- Modale --------------------------------- */
export function modal({ title, body, actions = [], width }) {
  const backdrop = h('div.modal-backdrop');
  const box = h('div.modal', width ? { style: { maxWidth: width } } : {});
  if (title) box.append(h('h2', { text: title }));
  if (body) box.append(body);
  if (actions.length) {
    box.append(h('div.modal-actions', {}, actions.map((a) =>
      h('button.btn' + (a.cls ? '.' + a.cls : ''), {
        text: a.label,
        onclick: () => { const r = a.onClick?.(); if (r !== false) close(); },
      }))));
  }
  backdrop.append(box);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  function close() { document.removeEventListener('keydown', onKey); backdrop.remove(); }
  document.body.append(backdrop);
  return { close, box };
}

export function confirmDialog(title, message, confirmLabel = 'Supprimer') {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p.muted', { text: message }),
      actions: [
        { label: 'Annuler', onClick: () => resolve(false) },
        { label: confirmLabel, cls: 'btn-danger', onClick: () => resolve(true) },
      ],
    });
  });
}

export function promptDialog(title, value = '', label = 'Nom') {
  return new Promise((resolve) => {
    const input = h('input.input', { value, placeholder: label });
    const m = modal({
      title,
      body: h('div.field', {}, h('span.label', { text: label }), input),
      actions: [
        { label: 'Annuler', onClick: () => resolve(null) },
        { label: 'Valider', cls: 'btn-primary', onClick: () => resolve(input.value.trim() || null) },
      ],
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { resolve(input.value.trim() || null); m.close(); }
    });
    setTimeout(() => { input.focus(); input.select(); }, 40);
  });
}

/* -------------------------- Menu contextuel ----------------------------- */
export function popMenu(anchor, items) {
  $$('.menu').forEach((m) => m.remove());
  const menu = h('div.menu');
  for (const it of items) {
    if (it === '-') { menu.append(h('hr')); continue; }
    if (it.label && it.header) { menu.append(h('div.menu-label', { text: it.label })); continue; }
    if (it.raw) { menu.append(h('div.menu-item', {}, it.raw)); continue; }
    menu.append(h('button.menu-item', {
      onclick: (e) => { e.stopPropagation(); const keep = it.onClick?.(e); if (!keep) close(); },
    }, it.node || it.label));
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 10);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 10) top = Math.max(10, r.top - mh - 6);
  menu.style.left = Math.max(10, left) + 'px';
  menu.style.top = top + 'px';
  const off = (e) => { if (!menu.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', off), 0);
  function close() { document.removeEventListener('mousedown', off); menu.remove(); }
  return { close, menu };
}

/* ------------------------------ Fichiers -------------------------------- */
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(multiple ? Array.from(input.files) : input.files[0] || null); input.remove(); });
    document.body.append(input); input.click();
  });
}

export const readText = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = rej;
  r.readAsText(file, 'utf-8');
});

export const readBuffer = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsArrayBuffer(file);
});

/* -------------------------------- Icônes -------------------------------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  library: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="9" y="4" width="4" height="16" rx="1"/><path d="M16.5 5.2 20 19.3"/>',
  match: '<path d="M4 7h6M4 17h6"/><path d="M20 7h-4a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h4"/><path d="m17 4 3 3-3 3"/><path d="m17 14 3 3-3 3"/>',
  setlist: '<path d="M4 6h11M4 12h11M4 18h7"/><circle cx="18.5" cy="17" r="2.6"/><path d="M21.1 17V8.4l-3.5 1"/>',
  sessions: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 4v5"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 20V8"/><path d="m7 12 5-5 5 5"/><path d="M4 3h16"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
};

export function icon(name, size = 20, stroke = 1.9) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', stroke);
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}
