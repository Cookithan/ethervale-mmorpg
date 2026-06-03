# Brief Éthervale — État du jeu & feuille de route

> Document de synthèse pour reprendre le projet (humain OU nouvelle session Claude).
> Dernière mise à jour : **2026-06-03**, dernier commit `080e714` (branche `main`, arbre propre).

---

## 1. Le projet en deux mots

**Éthervale** = MMORPG 2D top-down pixel art, jouable au **navigateur** (PWA mobile + PC), **budget 0 €**.
Philosophie : **solo d'abord**, **MVP strict**, multijoueur repoussé en **Phase 4**.

- **Stack** : **Phaser 3.90 + Vite 7**. Pas (encore) de React ni de backend. Persistance = **localStorage** (`src/data/save.js`).
  Multi prévu en Phase 4 : **Colyseus** + persistance **Supabase OU SQLite** (à trancher).
- **Lancer** : `npm run dev` → http://localhost:5173 (un serveur tourne souvent déjà ; ne pas en relancer 10).
- **Repo PUBLIC** : `github.com/Cookithan/ethervale-mmorpg` (compte gh `Cookithan`). **`git push origin main` après chaque commit.**
- **Assets** : 3 packs dans **`Full_asset/`** (gitignoré) :
  - `Ninja Adventure - Asset Pack` (**CC0**, base de tout : perso, monstres/boss, tilesets, UI, FX, audio).
  - `Sprout Lands` (sols doux/eau/relief/village — **NON-COMMERCIAL**).
  - `mystic_woods_free_2.2` (forêt sombre/intérieurs/ennemis — **NON-COMMERCIAL**, partie « Premium » filigranée inutilisable).
  - ⚠️ Seuls les sprites **réellement utilisés** sont copiés dans `public/assets/` (cf. `CREDITS.md`). Ne JAMAIS committer les packs bruts.

### Méthode de travail (IMPORTANTE — l'utilisateur y tient)
1. **UNE chose à la fois** → l'utilisateur **valide au navigateur** → **commit** → suivante.
2. **AskUserQuestion AVANT tout choix de design** (couleurs, placement, casting…). Ne pas foncer seul.
3. `node --check <fichier>` après chaque édition. Demander un **rechargement complet** (Ctrl+Maj+R ou fermer/rouvrir l'onglet) — Vite HMR ne relance pas `create()`/`preload()` de Phaser.
4. Commits en **français** + `Co-Authored-By: Claude…`.
5. ⚠️ **Ne jamais lire un .png comme du texte** (cat/Get-Content → crash « invalid surrogate »). Pour voir une image = outil **Read**.

### Architecture des fichiers
- `src/main.js` : config Phaser + ordre des scènes.
- `src/scenes/` : **Boot** (préload + anims), **Menu** (accueil), **Character** (création perso), **Game** (le monde, ~3700 lignes), **UI** (HUD/panneaux, scène séparée non-zoomée).
- `src/entities/` : **Player**, **Monster**, **Projectile**, **Drop**.
- `src/data/` : **items.js**, **classes.js** (`CLASSES`, `HEROES`, `DEFAULT_CHARACTER`, `KNIGHT_CHARACTER`), **save.js**, **sound.js** (moteur audio).

---

## 2. CE QUI EST FAIT

### Le monde / la carte
- **Map déterministe** (`WORLD_SEED=1337`, PRNG seedé pendant la génération puis restauré). Grille **540×330**, continent en **île** fixe (`icx/icy = 180,110`, ellipse `ISLAND_RX/RY = 96/82`), surplus = **océan**.
- **Biomes en ZONES (Voronoi)** : `biomeAt` = graine la plus proche en distance déformée par bruit → frontières organiques. Village dans une **clairière de prairie** au sein de la forêt ; **neige** au Nord, **désert** au Sud, **forêt** autour, **île maudite** end-game au SO (verrouillée jusqu'à la nage).
- **Côte lissée** (`computeCoast` → `oceanMask`), **rivières-séparatrices** (frontières neige|forêt et forêt|désert) avec **gués** (terre battue), **3 grosses îles** au large.
- **Sols** :
  - Prairie/forêt = **herbe Sprout** (`grassLayer`), forêt teintée vert sombre par tuile (mosaïque) + transition douce au bord de prairie. **Prairie SANS plantes** (demandé).
  - Désert & neige = tuiles `field` du biome + **film de teinte par tuile (mosaïque, 3 nuances)** comme la forêt. Pas de lacs asséchés/gelés (retirés).
- **Eau animée** (Sprout, `animateWater` cycle les tuiles visibles).
- **Déco** : forêt = **chênes Mystic Woods** (`oak_canopy`/`oak_trunk`, tronc opaque + canopée walk-behind) + sous-bois léger. Props par biome (cactus, congères, cristaux…).
- **Village** : place + chemins, **clôture**, **feu de camp**, maisons. Layout actuel : **DROITE = marchand**, **GAUCHE = Aldric le Forgeron**, **HAUT = Mira**, **BAS = Tom**. Marchand + villageois de service = **statiques**.
- **Déco animée (démarrée)** : **bannière** du village qui ondule (`flag_blue`), **moulin à eau** (`watermill`) sur la berge de la rivière sud (~208,153). Pipeline : `BootScene.createDecoAnimations`, sprites dans `public/assets/deco/`.
- **PNJ baladeurs** : 14 **civils distincts** (Noble, Princesse, Moine, Chasseur… — ni villageois, ni perso de classe) qui **errent dans la prairie**, **confinés au biome** (`wanderBlocked` : évitent hors-biome, chemins, bâtiments). Errance visible aussi à l'accueil.

### Combat (4 classes complètes)
- 2 barres **Vie/Mana** + régén, **attaque de base spammable**, **1 sort par classe** (touche 1 / boutons HUD ATK-SORT) :
  Guerrier=**Charge** (dash i-frames), Tank=**Bouclier** (-80 %), Mage=**Météore** (incantation), Soigneur=**Soin**.
- Dégâts centralisés (`hitMonster`), recul seulement par le Tank, ciblage auto sur mobs **visibles**.
- **FX data-driven** (sorts/slash/projectiles animés via spritesheets du pack).
- **Apparences par classe** (3/classe + faceset) + **création de perso** (fond village vivant).

### Items / progression
- **Équipement 4 slots** : Arme / Armure / **Focus** (booste la compétence) / Anneau (mana). **4 raretés** (légendaire = boss-only). Boutique par catégories, écran perso paper-doll (touche C), `recomputeStats`.
- **Armes par classe** (mêlée qui swingue + à lancer), projectiles animés.
- **Scaling** : XP expo cap **niv 20** ; **mobs niv 1→5 par distance** (PV/dégâts exponentiels) ; élite (★) ; drops serrés.

### Monstres & Boss
- **Densité mobs** : base 170, **forêt la plus dense**, désert/neige plus aérés, bien espacés. **Mur invisible réservé aux mobs** au bord de la prairie (le joueur passe, les mobs longent la lisière).
- **Système « rig » boss** (sprites dédiés `Actor/Boss/`, anims mono-orientation + flipX) : ~15 boss placés (repaires multiples par biome) + **Dragon de mer** d'ambiance (segmenté, longe la côte, intouchable pour l'instant).
- **2 vrais BOSS DE RAID** intuables solo (Tengu des Glaces, Samouraï Sylvestre) + **ARÈNE scellée** (mur invisible, clairière sans arbres/mobs).
- **Comportements boss** : **endormis** sur leur repaire (réveil = on les frappe), **solides**, **CHARGE télégraphiée** (dash data-driven) sur plusieurs boss.

### Audio (validé « parfait »)
- Moteur centralisé (`sound.js`) : **musique par zone** (fondu), **bruitages combat**, jingles level-up/game over, **ambiance vent/vagues côtière**, **sons d'UI** (panneaux, équip, transactions, pas, ramassage), sons élémentaires des sorts, rugissement de boss. Réglages muet/volume persistés.

### UI / Carte
- HUD WoW-like (cadre héros, sac hotbar, barre XP), **toasts**, **minimap** (haut-droite, fenêtre zoomée qui suit le joueur : biomes texturés, rivières/glace, mobs rouges, repère village doré, boussole) — **clic minimap → ouvre la carte du monde**.
- **Carte du monde plein écran (M)** : **cadrée/zoomée sur l'île**, marqueurs village/boss/PNJ/joueur + **mobs** (rouge/élite jaune/boss orange).
- **Accueil** = vrai village en fond vivant ; le héros affiché = **dernier perso joué** (save) sinon le **Chevalier**.

---

## 3. CE QU'IL RESTE À FAIRE (dans l'ordre conseillé)

### A. Finir le polish map / déco (en cours)
1. **Déco animée restante** : **cascades** (`Waterfall`, demande un dénivelé → à coupler avec le relief, ou bouche de rivière), **moulin à VENT** (`MillPropeller` sur une tour, champ/désert), **rides d'eau** (`Water Ripples`), fleurs/plantes animées, drapeaux ailleurs.
2. **Reliefs / montagnes** : vraies falaises/plateaux (Sprout `Hills` + Ninja `TilesetRelief/ReliefDetail`) avec collisions, intégrés aux biomes.
3. **Intérieurs / donjons** (gros chantier, nouvelles scènes/transitions) : entrer dans les maisons et grottes (`TilesetHouse/Interior`, `TilesetDungeon`). `TilesetFloor.png` contient de **vrais sols** (sable/neige/glace) si besoin un jour.

### B. Boss & monstres
4. **Patterns d'attaque des boss restants** (au-delà de la charge) : Tengu = déluge `Attack` + **transformation `Trans` à 50 % PV** ; Cyclopes = bull-rush ; Gelées = saut-slam (`Jump`). Demandé par l'utilisateur (« pas que le dash »).
5. **Plus d'ennemis** : ~10 monstres utilisés sur ~70 dispo dans `Actor/Monster/`.

### C. Contenu de jeu
6. **📜 QUÊTES** (§10 du brief original, **le plus structurant**) : système data-driven, PNJ avec `!`/`?`, objectifs, récompenses.
7. **🐾 Animaux d'ambiance** (`Actor/Animal/` ~26) : critters / familiers / montures.
8. **Potions de mana** au marchand ; FX élémentaires manquants (Ice/Thunder/Plant/Water, poussière de pas).

### D. Phase 4 — Multijoueur (gros morceau, après le solo)
9. **Multijoueur Colyseus** + persistance serveur (Supabase/SQLite à trancher).
10. **Compétence NAGE** → débloque l'**île maudite** (et permet d'**invoquer le Dragon de mer** à un point précis dans l'eau : il quitte sa ronde, devient un vrai boss de raid).
11. **Arène à sens unique** (multi) : les autres joueurs peuvent ENTRER mais pas SORTIR tant que le boss vit.
12. **Brouillard de guerre** (§7, nécessite la persistance serveur).
13. Plages le long de la côte, équilibrage RAID, loot légendaire de raid, nettoyage code mort.

---

## 4. Pièges & astuces déjà rencontrés (à ne pas refaire)
- **Corps physique statique désactivé** : `body.enable = false` ne le retire PAS de l'arbre → `overlapRect` le détecte encore (un PNJ baladeur se croyait bloqué par lui-même). Utiliser **`physics.world.disable(sprite)`**.
- **Peuplement d'un biome dense** : ne PAS faire `break` au 1er échec de placement (sinon budget abandonné) ; pour la forêt, autoriser les mobs **sous les canopées** (seuls les troncs bloquent, via `previewBlocked`).
- **Boss** : poser `setImmovable/pushable=false` APRÈS `monsters.add` ; dégâts de contact via le **callback du collider** (l'overlap général ne déclenche pas sur corps solide). Ne JAMAIS tweener un objet `Sound` Phaser (gel du jeu) → fondu via objet proxy.
- **Rendu** : poser un rectangle de fond couleur-herbe derrière la tilemap (seam 1px au zoom ×3).
- **Recul/mort** : appeler `setVelocity` AVANT `takeDamage` (sinon body `undefined` → gel du step physique).
- **Outil carte** : script temporaire `_*.mjs` qui réplique `noise2D/biomeAt/isOcean/rivières` → PNG (encodeur PNG maison via zlib) pour visualiser la map sans lancer le jeu. **Supprimer après** (préfixe `_`).

---

*Détail technique exhaustif (fonctions, constantes, historique commit) dans la mémoire Claude `mmorpg-project.md`.*
