/* Petits composants réutilisés par toutes les vues. */

import { h, fmtDur, icon } from '../core/util.js';
import { toClassic, keyHue } from '../lib/camelot.js';
import { scoreColor } from '../lib/scoring.js';

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

export function energyDots(energy) {
  const wrap = h('span.row-tight', { style: { display: 'inline-flex', gap: '2px' }, title: energy ? `Énergie ${energy}/10` : 'Énergie inconnue' });
  for (let i = 1; i <= 10; i++) {
    wrap.append(h('i', {
      style: {
        width: '4px', height: '11px', borderRadius: '2px',
        background: energy && i <= energy
          ? `hsl(${Math.round(150 - (energy / 10) * 150)} 72% 52%)`
          : 'var(--line-strong)',
      },
    }));
  }
  return wrap;
}

export function scoreRing(score) {
  const c = scoreColor(score);
  const r = 15, circ = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('width', '38'); svg.setAttribute('height', '38');
  svg.innerHTML =
    `<circle cx="18" cy="18" r="${r}" fill="none" stroke="var(--line-strong)" stroke-width="3"/>
     <circle cx="18" cy="18" r="${r}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"
       stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - score / 100)}" transform="rotate(-90 18 18)"/>
     <text x="18" y="21.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${score}</text>`;
  return svg;
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
