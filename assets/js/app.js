/* K7 — point d'entrée : shell, navigation, sélecteur de profil, thème. */

import { h, mount, icon, popMenu, toast } from './core/util.js';
import * as store from './core/store.js';
import * as memory from './lib/memory.js';
import * as playlist from './lib/playlist.js';

import * as HomeView from './ui/views/home.js';
import * as LibraryView from './ui/views/library.js';
import * as MatcherView from './ui/views/matcher.js';
import * as SessionsView from './ui/views/sessions.js';
import * as SettingsView from './ui/views/settings.js';

const VIEWS = [
  { id: 'home', label: 'Accueil', icon: 'home', view: HomeView },
  { id: 'library', label: 'Bibliothèque', icon: 'library', view: LibraryView },
  { id: 'matcher', label: 'Matcher', icon: 'match', view: MatcherView },
  { id: 'sessions', label: 'Matchs', icon: 'sessions', view: SessionsView },
  { id: 'settings', label: 'Réglages', icon: 'settings', view: SettingsView },
];

let current = 'home';
let outlet = null;

/* ------------------------------- Shell ---------------------------------- */
function buildShell() {
  const logo = h('div.logo', { title: 'K7' });
  logo.innerHTML = `<svg viewBox="0 0 50 40" fill="none" aria-label="K7">
    <path d="M3 6h6v11.5L21 6h8L15.5 19.5 29 34h-8.5L9 22v12H3z" fill="#fff"/>
    <path d="M33 6h14v4.4L39.6 34h-6.2l7.3-23.2H33z" fill="#fff" opacity=".9"/></svg>`;

  const nav = h('nav.sidebar', {}, logo);
  for (const v of VIEWS) {
    nav.append(h('button.nav-item', {
      dataset: { view: v.id }, title: v.label, onclick: () => navigate(v.id),
    }, icon(v.icon, 21), h('span.tip', { text: v.label })));
  }

  outlet = h('div#outlet');

  const themeBtn = h('button.btn.btn-icon.btn-ghost', {
    title: 'Changer de thème',
    onclick: async () => { await store.toggleTheme(); refreshTopbar(); },
  });

  const profChip = h('button.profile-chip', { id: 'profile-chip', onclick: (e) => profileMenu(e.currentTarget) });

  const topbar = h('header.topbar', {},
    h('h1', { id: 'page-title', text: 'Accueil' }),
    h('div.spacer'),
    profChip, themeBtn);

  const main = h('main.main', {}, topbar, outlet);
  const app = h('div.app', {}, nav, main);
  document.body.append(app);

  window.__refreshTopbar = () => {
    const p = store.profile();
    mount(profChip, h('span.avatar.' + p.cls, { text: p.initials }), h('span', { text: p.name }));
    mount(themeBtn, icon(store.state.theme === 'dark' ? 'sun' : 'moon', 16));
    document.getElementById('page-title').textContent = VIEWS.find((v) => v.id === current)?.label || '';
  };
  refreshTopbar();
}

const refreshTopbar = () => window.__refreshTopbar?.();

function profileMenu(anchor) {
  popMenu(anchor, [
    { label: 'Profil actif', header: true },
    ...store.PROFILES.map((p) => ({
      node: h('span.row.row-tight', {},
        h('span.avatar.' + p.cls, { text: p.initials }),
        h('span', { text: p.name }),
        p.id === store.state.profile ? h('span.badge.badge-info', { text: 'actif' }) : null),
      onClick: async () => { await store.setProfile(p.id); refreshTopbar(); renderCurrent(); },
    })),
    '-',
    { label: 'Réglages de l\'équipe', onClick: () => navigate('settings') },
  ]);
}

/* ----------------------------- Navigation ------------------------------- */
export function navigate(id) {
  if (!VIEWS.some((v) => v.id === id)) id = 'home';
  current = id;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
  if (location.hash.slice(1) !== id) history.replaceState({}, '', '#' + id);
  refreshTopbar();
  renderCurrent();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderCurrent() {
  const v = VIEWS.find((x) => x.id === current);
  try { v.view.render(outlet); }
  catch (e) { console.error(e); mount(outlet, h('div.card.card-pad', {}, h('h2', { text: 'Erreur' }), h('p.muted', { text: e.message }))); }
}

document.addEventListener('nav', (e) => navigate(e.detail));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'home'));

/* ------------------------------ Démarrage ------------------------------- */
(async function boot() {
  try {
    await store.init();
    await memory.load();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif">
      <h2>Stockage indisponible</h2>
      <p>Ce navigateur bloque IndexedDB (navigation privée ?). K7 a besoin du stockage local pour fonctionner.</p></div>`;
    return;
  }
  buildShell();

  /* Retour d'autorisation Spotify */
  try {
    const back = await playlist.handleRedirect();
    if (back) { toast('Spotify connecté', 'ok'); navigate(back === 'settings' ? 'settings' : 'matcher'); return; }
  } catch (e) { toast(e.message, 'err'); }

  navigate(location.hash.slice(1) || 'home');
})();
