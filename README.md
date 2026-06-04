# The Last Adventure 🗡️

**RPG / MMORPG 2D top-down en pixel art, jouable au navigateur** (PC + mobile/PWA), développé en **Phaser 3.90 + Vite 7**, budget 0 €.
Monde : **Iroas**. Philosophie : **solo d'abord**, MVP strict, multijoueur prévu en Phase 4.

> Dépôt public. Le jeu est entièrement en **français**.

![Aperçu](<screenshot/Capture d'écran 2026-06-03 095015.png>)

---

## 🚀 Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:5173
```
- `npm run build` → build de production (`dist/`), `npm run preview` pour le tester.
- **Aucun backend** : la sauvegarde est dans le `localStorage` du navigateur (`src/data/save.js`).
- ⚠️ Après une modif, faire un **rechargement complet** (Ctrl+Maj+R) — Vite HMR ne relance pas `create()`/`preload()` de Phaser.

## 🎮 Contrôles

| Touche | Action |
|---|---|
| **ZQSD / WASD / flèches** | Déplacement (ou **clic** = se déplacer vers le point) |
| **Espace** (mêlée) / **F** (distance) / **clic droit** | Attaque de base |
| **1 / 2 / 3** | Sort de classe · 2ᵉ compétence (niv 10) · compétence de **set** (panoplie complète) |
| **Tab** | Cibler l'ennemi visible le plus proche / cycler |
| **E** | Interagir (PNJ, marchand, forgeron) |
| **C** ou clic sur le **portrait** / bouton **« Perso »** (bas-gauche) | Fiche personnage |
| **J** | Journal de quêtes · **M** / clic minimap | Carte du monde |
| **X** | Afficher/masquer l'arme tenue en main |

## ✨ Fonctionnalités

- **4 classes** complètes (Guerrier, Tank, Mage, Soigneur), 3 apparences chacune, 2 barres Vie/Mana, attaque spammable, **3 compétences** (sort 1, sort 2 niv 10, **sort 3 de panoplie**).
- **Mage élémentaire** : l'élément suit l'apparence (feu = brûlure, glace = ralenti, ombre = affaiblissement).
- **Équipement 4 slots** (Arme / Armure / Relique / Anneau), **4 raretés** (Commun → Rare → Épique → Légendaire) + **panoplies de classe** (pièces vert émeraude, bonus 2/4, compétence touche 3). Forge (réparation/amélioration), marché 2 colonnes, matériaux empilables.
- **Boss** : ~15 boss à sprites dédiés (système « rig »), patterns télégraphiés (charge, saut-slam, bull-rush, déluge, transfo), 2 vrais **boss de raid** + arènes scellées, Dragon des Abysses d'ambiance.
- **Systèmes de survie** : **température** (froid/chaud par biome, feu de camp posable), **cycle jour/nuit** (20 min).
- **Monde** : carte déterministe (île, biomes Voronoï, rivières + ponts, île maudite end-game), village vivant, **17 quêtes** data-driven, **minimap** + carte plein écran.
- **UI** : HUD WoW-like, **barre de compétences** (icônes, cooldown chiffré, cadenas), **fiche perso paper-doll** (thème cuir/or, set récompense, stats à icônes).
- **Audio** : musique par zone, bruitages combat, jingles, ambiance.

## 🗂️ Architecture (`src/`)

- `main.js` — config Phaser + ordre des scènes.
- `scenes/` — **Boot** (préload + anims), **Menu**, **Intro**, **Character** (création), **Game** (le monde, ~5000 lignes), **UI** (HUD/panneaux, scène séparée non-zoomée).
- `entities/` — **Player**, **Monster**, **Projectile**, **Drop**.
- `data/` — **items.js** (`ITEMS`/`RARITY`/`SETS`), **classes.js** (`CLASSES`/`MAGE_KITS`/`SKILL_ICONS`), **quests.js**, **save.js**, **sound.js**.

## 🎨 Assets & licences — voir [`CREDITS.md`](CREDITS.md)

3 packs principaux + UI :
- **Ninja Adventure** (Pixel-boy & AAA) — **CC0** : base (perso, monstres/boss, tilesets, FX, audio, UI).
- **Kyrise's 16×16 RPG Icons** — **CC BY 4.0** (crédit obligatoire) : icônes d'objets.
- **Admurin's Armory** — gratuit commercial : armes spectaculaires (légendaires/set).
- **RPG Ability Icons** (frosty_rabbid) — **CC0** : barre de compétences.
- **Sprout Lands** & **Mystic Woods** — **NON-COMMERCIAUX** (sols/eau/forêt) → à remplacer avant toute distribution commerciale.

⚠️ Les **packs bruts ne sont pas redistribués** (gitignorés dans `Full_Asset/`) ; seuls les sprites **réellement utilisés** sont dans `public/assets/` (cf. `CREDITS.md`).

## 📋 État & feuille de route

**Solo (Phase 1-3) : très avancé.** Tout le système items/raretés/panoplies/sorts/UI est refait (« Brief A », 10/10 + audit).

Docs détaillées dans **[`Brief/`](Brief/)** :
- **[`Brief/ETAT_DU_JEU.md`](Brief/ETAT_DU_JEU.md)** — 📌 **synthèse à lire en premier** (état + reste à faire, ordonné).
- `brief-refonte-items-sets-ui.md` — refonte items/sets/sorts/UI (**FAIT**, avec carto des assets).
- `brief-polish-donjons-carte-artisanat.md` — **prochain** : plages, FX, relief, brouillard de guerre, artisanat, donjons/intérieurs.
- `BRIEF_RPG_MULTIJOUEUR.md` — **Phase 4 : multijoueur** (Colyseus + Supabase/SQLite à trancher), nage → île maudite, raids.

**Reste à faire (ordre conseillé)** : finir le polish/contenu solo (brief polish) → équilibrage manette en main → **multijoueur (gros chantier)**.

---

*Projet personnel, développé en pair-programming avec Claude (Anthropic). Méthode : une chose à la fois → valider au navigateur → commit. Commits en français.*
