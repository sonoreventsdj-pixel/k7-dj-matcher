# Setlist Studio

Outil interne (Kévin + Andy — Sonor Events) pour :

1. **importer une bibliothèque DJ** (Serato, iTunes / Apple Music, CSV…) ;
2. **matcher une playlist Spotify ou Deezer** contre cette bibliothèque : ce qu'on a déjà,
   sous quelle version, et ce qu'il reste à récupérer ;
3. **mémoriser les choix de version** — un titre arbitré une fois est reconnu tout seul les fois suivantes ;
4. **construire des setlists harmoniques** (roue de Camelot, BPM, énergie) en glisser-déposer.

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
(40 morceaux annotés + une setlist), puis **Copier la playlist de démo** et la coller dans
le Matcher.

---

## Le parcours principal

### 1. Importer la bibliothèque

**Bibliothèque → Importer**, ou glisser-déposer le fichier.

| Source | Fichier à donner | Ce qu'on récupère |
|---|---|---|
| **Serato** | `database V2` (dossier `_Serato_` à la racine du disque ou dans `Musique/_Serato_`) | titre, artiste, album, genre, BPM, tonalité, durée, chemin |
| **Serato** | n'importe quel `.crate` (`_Serato_/Subcrates/`) | le contenu d'une crate |
| **iTunes / Apple Music** | `Bibliothèque.xml` (Fichier → Bibliothèque → Exporter la bibliothèque) | titre, artiste, album, genre, BPM, année, durée, nb de lectures, tonalité si elle est dans les commentaires |
| **CSV / TSV** | export Spotify, Soundiiz, Exportify, tableur… | en-têtes reconnus automatiquement (FR et EN) |
| **M3U / M3U8**, **JSON**, **XML** | — | reconnaissance automatique |
| **Texte collé** | `Artiste - Titre` par ligne | — |

Le dédoublonnage (même titre + même artiste) est activé par défaut.

### 2. Matcher une playlist

**Matcher → coller l'URL de la playlist → Lancer le matching.**

- **Deezer** : fonctionne immédiatement, rien à configurer.
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

### 4. Setlist

Depuis un morceau, l'outil propose les compatibles avec un score sur 100 combinant :

- **compatibilité harmonique** (roue de Camelot : même clé, ±1, relatif majeur/mineur…) ;
- **proximité BPM**, tolérance paramétrable en % ou en BPM absolus, avec option demi/double tempo ;
- **cohérence d'énergie** (1-10), avec bonus si l'énergie monte ;
- **cohérence de genre** (familles : house, techno, hip-hop, latino, afro…).

Tous les poids sont réglables dans **Réglages → Moteur de compatibilité**.
L'écran affiche la **courbe d'énergie**, la **suite des tonalités** avec les sauts risqués en
rouge, et note chaque transition. Réordonnancement par **glisser-déposer**.

### 5. Exports

| Depuis | Formats |
|---|---|
| Matcher | `.m3u8` (principales + alternatives), `.csv` et **PDF** de la liste à récupérer |
| Setlist | `.csv`, `.m3u8`, **PDF** imprimable format cabine |
| Bibliothèque | `.csv`, `.m3u8`, **PDF** |
| Réglages | sauvegarde **JSON** complète (et restauration) |

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
   - en ligne : `https://setlist-studio.pages.dev/`
   (l'URL exacte à utiliser est affichée dans **Réglages → Connexion Spotify**)
3. Cocher **Web API**, enregistrer, copier le **Client ID**.
4. Dans l'app : **Réglages → Connexion Spotify** → coller le Client ID → **Enregistrer** →
   **Connecter Spotify**.

Deezer ne demande rien : les playlists publiques sont lues directement.

---

## Équipe

Deux profils, **Kévin** et **Andy**, choisis dans le bandeau du haut.
Chaque setlist et chaque match porte un propriétaire et un état **partagé** (visible par les
deux) ou **privé** (visible seulement par son auteur).

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
4. Déployer → URL du type `https://setlist-studio.pages.dev`.
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
    db.js              IndexedDB (tracks, setlists, matches, decisions, meta)
    store.js           état + persistance, API proche d'un CRUD Supabase
    util.js            helpers DOM, modales, menus, toasts, fichiers, icônes
    seed.js            jeu de démonstration
  js/lib/
    camelot.js         roue de Camelot, conversions, compatibilité
    scoring.js         score de compatibilité entre deux morceaux
    matching.js        rapprochement playlist <-> bibliothèque
    memory.js          mémoire des choix de version
    playlist.js        Spotify (PKCE) et Deezer (JSONP)
    parsers/index.js   CSV, texte, M3U, XML iTunes, JSON
    parsers/serato.js  format binaire Serato (database V2, .crate)
    exporters/index.js CSV, M3U8, JSON, documents imprimables
  js/ui/
    components.js      badges tonalité/BPM, jauge d'énergie, anneau de score
    views/*.js         accueil, bibliothèque, matcher, setlist, sessions, réglages
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
- Écriture de **`.crate` Serato** (le format binaire est déjà lu, il reste à l'écrire).
- **Engine DJ** (base SQLite) et **Rekordbox** — non prioritaires, non utilisés ici.
- Analyse audio locale pour détecter BPM et tonalité des fichiers sans métadonnées.
- PWA installable, mode hors ligne complet.

---

## Notes

- Tout est stocké **dans le navigateur** (IndexedDB). Rien n'est envoyé sur un serveur, sauf les
  appels à l'API Spotify / Deezer au moment de lire une playlist.
- En navigation privée, certains navigateurs bloquent IndexedDB : l'application prévient et
  refuse de démarrer plutôt que de perdre des données.
- Faire une **sauvegarde JSON** régulièrement (Réglages → Données) : vider les données du
  navigateur efface la bibliothèque.
