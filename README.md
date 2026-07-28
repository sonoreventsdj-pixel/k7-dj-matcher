# K7

> La cassette. Outil interne Sonor Events — en ligne sur https://k7-dj.netlify.app

Outil interne (Kévin + Andy — Sonor Events) pour :

1. **importer une bibliothèque DJ** (Serato, iTunes / Apple Music, CSV…) ;
2. **matcher une playlist Spotify ou Deezer** contre cette bibliothèque : ce qu'on a déjà,
   sous quelle version, et ce qu'il reste à récupérer ;
3. **mémoriser les choix de version** — un titre arbitré une fois est reconnu tout seul les fois suivantes ;
4. **exporter des crates Serato** prêtes à charger (principales et alternatives séparées).

Code 100 % original, sans dépendance ni build. Habillage repris de la charte My Projekt.
Usage privé, non commercial.

---

## Démarrer

Aucune installation : c'est un site statique.

```bash
# depuis la racine du projet
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

> Ouvrir `index.html` directement par double-clic **ne marche pas** : le projet utilise des
> modules ES, qui exigent un vrai serveur HTTP (`file://` est bloqué par les navigateurs).

Pour tester immédiatement : **Réglages → Charger le jeu de démonstration**
(40 morceaux annotés), puis **Copier la playlist de démo** et la coller dans le Matcher.

---

## Le parcours principal

### 1. Importer la bibliothèque

**Bibliothèque → Importer**, ou glisser-déposer le fichier.

| Source | Fichier à donner | Ce qu'on récupère |
|---|---|---|
| **Serato** | `database V2` (dossier `_Serato_` à la racine du disque ou dans `Musique/_Serato_`) | titre, artiste, album, genre, BPM, tonalité, durée, **débit (kbps)**, format, chemin |
| **Serato** | n'importe quel `.crate` (`_Serato_/Subcrates/`) | le contenu d'une crate |
| **iTunes / Apple Music** | `Bibliothèque.xml` (Fichier → Bibliothèque → Exporter la bibliothèque) | titre, artiste, album, genre, BPM, année, durée, **débit (kbps)**, format, nb de lectures, tonalité si elle est dans les commentaires |
| **CSV / TSV** | export Spotify, Soundiiz, Exportify, tableur… | en-têtes reconnus automatiquement (FR et EN) |
| **M3U / M3U8**, **JSON**, **XML** | — | reconnaissance automatique |
| **Texte collé** | `Artiste - Titre` par ligne | — |

Le dédoublonnage (même titre + même artiste) est activé par défaut.

### 2. Matcher une playlist

**Matcher → coller l'URL de la playlist → Lancer le matching.**

- **Deezer** : fonctionne immédiatement, rien à configurer.
- **Liens de partage courts** (`link.deezer.com/s/…`, `spotify.link/…`) : convertis
  automatiquement en ligne, grâce à la fonction Netlify `netlify/functions/resolve.mjs`
  (gratuite, sans dépendance, liste blanche de domaines). En local, l'app affiche la marche
  à suivre pour récupérer l'URL complète à la main.
- **Spotify** : une configuration en 2 minutes, une seule fois (voir plus bas).
- Sans URL, on peut aussi coller une liste de titres ou déposer un fichier
  (bloc « Autre source »).

L'écran de résultats reprend le principe de l'outil de référence :

- cinq compteurs cliquables — **Total / À vérifier / Matchés / Alternatives / À récupérer** —
  qui servent aussi de filtres ;
- une carte par titre de la playlist, sur deux lignes : le titre source en haut, la version
  retenue dans la bibliothèque en dessous (avec sa tonalité Camelot, son BPM, son nombre de lectures) ;
- clic sur la carte → la liste des candidats classés, avec pour chacun :
  - un **bouton radio** pour en faire la version principale,
  - un bouton **`≡+`** pour l'ajouter aux **alternatives**,
  - un score de confiance en % ;
- une option **« Aucune correspondance → À récupérer »** ;
- un bouton **Confirmer et mémoriser**.

### 3. La mémoire des correspondances

C'est le point clé : **chaque version validée est retenue**.

- La clé de mémorisation est le titre « nu » + l'artiste de la playlist — indépendamment de la
  version. Peu importe que la playlist écrive `Titre`, `Titre (Radio Edit)` ou `Titre - Remaster` :
  c'est le même souvenir.
- On mémorise la **version principale** *et* la liste des **alternatives**.
- On mémorise aussi les « **je ne l'ai pas** » (→ À récupérer).
- Au match suivant, ces titres arrivent déjà cochés, marqués **★ mémorisé**, et le message de
  fin indique combien ont été reconnus.
- **Réglages → Mémoire des correspondances** : consulter, exporter en CSV, oublier une décision
  ou tout vider.

### 4. La qualité audio

Le **débit en kbps** est lu à l'import et affiché partout : colonne dédiée dans la
bibliothèque (avec un filtre « 320 kbps et + », « moins de 192 », « sans perte »…) et badge
sur chaque candidat du Matcher. Un code couleur signale d'un coup d'œil ce qui est bon
(vert ≥ 256), moyen (orange ≥ 192) ou à remplacer (rouge en dessous). Les fichiers WAV,
AIFF, FLAC et ALAC sont marqués « Lossless ».

À score de correspondance égal, **la version au meilleur débit est proposée en premier**.

### 5. Exports

| Lot | Formats |
|---|---|
| **Versions principales** | `.crate` (Serato) · `.m3u8` · `.csv` · **PDF** |
| **Alternatives** | `.crate` (Serato) · `.m3u8` · `.csv` · **PDF** |
| **À récupérer** | `.csv` · **PDF** |

Les trois lots se cochent indépendamment dans le menu ⚙ à côté du bouton *Exporter* : on
peut par exemple sortir une crate pour les versions principales et une autre pour les
alternatives, en un seul clic.

**Où déposer une crate ?** Dans `_Serato_/Subcrates/`, puis relancer Serato — elle apparaît
dans la liste des crates. Seuls les morceaux dont on connaît le chemin de fichier peuvent y
figurer : c'est le cas si la bibliothèque a été importée depuis `database V2`.

> Les PDF passent par la fenêtre d'impression du navigateur → « Enregistrer au format PDF ».
> Aucune dépendance, mise en page dédiée, et ça marche aussi sur téléphone.

---

## Configurer Spotify (une seule fois)

Spotify n'autorise pas la lecture d'une playlist sans identification. On utilise le flux
**Authorization Code with PKCE**, prévu pour les applications sans serveur : il ne demande
**qu'un Client ID**, jamais de secret.

1. Aller sur <https://developer.spotify.com/dashboard> et **créer une app** (gratuit).
2. Dans **Redirect URIs**, coller **exactement** l'URL de l'application, par exemple :
   - en local : `http://localhost:8000/`
   - en ligne : `https://k7-dj.netlify.app/`
   (l'URL exacte à utiliser est affichée dans **Réglages → Connexion Spotify**)
3. Cocher **Web API**, enregistrer, copier le **Client ID**.
4. Dans l'app : **Réglages → Connexion Spotify** → coller le Client ID → **Enregistrer** →
   **Connecter Spotify**.

Deezer ne demande rien : les playlists publiques sont lues directement.

---

## Équipe

Deux profils, **Kévin** et **Andy**, choisis dans le bandeau du haut.
Chaque match porte un propriétaire et un état **partagé** (visible par les deux) ou
**privé** (visible seulement par son auteur).

En v1 les données vivent dans **le navigateur de chaque poste** : le partage réel entre les deux
machines se fait par **Réglages → Exporter / Restaurer une sauvegarde**, ou passera par Supabase
en v2 (voir plus bas).

---

## Déploiement (gratuit)

Le projet est un site statique : **aucun build, aucune variable d'environnement**.

### Cloudflare Pages (recommandé)

1. Pousser le dossier sur un dépôt GitHub / GitLab.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Réglages du build :
   - Framework preset : **None**
   - Build command : *(vide)*
   - Build output directory : **`/`**
4. Déployer → URL du type `https://k7.pages.dev`.
5. Reporter cette URL dans les **Redirect URIs** de l'app Spotify.

### Netlify

Glisser-déposer le dossier sur <https://app.netlify.com/drop>, ou connecter le dépôt avec
build command vide et publish directory `.` (le fichier `netlify.toml` est déjà fourni).

### GitHub Pages

Dépôt → **Settings → Pages** → Source : `main` / `/ (root)`.

---

## Structure

```
index.html
assets/
  css/theme.css        tokens de la charte My Projekt (sombre + clair)
  css/app.css          layout, composants métier, impression, responsive
  js/app.js            shell, navigation, profils, thème
  js/core/
    db.js              IndexedDB (tracks, matches, decisions, meta)
    store.js           état + persistance, API proche d'un CRUD Supabase
    util.js            helpers DOM, modales, menus, toasts, fichiers, icônes
    seed.js            jeu de démonstration
  js/lib/
    camelot.js         roue de Camelot : conversions entre notations
    matching.js        rapprochement playlist <-> bibliothèque
    memory.js          mémoire des choix de version
    playlist.js        Spotify (PKCE) et Deezer (JSONP)
    parsers/index.js   CSV, texte, M3U, XML iTunes, JSON
    parsers/serato.js  format binaire Serato (database V2, .crate)
    exporters/index.js CSV, M3U8, JSON, documents imprimables
    exporters/serato.js écriture des crates Serato (.crate)
  js/ui/
    components.js      badges tonalité / BPM / débit
    views/*.js         accueil, bibliothèque, matcher, matchs, réglages
tests/
  engine.test.mjs      tests unitaires du moteur (node --test)
  e2e.mjs              parcours complet automatisé (Playwright)
```

---

## Tests

```bash
node --test tests/engine.test.mjs        # moteur : camelot, scoring, matching, parsers

# parcours navigateur complet (nécessite Playwright + un serveur sur :8123)
python3 -m http.server 8123 &
npm i -D playwright && npx playwright install chromium
node tests/e2e.mjs
```

---

## Ce qui reste pour la v2

- **Supabase** (free tier) : authentification Kévin / Andy, vrai partage en temps réel,
  bibliothèque et sessions synchronisées entre les postes. Le store est déjà écrit pour que le
  passage se fasse en remplaçant `core/db.js`.
- **Engine DJ** (base SQLite) et **Rekordbox** — non prioritaires, non utilisés ici.
- Analyse audio locale pour détecter BPM, tonalité et débit réels des fichiers.
- PWA installable, mode hors ligne complet.

---

## Notes

- Tout est stocké **dans le navigateur** (IndexedDB). Rien n'est envoyé sur un serveur, sauf les
  appels à l'API Spotify / Deezer au moment de lire une playlist.
- En navigation privée, certains navigateurs bloquent IndexedDB : l'application prévient et
  refuse de démarrer plutôt que de perdre des données.
- Faire une **sauvegarde JSON** régulièrement (Réglages → Données) : vider les données du
  navigateur efface la bibliothèque.
