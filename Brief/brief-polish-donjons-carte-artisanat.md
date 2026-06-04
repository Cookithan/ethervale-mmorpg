# Brief — Polish & contenu solo : Donjons, Relief, Carte, Plages, FX, Artisanat

**Jeu : The Last Adventure (Iroas)** — Phaser 3.90 + Vite. Repo : `Cookithan/ethervale-mmorpg`.

> Passe de **polish et contenu solo**. À intégrer dans le jeu existant **sans casser la map ni le contenu déjà placé**. Étape par étape, valider au navigateur, **commit + push** entre chaque.

---

## Fichiers concernés
- `src/scenes/GameScene.js` — génération de map (`ISLAND_RX/RY`, `biomeAt`, `oceanMask`, `computeCoast`, rivières/ponts, props par biome, `animateWater`).
- `src/scenes/UIScene.js` — minimap + carte du monde (touche M).
- `src/data/save.js` — sauvegarde **localStorage** (y stocker l'exploration + l'artisanat).
- `src/scenes/BootScene.js` — préchargement des tilesets/anims.
- `src/data/items.js` — items + matériaux (cuir, os, fer, cristal) pour l'artisanat.
- PNJ existant **Aldric le Forgeron** (village) → forgeron = PNJ d'artisanat tout trouvé.

## Assets (déjà dans `Full_asset/` pour la plupart)
- Relief : **Sprout `Hills`** + **Ninja `TilesetRelief` / `ReliefDetail`**.
- Intérieurs/donjons : **Ninja `TilesetHouse` / `TilesetInterior` / `TilesetDungeon`** ; `TilesetFloor.png` (sols sable/neige/glace).
- Plages : tuiles de **sable** (`TilesetFloor` ou Sprout).
- FX : pack **FX Ninja** (effets élémentaires, poussière).

## Règles de travail (impératives)
1. **Une chose à la fois** → valider → commit → suivante.
2. **NE PAS régénérer la map** : tout ce qui touche au monde se fait par ajouts/retouches prudents, sans casser le contenu placé (village, mobs, boss, ponts).
3. **Data-driven** (recettes d'artisanat, etc.).
4. Chiffres = points de départ à équilibrer.

---

## 1. Plages (le plus simple — visuel)

- Ajouter une **bande de sable** le long de la côte, entre la terre et l'océan.
- S'appuyer sur la côte déjà calculée (`computeCoast` / `oceanMask`) : les tuiles de bord de terre passent en **transition sable** avant l'eau.
- Purement visuel (pas de collision). Donne un vrai littoral au lieu d'un bord net terre/eau.

## 2. FX manquants (visuel)

- Le système de FX est déjà **data-driven** (sorts/slash/projectiles). Compléter les **éléments manquants** : **givre, foudre, plante, eau** (pour Blizzard, etc.).
- Ajouter une **poussière de pas** sous le perso en déplacement (petit nuage), différente selon le sol (sable/neige/herbe) si simple.

## 3. Relief / montagnes (moyen)

- Ajouter de **vraies falaises / plateaux** avec **collisions** (Sprout `Hills` + Ninja `TilesetRelief`).
- Les **intégrer aux biomes** : montagnes en neige (Nord), mesas/plateaux en désert (Sud), reliefs en bordure de zone.
- Servir de **barrières naturelles** et de **goulots** (un seul passage), ce qui structure la map et guide le joueur.
- ⚠️ **Sans casser** le pathing des mobs ni les zones de spawn : intégrer prudemment, tester que les mobs et le joueur circulent toujours.

## 4. Brouillard de guerre + carte (moyen)

- **Carte du monde (M)** et **minimap** : poser un **calque noir** sur les zones non explorées.
- Quand le joueur se déplace, **révéler** les tuiles autour de lui (un disque ou par tuiles) → la carte se remplit au fil de l'exploration.
- **Persistance** : stocker la **grille d'exploration** (vu / pas vu) dans `save.js` (localStorage pour l'instant ; ça migrera vers Supabase au multi). → La révélation **reste** entre les sessions.
- Minimap et carte du monde **lisent la même grille**.

## 5. Artisanat / forge (moyen — nouveau système)

- Interaction avec **Aldric le Forgeron** (PNJ déjà présent) → ouvre un **panneau d'artisanat**.
- **Recettes data-driven** (table `RECIPES`) : chaque recette = **matériaux requis** (cuir/os/fer/cristal, déjà droppés) + éventuellement de l'**or** → produit **un item**.
- Permet de **crafter** de l'équipement de milieu de gamme et des **potions** → donne une utilité aux matériaux qui dorment et une boucle de farm.
- UI : liste des recettes, matériaux nécessaires (avec ce qu'on possède), bouton "Forger" (grisé si matériaux manquants). Réutiliser le style des panneaux existants (boutique / fiche perso).
- ⚠️ Tenir compte de l'**inventaire limité à 5** (sac) : un item crafté va dans le sac → gérer le cas "sac plein".

## 6. Intérieurs & donjons (le gros chantier — à faire en dernier)

- **Nouvelles scènes + transitions** : entrer dans les **maisons** (`TilesetHouse`/`TilesetInterior`) et les **grottes/donjons** (`TilesetDungeon`), puis ressortir.
- Mécanique : une **zone d'entrée** (porte/grotte) sur la map → déclenche un **changement de scène** vers l'intérieur → une sortie ramène à la position d'avant sur la map principale.
- **Maisons** : petites pièces décoratives (PNJ, déco, peut-être un coffre).
- **Donjons** : salles avec **monstres + loot**, voire un **mini-boss** au fond et un **coffre de récompense** (bon endroit pour des pièces de set / coffres à loot).
- ⚠️ C'est le plus gros morceau (gestion de scènes, transitions, sauvegarde de position). **Commencer petit** : **une seule maison** d'abord (entrer/sortir proprement), valider, puis **une grotte**, puis étendre.

---

## Ordre conseillé (du plus rapide au plus lourd)
1. **Plages** (visuel rapide).
2. **FX manquants** + poussière de pas.
3. **Relief / montagnes** (avec collisions, intégré aux biomes).
4. **Brouillard de guerre + carte** (révélation persistante via `save.js`).
5. **Artisanat** chez Aldric (recettes data-driven).
6. **Intérieurs & donjons** (nouvelles scènes — une maison, puis une grotte, puis étendre).

Valider et commit chaque étape avant la suivante.

> 💡 Rappel : ce sont des **améliorations solo**. La grande étape suivante reste le **multijoueur** (Phase 4) — ne pas ouvrir tous ces chantiers à la fois, en faire un ou deux puis attaquer le multi si tu veux que le jeu devienne vraiment un MMO.
