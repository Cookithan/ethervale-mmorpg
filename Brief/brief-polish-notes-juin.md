# Brief — Polish & Contenu (notes du 05/06/26)

**Jeu : The Last Adventure (Iroas)** — Phaser 3.90 + Vite. Repo : `Cookithan/ethervale-mmorpg`.

> 18 tâches de polish et contenu solo. Procéder **une tâche à la fois**, valider au navigateur, **commit + push** entre chaque. Ne pas regrouper plusieurs tâches dans un même commit.

---

## Règles de travail
1. **Une tâche à la fois** → valider → commit → suivante.
2. **Ne pas casser l'existant** : compléter, pas réécrire.
3. Les chiffres (timers, couleurs, tailles) sont des points de départ à ajuster en jeu.

---

## GROUPE 1 — Corrections rapides (faire en premier)

### 1. Sprite du Guerrier (5 min)
Remplacer l'apparence actuelle du **Guerrier barbare** par un sprite de guerrier/chevalier du pack Ninja Adventure. Identifier le bon sprite dans `Full_asset/`, l'ajouter à `public/assets/`, le câbler dans `src/data/classes.js` (champ `heroes` du Guerrier).

### 2. Menu d'accueil — protection de sauvegarde (15 min)
- Si une sauvegarde existe, le bouton **"Nouvelle partie"** demande une **confirmation** avant d'écraser ("Es-tu sûr ? Toute progression sera perdue").
- Depuis le jeu, **Echap** → menu pause → option **"Réinitialiser / Changer de perso"** qui renvoie à l'accueil après confirmation.
- Fichier : `src/scenes/MenuScene.js` + `src/scenes/GameScene.js` (menu pause).

### 3. Arène des boss — zone propre (5 min)
Dans l'arène scellée autour de chaque boss :
- **Aucun mob** ne peut y entrer ni s'y spawner.
- **Aucun arbre ni herbe** dans la zone (la clairière doit être dégagée).
- Vérifier que c'est déjà le cas et corriger si ce n'est pas propre. Fichier : `src/scenes/GameScene.js` (génération de l'arène, `ARENA_RADIUS`).

### 4. Pseudo coloré par classe (5 min)
Le pseudo du joueur affiché au-dessus du personnage prend une couleur selon sa classe :
- Guerrier = **rouge** · Tank = **bleu** · Mage = **violet** · Soigneur = **vert** · PNJ = **jaune**
- Fichier : `src/scenes/UIScene.js` (affichage du pseudo / nameplate).

---

## GROUPE 2 — Visuel & ambiance

### 5. Village et prairie éclairés la nuit (10 min)
La nuit, le voile sombre ne doit **pas** assombrir le village et la zone de prairie autour.
- Les torches, feux de camp et fenêtres du village restent **allumés et lumineux** même en pleine nuit.
- La prairie (zone de départ, zone safe) garde une ambiance claire — c'est le refuge, ça doit se ressentir visuellement.
- Techniquement : exclure les tuiles/objets du village et de la prairie du calque de nuit, ou réduire son opacité dans cette zone.
- Fichier : `src/scenes/GameScene.js` (système jour/nuit, voile de nuit).

### 6. Dégâts flottants (15 min)
Afficher les **chiffres de dégâts** au-dessus de chaque entité touchée : joueur, mobs, boss.
- Texte flottant coloré qui monte et disparaît (~1 s) : rouge pour les dégâts reçus par le joueur, blanc/jaune pour les dégâts infligés aux ennemis.
- Si des soins sont reçus : chiffre vert.
- Fichier : `src/scenes/GameScene.js` (ajouter un floating text à chaque `takeDamage`).

### 7. Couleur de l'arène selon le biome (15 min)
L'arène du boss prend une **teinte/ambiance colorée** selon son biome :
- Désert = rouge / orangé · Hiver = bleu glacé · Forêt = brun / vert sombre.
- Overlay coloré semi-transparent dans la zone de l'arène, ou teinture des tuiles au sol de l'arène.
- Fichier : `src/scenes/GameScene.js` (création de l'arène par boss).

### 8. Icônes distinctes pour les pièces de set (sans durée estimée — dépend des assets)
Chaque panoplie doit avoir ses **propres icônes** pour chacune de ses 4 pièces (arme, armure, relique, anneau). Actuellement les reliques de set partagent toutes `rel_emerald` et les anneaux `eq_ring_emerald`.
- Assigner des icônes uniques depuis les packs **Admurin** (armes) et **Kyrise** (armures/anneaux/reliques).
- Fichier : `src/data/items.js` (champ `icon` des 16 pièces de set).
- ⚠️ Ne faire cette étape que si les assets Admurin/Kyrise sont posés dans `public/assets/`.

### 9. Animations de la compétence 3 (sort de set) (30 min)
Vérifier et améliorer les animations des 4 ultimes de set :
- **Cri intimidant** (Guerrier) · **Onde de choc** (Tank) · **Image miroir** (Mage, récemment ajouté) · **Résurrection** (Soigneur).
- S'assurer que chaque sort a un **FX visuel lisible** (zone d'effet, particules, animation de cast).
- En particulier Image miroir : vérifier que les clones sont bien visibles et animés.
- Fichier : `src/scenes/GameScene.js` (`spellWarcry`, `spellShockwave`, `spellMirrorImage`, `spellResurrect`).

---

## GROUPE 3 — Village & intérieurs

### 10. Enrichir le village (30 min)
**Compléter** le village existant — ne pas tout reconstruire, juste l'étoffer :
- Plus de bâtiments (maisons, échoppe, grange), plus de décorations (végétation, caisses, tonneaux, enseignes, fontaine…).
- Meilleure ambiance de hub : le village doit donner envie d'y revenir.
- Conserver le layout existant (marchand à droite, Aldric à gauche, Mira en haut, Tom en bas).
- Fichier : `src/scenes/GameScene.js` (génération du village, props).

### 11. Entrer dans les maisons — barman + potions (30 min)
Ajouter deux intérieurs fonctionnels accessibles depuis le village :
- **Taverne / barman** : entre dans la maison, un PNJ vend des **buffs/boissons temporaires** (bonus de stats ou de résistance pour quelques minutes).
- **Apothicaire / vendeur de potions** : vend des potions de soin, mana, température — séparé du marchand général.
- Mécanisme : zone d'entrée (porte) → transition vers une scène intérieure → sortie ramène au village. Commencer par **une seule maison** (la taverne), valider le transition in/out, puis ajouter la seconde.
- Fichiers : nouvelle scène `src/scenes/TavernScene.js` (ou `InteriorScene.js`) + hooks de transition dans `GameScene.js`.

---

## GROUPE 4 — Audio

### 12. Intégrer les nouvelles musiques (10 min)
Ajouter les nouvelles musiques importées aux bonnes zones/scènes :
- Vérifier les fichiers disponibles dans `public/assets/audio/` et les câbler dans `src/data/sound.js` (mapping zone → musique).
- S'assurer que les fondus entre musiques (`startAmbient`) fonctionnent correctement lors des transitions de biome.

---

## GROUPE 5 — Combat & mobs

### 13. Nouvelles attaques pour tous les mobs (30 min)
Chaque type de monstre doit avoir **au moins un pattern d'attaque distinct** — pas tous le même comportement générique de type "marche vers le joueur et frappe".
- Exemples : certains mobs chargent, d'autres tirent à distance, d'autres font une attaque en zone, d'autres esquivent.
- Basé sur les sprites disponibles et ce qui est déjà implémenté pour les boss.
- Fichier : `src/entities/Monster.js` + `src/scenes/GameScene.js` (comportements IA des mobs).

### 14. Élites (★) — plus rares, plus dures, loot unique garanti (30 min)
Revoir les élites sur trois points :
- **Plus rares** : réduire significativement leur taux d'apparition dans les zones.
- **Plus difficiles** : PV et dégâts nettement supérieurs à un mob normal (pas juste +x%). Les élites doivent être un vrai défi.
- **Loot unique garanti** : chaque élite lâche toujours un item **épique** minimum, propre à son type (pas un item générique de la table de drop). Définir un ou deux items spéciaux par famille d'élite si possible.
- ⚠️ Corriger au passage : actuellement une élite de niveau 1-2 peut lâcher un épique via `TIER_UP`. Capéer à `rare` pour les élites niv ≤ 2 : `if (mon.elite && lvl <= 2 && tier === 'epic') tier = 'rare'`.
- Fichier : `src/entities/Monster.js` + `src/scenes/GameScene.js` (`spawnDrop`, `rollDropRarity`).

### 15. Nouveaux mobs dans le désert et l'hiver (30 min)
Ajouter des créatures supplémentaires dans ces deux biomes — ils sont actuellement sous-peuplés.
- Choisir des sprites disponibles dans `Full_asset/Actor/Monster/` non encore utilisés.
- Leur donner des **patterns complexes** adaptés à leur biome (ex. mob du désert qui charge vite et fait peu de PV, mob de l'hiver qui ralentit le joueur).
- Densité + difficulté cohérentes avec leur position sur la carte (loin du village = plus dur).
- Fichier : `src/entities/Monster.js` (définitions) + `src/scenes/GameScene.js` (spawn par biome).

---

## GROUPE 6 — Île maudite (gros chantier — faire en dernier)

### 16. Agrandir et décorer l'île maudite (30 min + selon assets)
L'île maudite est la zone end-game — elle doit être à la hauteur. Actuellement trop petite et peu décorée.
- **Agrandir** : la rendre comparable en superficie à l'île principale (ajuster `CURSED_ISLE` dans `GameScene.js`).
- **Décorer** : tuiles de sol propres à la zone (sombre, corrompu), arbres morts/tordus, props maudits, atmosphère oppressante.
- **Peupler** : mobs spécifiques à la zone (les plus durs du jeu), placement des boss (`Dargoth`, `Nyl`).
- **Musique dédiée** : une piste musicale propre à l'île maudite, différente des autres biomes.
- ⚠️ Chantier progressif : commencer par l'agrandissement + les tuiles de sol, valider, puis ajouter décoration, mobs et musique par étapes.
- Fichier : `src/scenes/GameScene.js` (génération de `CURSED_ISLE`) + `src/data/sound.js`.

---

## GROUPE 7 — Quêtes

### 17. Timer entre les quêtes (30 min)
Ajouter un **délai de disponibilité** entre la complétion d'une quête et l'apparition de la suivante — pour éviter que la chaîne s'enchaîne sans respiration.
- Le PNJ n'affiche pas le `?` ni le `!` immédiatement après la remise — il faut attendre X minutes de jeu (ou X secondes, à calibrer en test).
- Idée : le délai augmente progressivement avec l'avancement dans la chaîne (quêtes de fin de jeu = plus long pour forcer le farm entre deux).
- Fichier : `src/data/quests.js` + `src/scenes/GameScene.js` (logique de déclenchement des quêtes).

---

## Ordre d'implémentation recommandé

1. Sprite Guerrier *(5 min)*
2. Pseudo coloré par classe *(5 min)*
3. Arène propre *(5 min)*
4. Menu protection sauvegarde *(15 min)*
5. Dégâts flottants *(15 min)*
6. Village éclairé la nuit / prairie *(10 min)*
7. Couleur arène par biome *(15 min)*
8. Musiques *(10 min)*
9. Timer entre quêtes *(30 min)*
10. Animations sort de set *(30 min)*
11. Nouvelles attaques mobs *(30 min)*
12. Élites revues + fix loot élites niv 1-2 *(30 min)*
13. Nouveaux mobs désert + hiver *(30 min)*
14. Enrichir le village *(30 min)*
15. Intérieurs — taverne + potions *(30 min chacun)*
16. Icônes sets *(quand assets posés)*
17. Île maudite *(chantier — par étapes)*

**Durée totale estimée : ~4h20** *(selon tes propres estimations — l'île maudite et les intérieurs peuvent déborder).*
