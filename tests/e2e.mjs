/* Parcours navigateur automatisé (Playwright + Chromium). Voir README. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8123/';
const errors = [];
const shots = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (m.type() !== 'error') return;
  if (/ERR_TUNNEL_CONNECTION_FAILED|fonts\.googleapis|fonts\.gstatic/.test(t)) return;  // polices bloquées dans le bac à sable
  errors.push('[console] ' + t);
});
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

const step = async (name, fn) => {
  process.stdout.write('· ' + name + ' … ');
  try { await fn(); console.log('ok'); }
  catch (e) { console.log('ÉCHEC'); errors.push(`[${name}] ${e.message}`); }
};
const shot = async (name) => { const p = `/tmp/shot-${name}.png`; await page.screenshot({ path: p }); shots.push(p); };

await step('chargement', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar .nav-item', { timeout: 8000 });
});

await step('jeu de démonstration', async () => {
  await page.click('[data-view=settings]');
  await page.waitForSelector('text=Charger le jeu de démonstration');
  await page.click('text=Charger le jeu de démonstration');
  await page.waitForTimeout(700);
});

await step('bibliothèque remplie', async () => {
  await page.click('[data-view=library]');
  await page.waitForSelector('table.tbl tbody tr');
  const n = await page.locator('table.tbl tbody tr').count();
  if (n < 10) throw new Error('seulement ' + n + ' lignes');
});
await shot('library');

await step('recherche + filtre bibliothèque', async () => {
  await page.fill('input[placeholder^="Rechercher un titre"]', 'skyline');
  await page.waitForTimeout(400);
  const n = await page.locator('table.tbl tbody tr').count();
  if (n !== 1) throw new Error('filtre : ' + n + ' résultats au lieu de 1');
  await page.fill('input[placeholder^="Rechercher un titre"]', '');
  await page.waitForTimeout(400);
});

await step('matcher : coller une playlist et lancer', async () => {
  await page.click('[data-view=matcher]');
  await page.waitForSelector('text=Match ta playlist');
  await page.click('summary');
  await page.fill('textarea', [
    'Kobra Lane - Night Shift',
    'Maëlle - Golden Hour (Extended Mix)',
    'Amaury V - Skyline',
    'Odalie - Last Call',
    'Sélène - Neon Rain',
    'Artiste Inconnu - Morceau Introuvable',
  ].join('\n'));
  await page.click('button:has-text("Lancer le matching")');
  await page.waitForSelector('.match-row', { timeout: 15000 });
});
await shot('matcher-results');

await step('compteurs cohérents', async () => {
  const total = await page.locator('.stat').first().locator('.v').textContent();
  if (total.trim() !== '6') throw new Error('total = ' + total);
  const rows = await page.locator('.match-row').count();
  if (rows !== 6) throw new Error('lignes = ' + rows);
});

await step('déplier une ligne, choisir « aucune correspondance » puis revenir', async () => {
  const row = page.locator('.match-row').first();
  await row.locator('.match-head').click();
  await page.waitForSelector('.cand');
  const cands = await page.locator('.cand').count();
  if (cands < 2) throw new Error('pas de candidats');

  // dernière option = « Aucune correspondance → À récupérer »
  await page.locator('.cand').last().locator('input[type=radio]').check();
  await page.waitForTimeout(600);
  if (await page.locator('.cand.chosen').count() !== 0) throw new Error('« aucune correspondance » non pris en compte');

  // on revient sur la vraie version : elle doit être marquée comme principale
  await page.locator('.cand').first().locator('input[type=radio]').check();
  await page.waitForTimeout(600);
  if (await page.locator('.cand.chosen').count() !== 1) throw new Error('la sélection principale n\'est pas marquée');

  // et on l'ajoute aussi comme alternative sur une autre ligne si possible
  if (await page.locator('.cand .cand-add').count() > 1) {
    await page.locator('.cand .cand-add').nth(1).click();
    await page.waitForTimeout(400);
  }
});

await shot('matcher-candidates');

await step('mémorisation du choix', async () => {
  const badge = await page.locator('.badge:has-text("mémorisé")').count();
  await page.click('[data-view=settings]');
  await page.waitForSelector('text=Mémoire des correspondances');
  await page.waitForTimeout(500);
  const txt = await page.locator('.badge:has-text("décision")').first().textContent();
  if (!/[1-9]/.test(txt)) throw new Error('aucune décision mémorisée : ' + txt);
});

await step('rematch : le choix est réappliqué', async () => {
  await page.click('[data-view=matcher]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Nouveau match")');
  await page.waitForSelector('text=Match ta playlist');
  await page.click('summary');
  await page.fill('textarea', 'Kobra Lane - Night Shift\nAmaury V - Skyline');
  await page.click('button:has-text("Lancer le matching")');
  await page.waitForSelector('.match-row', { timeout: 15000 });
  const mem = await page.locator('.badge:has-text("mémorisé")').count();
  if (!mem) throw new Error('le choix mémorisé n\'a pas été réappliqué');
});

await step('setlist : création + suggestions + drag', async () => {
  await page.click('[data-view=setlist]');
  await page.waitForTimeout(400);
  const hasSl = await page.locator('.sl-item').count();
  if (!hasSl) throw new Error('la setlist de démo est vide');
  if (!await page.locator('.curve').count()) throw new Error('pas de courbe d\'énergie');
  if (!await page.locator('.keychain .badge').count()) throw new Error('pas de suite de tonalités');
  if (!await page.locator('.sugg').count()) throw new Error('pas de suggestions');
  const first = await page.locator('.sl-item .body .t').first().textContent();
  await page.locator('.sl-item').nth(2).hover();
  // réordonnancement via l'API de glisser-déposer
  await page.locator('.sl-item').first().dragTo(await page.locator('.sl-item').nth(3));
  await page.waitForTimeout(500);
  const now = await page.locator('.sl-item .body .t').first().textContent();
  if (now === first) throw new Error('le glisser-déposer n\'a pas réordonné');
});
await shot('setlist');

await step('sessions', async () => {
  await page.click('[data-view=sessions]');
  await page.waitForSelector('.sess');
  if (!await page.locator('.sess').count()) throw new Error('aucune session');
  await page.click('button:has-text("Matchs (")');
  await page.waitForTimeout(300);
  if (!await page.locator('.sess').count()) throw new Error('aucun match enregistré');
});
await shot('sessions');

await step('thème clair', async () => {
  await page.click('[data-view=settings]');
  await page.waitForSelector('button:has-text("Clair")');
  await page.click('button:has-text("Clair")');
  await page.waitForTimeout(400);
  const t = await page.getAttribute('html', 'data-theme');
  if (t !== 'light') throw new Error('thème = ' + t);
});
await shot('theme-light');

await step('persistance après rechargement', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar .nav-item');
  const t = await page.getAttribute('html', 'data-theme');
  if (t !== 'light') throw new Error('thème non persisté');
  await page.click('[data-view=library]');
  await page.waitForSelector('table.tbl tbody tr');
  await page.click('[data-view=settings]');
  await page.waitForSelector('button:has-text("Sombre")');
  await page.click('button:has-text("Sombre")');
});

await step('mobile 390px', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-view=matcher]');
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error('débordement horizontal de ' + overflow + 'px');
  const nav = await page.evaluate(() => {
    const r = document.querySelector('.sidebar').getBoundingClientRect();
    return { bottom: Math.round(r.bottom), h: Math.round(r.height) };
  });
  if (nav.h > 90) throw new Error('la nav mobile ne s\'est pas transformée en barre basse');
});
await shot('mobile');

await step('mobile setlist sans débordement', async () => {
  await page.click('[data-view=setlist]');
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error('débordement de ' + overflow + 'px');
});
await shot('mobile-setlist');

await browser.close();

console.log('\nCaptures : ' + shots.join(', '));
if (errors.length) { console.log('\n⚠️  ' + errors.length + ' problème(s) :'); errors.forEach((e) => console.log('   - ' + e)); process.exit(1); }
console.log('\n✅ Parcours complet OK, aucune erreur console.');
