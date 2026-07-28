/* Petits composants réutilisés par toutes les vues. */

import { h, fmtDur, icon } from '../core/util.js';
import { toClassic, keyHue } from '../lib/camelot.js';
import { quality } from '../lib/parsers/index.js';

export function keyBadge(camelot, { classic = true } = {}) {
  if (!camelot) return h('span.badge.muted-3', { text: '—' });
  const hue = keyHue(camelot);
  return h('span.badge.badge-key', {
    title: toClassic(camelot) || '',
    style: {
      background: `color-mix(in srgb, hsl(${hue} 70% 55%) 22%, transparent)`,
      color: `hsl(${hue} 72% 68%)`,
    },
  }, camelot + (classic && toClassic(camelot) ? ' · ' + toClassic(camelot) : ''));
}

export function bpmBadge(bpm) {
  if (!bpm) return h('span.badge.muted-3', { text: '—' });
  return h('span.badge.badge-bpm', { text: Math.round(bpm) + ' BPM' });
}

/** Badge de qualité audio : débit en kbps, ou « Lossless » pour wav/aiff/flac. */
export function bitrateBadge(track, { compact = false } = {}) {
  const q = quality(track);
  if (q.level === 'unknown') return compact ? null : h('span.badge.muted-3', { text: '—' });
  const colors = {
    lossless: ['var(--info)', 'Fichier sans perte'],
    high: ['var(--ok)', 'Qualité maximale'],
    ok: ['var(--ok)', 'Bonne qualité'],
    low: ['var(--warn)', 'Qualité moyenne — à remplacer si possible'],
    bad: ['var(--danger)', 'Qualité insuffisante pour la cabine'],
  };
  const [c, tip] = colors[q.level];
  return h('span.badge', {
    title: tip + (track.format ? ` · ${track.format.toUpperCase()}` : ''),
    style: { background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c },
    text: q.label,
  });
}

export function trackLine(t, { showMeta = true } = {}) {
  if (!t) return h('div.muted-3', { text: 'Morceau introuvable' });
  return h('div', {},
    h('div.truncate', { style: { fontWeight: '600' }, text: t.title || '(sans titre)' }),
    h('div.row.row-tight',
      { style: { marginTop: '3px' } },
      h('span.muted.small.truncate', { text: t.artist || 'Artiste inconnu' }),
      showMeta && t.camelot ? keyBadge(t.camelot, { classic: false }) : null,
      showMeta && t.bpm ? bpmBadge(t.bpm) : null,
      showMeta && t.duration ? h('span.muted-3.small.mono', { text: fmtDur(t.duration) }) : null,
    ),
  );
}

export function stat(value, label, cls = '') {
  return h('div.stat' + (cls ? '.grad.' + cls : ''), {},
    h('div.v', { text: String(value) }),
    h('div.k', { text: label }));
}

export function emptyState(title, message, action) {
  return h('div.empty', {},
    h('div.big', { text: '🎛️' }),
    h('h3', { text: title }),
    h('p.muted', { style: { marginTop: '6px' }, text: message }),
    action ? h('div', { style: { marginTop: '18px' } }, action) : null);
}

export function sectionCard(title, subtitle, ...content) {
  const card = h('div.card');
  if (title) {
    card.append(h('div.card-head', {},
      h('div', {}, h('h2', { text: title }), subtitle ? h('div.sub', { text: subtitle }) : null)));
  }
  card.append(h('div.card-pad', {}, ...content));
  return card;
}

export const btn = (label, opts = {}) => {
  const { variant = '', ico, onClick, title, sm, disabled } = opts;
  const b = h('button.btn' + (variant ? '.' + variant : '') + (sm ? '.btn-sm' : ''),
    { onclick: onClick, title, disabled });
  if (ico) b.append(icon(ico, sm ? 14 : 16));
  if (label) b.append(document.createTextNode(label));
  return b;
};
