/* Identité visuelle K7.
   Le logo est fourni en SVG dans assets/img/. Il est aussi disponible ici sous
   forme de chaîne, pour les documents imprimés : la fenêtre d'impression est
   autonome (about:blank), les chemins relatifs n'y résolvent pas. */

export const BRAND = {
  name: 'K7',
  tagline: 'Sonor Events',
  gradient: ['#201F54', '#5C3B8A', '#2162A1'],
};

const CASSETTE_PATH = 'M9,10 H55 A7,7 0 0 1 62,17 V47 A7,7 0 0 1 55,54 H9 A7,7 0 0 1 2,47 V17 A7,7 0 0 1 9,10 Z M21.5,16 H24.6 V21.4 L29.2,16 H32.9 L27.4,22.3 L33.2,29 H29.3 L24.6,23.3 V29 H21.5 Z M35.5,16 H44 V18.7 L39.6,29 H35.8 L40.4,19 H35.5 Z M17,33 H47 A3,3 0 0 1 50,36 V45 A3,3 0 0 1 47,48 H17 A3,3 0 0 1 14,45 V36 A3,3 0 0 1 17,33 Z M28.5,40.5 A4.5,4.5 0 1 1 19.5,40.5 A4.5,4.5 0 1 1 28.5,40.5 Z M44.5,40.5 A4.5,4.5 0 1 1 35.5,40.5 A4.5,4.5 0 1 1 44.5,40.5 Z';

/** Logo K7 en SVG inline. `fill` : couleur unie, ou 'gradient'. */
export function logoSvg({ fill = '#FFFFFF', size = 64, id = 'k7g' } = {}) {
  const grad = fill === 'gradient';
  const paint = grad ? `url(#${id})` : fill;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="K7">` +
    (grad ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
      BRAND.gradient.map((c, i) => `<stop offset="${i / (BRAND.gradient.length - 1)}" stop-color="${c}"/>`).join('') +
      `</linearGradient></defs>` : '') +
    `<path fill-rule="evenodd" fill="${paint}" d="${CASSETTE_PATH}"/></svg>`;
}

/** Data URI, pour un <img> ou une feuille de style autonome. */
export const logoDataUri = (opts) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSvg(opts));
