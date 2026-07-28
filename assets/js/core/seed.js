/* Jeu de démonstration : bibliothèque annotée + 1 setlist + 1 match d'exemple.
   Sert à tester le moteur immédiatement, se supprime depuis Réglages. */

import { makeTrack } from '../lib/parsers/index.js';
import { uid } from './util.js';

/* titre | artiste | bpm | camelot | genre | énergie | année | durée(s) | tags */
const RAW = [
  ['Warm Up Groove', 'Léon Dax', 118, '8A', 'Deep House', 3, 2021, 342, 'ouverture,chill'],
  ['Golden Hour', 'Maëlle', 120, '8A', 'Deep House', 4, 2022, 318, 'apéro'],
  ['Slow Motion', 'Nova Kort', 120, '9A', 'Deep House', 4, 2020, 305, 'apéro'],
  ['Blue Room', 'Sasha Ilm', 121, '9A', 'Deep House', 5, 2023, 289, ''],
  ['Paper Lights', 'Odalie', 122, '9B', 'Nu Disco', 5, 2019, 296, 'disco'],
  ['Velvet Drive', 'The Marlo', 122, '10A', 'Nu Disco', 5, 2021, 274, 'disco'],
  ['Night Shift', 'Kobra Lane', 124, '10A', 'Tech House', 6, 2022, 331, 'peak'],
  ['Concrete', 'Bexter', 124, '10B', 'Tech House', 6, 2023, 318, 'peak'],
  ['Basement Call', 'Ivo Renn', 125, '11A', 'Tech House', 7, 2023, 344, 'peak'],
  ['Red Signal', 'Dyna', 126, '11A', 'Tech House', 7, 2024, 302, 'peak'],
  ['Overdrive', 'Kobra Lane', 126, '11B', 'House', 8, 2022, 287, 'peak,drop'],
  ['Skyline', 'Amaury V', 128, '12A', 'House', 8, 2021, 321, 'peak'],
  ['Neon Rain', 'Sélène', 128, '12B', 'Progressive House', 8, 2023, 356, 'peak'],
  ['Hands Up', 'DJ Alto', 128, '1A', 'EDM', 9, 2020, 244, 'peak,mains en l\'air'],
  ['Firestarter', 'Val Rex', 130, '1B', 'EDM', 9, 2019, 232, 'peak'],
  ['Gravity', 'Nova Kort', 130, '2A', 'Big Room', 9, 2022, 218, 'drop'],
  ['Last Call', 'Odalie', 132, '2B', 'EDM', 10, 2024, 226, 'closing'],
  ['Afterglow', 'Maëlle', 123, '3A', 'Melodic Techno', 6, 2023, 388, ''],
  ['Circuit', 'Ivo Renn', 127, '3B', 'Techno', 8, 2024, 364, 'peak'],
  ['Iron Pulse', 'Bexter', 132, '4A', 'Techno', 9, 2023, 372, 'peak'],
  ['Midnight Tape', 'The Marlo', 110, '4B', 'Hip Hop', 5, 2018, 213, 'chill'],
  ['Block Party', 'Yassine K', 98, '5A', 'Hip Hop', 6, 2019, 198, 'hip hop'],
  ['Rewind', 'Yassine K', 95, '5B', 'Hip Hop', 5, 2021, 187, 'hip hop'],
  ['Bounce Back', 'Toko', 102, '6A', 'Trap', 7, 2022, 176, 'hip hop'],
  ['Loud', 'Toko', 140, '6B', 'Trap', 8, 2023, 165, 'hip hop'],
  ['Summer Skin', 'Lina Mar', 104, '7A', 'Pop', 5, 2022, 201, 'pop,mariage'],
  ['Paper Planes', 'Lina Mar', 108, '7B', 'Pop', 6, 2023, 194, 'pop,mariage'],
  ['Dance With Me', 'Céleste', 112, '8B', 'Pop', 6, 2021, 208, 'pop,mariage'],
  ['Slow Dance', 'Céleste', 76, '9A', 'Pop', 2, 2020, 236, 'slow,mariage'],
  ['Premier Regard', 'Antoine Vidal', 72, '10A', 'Variété', 2, 2019, 245, 'slow,ouverture de bal'],
  ['Toute la nuit', 'Antoine Vidal', 118, '10B', 'Variété', 6, 2022, 221, 'mariage'],
  ['Fiesta Loca', 'Los Bravos', 96, '11A', 'Reggaeton', 7, 2021, 189, 'latino'],
  ['Bailando Otra Vez', 'Los Bravos', 94, '11B', 'Reggaeton', 7, 2023, 196, 'latino'],
  ['Kizomba Nights', 'Ana Costa', 88, '12A', 'Kizomba', 4, 2020, 254, 'latino'],
  ['Amapiano Sun', 'Tsepo B', 112, '12B', 'Amapiano', 6, 2023, 312, 'afro'],
  ['Lagos Drive', 'Tsepo B', 106, '1A', 'Afrobeats', 6, 2022, 224, 'afro'],
  ['Jungle Line', 'Fadex', 174, '1B', 'Drum and Bass', 9, 2023, 288, 'dnb'],
  ['Deep Signal', 'Fadex', 172, '2A', 'Drum and Bass', 8, 2024, 301, 'dnb'],
  ['Closing Credits', 'Sélène', 118, '2B', 'Deep House', 3, 2024, 334, 'closing'],
  ['Goodnight', 'Léon Dax', 92, '3A', 'Downtempo', 2, 2021, 268, 'closing,fin de soirée'],
];

/** Playlist d'exemple pour tester le Matcher (volontairement "sale"). */
export const DEMO_PLAYLIST = `Léon Dax - Warm Up Groove
Maelle - Golden Hour (Extended Mix)
Nova Kort – Slow Motion [5:05]
Kobra Lane - Night Shift (Radio Edit)
Bexter - Concrete
Ivo Renn - Basement Call
Dyna - Red Signal
Amaury V - Skyline
DJ Alto - Hands Up
Val Rex - Firestarter (feat. Nova Kort)
Odalie - Last Call
Yassine K - Block Party
Toko - Bounce Back
Lina Mar - Summer Skin
Céleste - Dance With Me
Los Bravos - Fiesta Loca
Tsepo B - Lagos Drive
Fadex - Jungle Line
Sélène - Closing Credits
Artiste Inconnu - Morceau Introuvable
The Weeknd - Blinding Lights
Daft Punk - One More Time`;

export function demoTracks(owner = 'kevin') {
  return RAW.map((r) => makeTrack({
    title: r[0], artist: r[1], bpm: r[2], key: r[3], genre: r[4],
    energy: r[5], year: r[6], duration: r[7], tags: r[8],
    playCount: Math.floor(Math.random() * 40),
    source: 'démo', owner,
  }));
}

export function demoSetlist(tracks, owner = 'kevin') {
  const pick = (title) => tracks.find((t) => t.title === title);
  const order = [
    'Warm Up Groove', 'Golden Hour', 'Slow Motion', 'Blue Room', 'Paper Lights',
    'Velvet Drive', 'Night Shift', 'Concrete', 'Basement Call', 'Red Signal',
    'Overdrive', 'Skyline', 'Neon Rain', 'Hands Up', 'Last Call', 'Closing Credits',
  ];
  return {
    id: uid(), kind: 'setlist',
    name: 'Mariage — set principal (démo)',
    notes: 'Montée progressive 118 → 132 BPM, enchaînement 8A → 2B sur la roue.',
    items: order.map((t) => pick(t)).filter(Boolean).map((t) => ({ trackId: t.id })),
    owner, shared: true,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}
