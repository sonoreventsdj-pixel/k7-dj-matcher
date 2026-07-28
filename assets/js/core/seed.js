/* Jeu de démonstration : petite bibliothèque + une playlist volontairement « sale »
   pour tester le matching immédiatement. Se supprime depuis Réglages. */

import { makeTrack } from '../lib/parsers/index.js';

/* titre | artiste | bpm | camelot | genre | année | durée(s) | tags | débit */
const RAW = [
  ['Warm Up Groove', 'Léon Dax', 118, '8A', 'Deep House', 2021, 342, 'ouverture,chill', 256],
  ['Golden Hour', 'Maëlle', 120, '8A', 'Deep House', 2022, 318, 'apéro', 320],
  ['Slow Motion', 'Nova Kort', 120, '9A', 'Deep House', 2020, 305, 'apéro', 320],
  ['Blue Room', 'Sasha Ilm', 121, '9A', 'Deep House', 2023, 289, '', 320],
  ['Paper Lights', 'Odalie', 122, '9B', 'Nu Disco', 2019, 296, 'disco', 256],
  ['Velvet Drive', 'The Marlo', 122, '10A', 'Nu Disco', 2021, 274, 'disco', 320],
  ['Night Shift', 'Kobra Lane', 124, '10A', 'Tech House', 2022, 331, 'peak', 192],
  ['Concrete', 'Bexter', 124, '10B', 'Tech House', 2023, 318, 'peak', 256],
  ['Basement Call', 'Ivo Renn', 125, '11A', 'Tech House', 2023, 344, 'peak', 256],
  ['Red Signal', 'Dyna', 126, '11A', 'Tech House', 2024, 302, 'peak', 320],
  ['Overdrive', 'Kobra Lane', 126, '11B', 'House', 2022, 287, 'peak,drop', 320],
  ['Skyline', 'Amaury V', 128, '12A', 'House', 2021, 321, 'peak', 256],
  ['Neon Rain', 'Sélène', 128, '12B', 'Progressive House', 2023, 356, 'peak', 192],
  ['Hands Up', 'DJ Alto', 128, '1A', 'EDM', 2020, 244, "peak,mains en l'air", 320],
  ['Firestarter', 'Val Rex', 130, '1B', 'EDM', 2019, 232, 'peak', 320],
  ['Gravity', 'Nova Kort', 130, '2A', 'Big Room', 2022, 218, 'drop', 256],
  ['Last Call', 'Odalie', 132, '2B', 'EDM', 2024, 226, 'closing', 320],
  ['Afterglow', 'Maëlle', 123, '3A', 'Melodic Techno', 2023, 388, '', 256],
  ['Circuit', 'Ivo Renn', 127, '3B', 'Techno', 2024, 364, 'peak', 192],
  ['Iron Pulse', 'Bexter', 132, '4A', 'Techno', 2023, 372, 'peak', 320],
  ['Midnight Tape', 'The Marlo', 110, '4B', 'Hip Hop', 2018, 213, 'chill', 320],
  ['Block Party', 'Yassine K', 98, '5A', 'Hip Hop', 2019, 198, 'hip hop', 256],
  ['Rewind', 'Yassine K', 95, '5B', 'Hip Hop', 2021, 187, 'hip hop', 320],
  ['Bounce Back', 'Toko', 102, '6A', 'Trap', 2022, 176, 'hip hop', 256],
  ['Loud', 'Toko', 140, '6B', 'Trap', 2023, 165, 'hip hop', 320],
  ['Summer Skin', 'Lina Mar', 104, '7A', 'Pop', 2022, 201, 'pop,mariage', 192],
  ['Paper Planes', 'Lina Mar', 108, '7B', 'Pop', 2023, 194, 'pop,mariage', 320],
  ['Dance With Me', 'Céleste', 112, '8B', 'Pop', 2021, 208, 'pop,mariage', 320],
  ['Slow Dance', 'Céleste', 76, '9A', 'Pop', 2020, 236, 'slow,mariage', 256],
  ['Premier Regard', 'Antoine Vidal', 72, '10A', 'Variété', 2019, 245, 'slow,ouverture de bal', 320],
  ['Toute la nuit', 'Antoine Vidal', 118, '10B', 'Variété', 2022, 221, 'mariage', 320],
  ['Fiesta Loca', 'Los Bravos', 96, '11A', 'Reggaeton', 2021, 189, 'latino', 320],
  ['Bailando Otra Vez', 'Los Bravos', 94, '11B', 'Reggaeton', 2023, 196, 'latino', 256],
  ['Kizomba Nights', 'Ana Costa', 88, '12A', 'Kizomba', 2020, 254, 'latino', 256],
  ['Amapiano Sun', 'Tsepo B', 112, '12B', 'Amapiano', 2023, 312, 'afro', 192],
  ['Lagos Drive', 'Tsepo B', 106, '1A', 'Afrobeats', 2022, 224, 'afro', 320],
  ['Jungle Line', 'Fadex', 174, '1B', 'Drum and Bass', 2023, 288, 'dnb', 320],
  ['Deep Signal', 'Fadex', 172, '2A', 'Drum and Bass', 2024, 301, 'dnb', 320],
  ['Closing Credits', 'Sélène', 118, '2B', 'Deep House', 2024, 334, 'closing', 256],
  ['Goodnight', 'Léon Dax', 92, '3A', 'Downtempo', 2021, 268, 'closing,fin de soirée', 256],
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
    year: r[5], duration: r[6], tags: r[7], bitrate: r[8], format: 'mp3',
    location: `/Users/kevin/Music/K7-demo/${r[1]} - ${r[0]}.mp3`,
    playCount: Math.floor(Math.random() * 40),
    source: 'démo', owner,
  }));
}
