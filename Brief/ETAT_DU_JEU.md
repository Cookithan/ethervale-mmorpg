# Brief Éthervale — État du jeu & feuille de route

> Document de synthèse pour reprendre le projet (humain OU nouvelle session Claude).
> Dernière mise à jour : **2026-06-05**, dernier commit `fb6ce78` (branche `main`, poussé `origin/main`, arbre propre).

> ⚡ **EN COURS (2026-06-07) — CHANTIER INTÉRIEURS, NON validé, repris par un nouveau Claude.** HEAD = `8b3f8d3` (météo). **TOUT le chantier intérieurs est NON COMMITÉ** (modifs `GameScene.js`+`BootScene.js` ; nouveaux : `src/ui/wood.js`, `scripts/penz_crop.cjs`, assets `public/assets/tiles/penz_*`,`mw_*` + `public/assets/ui/*`, briefs `Brief/brief-interieurs-village.md` + `Brief/penzilla-catalog.md`). **👉 Pour reprendre : lire `Brief/brief-interieurs-village.md` (bloc « ⚠️ HANDOFF » en tête) + le catalogue `Brief/penzilla-catalog.md`.** L'utilisateur juge le rendu actuel amateur (« rien ne va ») ; vision validée + leçons dans le brief.
>
> ⚡ **NOUVEAU depuis le 2026-06-05** (par rapport à `f4850c6`) :
> - **Refonte items/sets/sorts/UI (« Brief A ») FAITE** (jusqu'à `d266af3`) : raretés + relique, armes par classe, **PANOPLIES** (sort de set touche 3 + drops boss + pity), **Mage élémentaire** (sorts par apparence : feu/glace/ombre), Soigneur bouclier, **barre de compétences façon WoW**, **fiche perso paper-doll**. (Détail exhaustif dans la mémoire Claude `brief-a-refonte-items-fait.md`.)
> - **Passes déco biomes FAITES** (`16cefb6` désert, `fb6ce78` neige) : on a étoffé la déco **comme la forêt**. Désert = palmiers nains + rochers de grès + arbres morts répartis en grille (qui **remplissent les arènes** et sont **destructibles** par l'onde de choc) + **sables mouvants animés** (piège qui aspire) ; maisons du désert retirées. Neige = **sapins variés en grille** (destructibles) + **chute de neige animée**. (Détail : mémoire `deco-biomes-desert-fait.md`.)
> - ⛔ **RELIEF / MONTAGNES = écarté** par l'utilisateur (« c'est très bien sans montagne »). **Ne pas reproposer.**
> - (Rappel `f4850c6` et avant : équilibrage trinité, patterns boss Gélées/Cyclopes/Tengu, température, ponts, 2e compétence niv 10, feu de camp, cycle jour/nuit, sols anti-mosaïque, **quêtes** (17, data-driven), bateau, mort douce.)

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
- **Côte lissée** (`computeCoast` → `oceanMask`), **rivières-séparatrices** (frontières neige|forêt et forêt|désert) avec **ponts en bois** (sprite Sprout `bridge_wood` agrandi au-dessus de l'eau, `renderFordBridges` ; ⚠️ après `setCollision(false)` sur un gué il FAUT `waterLayer.calculateFacesWithin(...)` sinon le pont reste infranchissable), **3 grosses îles** au large.
- **Sols** :
  - Prairie/forêt = **herbe Sprout** (`grassLayer`), forêt teintée vert sombre + transition douce au bord de prairie. **Prairie SANS plantes** (demandé).
  - Désert & neige = tuiles `field` du biome + **film de teinte en 3 nuances**. ⚠️ **Anti-mosaïque (commit `f4850c6`)** : la teinte (désert/neige + forêt profonde) suit un **bruit CONTINU** `noise2D(tx*TINT_PATCH, ty*TINT_PATCH)` quantifié → **taches MOYENNES** (quelques tuiles), plus de damier par tuile. `const TINT_PATCH=3.2` = échelle réglable (plus grand = taches plus petites). Sols aussi plus unis (tuile pleine majoritaire). Pas de lacs asséchés/gelés.
- **Eau animée** (Sprout, `animateWater` cycle les tuiles visibles).
- **Déco** : forêt = **chênes Mystic Woods** (`oak_canopy`/`oak_trunk`, tronc opaque + canopée walk-behind) + sous-bois léger. Props par biome (cactus, congères, cristaux…).
- **Village** : place + chemins, **clôture**, **feu de camp**, maisons. Layout actuel : **DROITE = marchand**, **GAUCHE = Aldric le Forgeron**, **HAUT = Mira**, **BAS = Tom**. Marchand + villageois de service = **statiques**.
- **Déco animée (démarrée)** : **bannière** du village qui ondule (`flag_blue`), **moulin à eau** (`watermill`) sur la berge de la rivière sud (~208,153). Pipeline : `BootScene.createDecoAnimations`, sprites dans `public/assets/deco/`.
- **PNJ baladeurs** : 14 **civils distincts** (Noble, Princesse, Moine, Chasseur… — ni villageois, ni perso de classe) qui **errent dans la prairie**, **confinés au biome** (`wanderBlocked` : évitent hors-biome, chemins, bâtiments). Errance visible aussi à l'accueil.

### Combat (4 classes complètes)
- 2 barres **Vie/Mana** + régén, **attaque de base spammable**, **1 sort par classe** (touche 1 / boutons HUD ATK-SORT) :
  Guerrier=**Charge** (dash i-frames), Tank=**Charge de bouclier**, Mage=**Météore** (incantation), Soigneur=**Soin**.
- **2e compétence par classe** (touche **2**, débloquée **niv 10**, bouton HUD avec cadenas) : Guerrier=Tourbillon, Tank=Provocation+Bouclier (Tank refondu), Mage=Image miroir (clones), Soigneur=Sanctuaire (zone de soin).
- **Équilibrage trinité** : gains par niveau dans `classes.js` (`hpPerLevel`/`defPerLevel`/`manaPerLevel`) appliqués dans `Player.gainXp`. **Boss = stats fixes découplées** des mobs ; contact de boss ÷2 → la mêlée est soutenable, le danger vient des **attaques spéciales esquivables**.
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
- **Patterns spéciaux data-driven** (moteur calqué sur la charge, tous télégraphiés/esquivables) : **Gélées = saut-slam** (`def.slam`), **Cyclopes = bull-rush** (`def.charge`), **Tengu = déluge de boules de feu en éventail** (`def.barrage`) + **transformation furieuse à 50 % PV** (`def.enrage`, anim `Trans`). RESTE : Bambou/Crâne n'ont encore que contact/charge.

### Température (froid / chaud) — `GameScene.updateTemperature`
- Jauge `player.temp` −100→+100, **thermomètre façon LEGO Fortnite** (haut-gauche). **Neige = froid**, **désert = chaud** : ralenti progressif dès |temp|≥55, **dégâts** dès ≥90 (uniquement dans le biome). Lisière = tempéré (on sent venir). Flammes aux pieds / flocons / vignette / bandeau d'alerte.
- **Atténuation** : armures `coldResist`/`heatResist` (Cape de fourrure / Habit du désert) + **potions feu/givre** (immunité 10 min, marchand).
- **Feu de camp posable** : consommable `campfire_kit` (« Feu de camp », **rare, 800 or**, marchand → Potions). Clic hotbar → pose un foyer ~90 s (rayon 64 px, flamme animée + halo + crépitement, 3 max) = **zone-refuge qui neutralise le FROID** autour (réchauffe → **sans effet au désert**).

### Cycle jour / nuit — `GameScene.updateDayNight` (cf. mémoire `day-night-cycle.md`)
- **Cycle complet = 20 min** (`DAY_CYCLE_MS`). Voile bleu nuit couvrant le monde, opacité/teinte suivant l'heure (aube mauve → bleu nuit **~55 %** à minuit → jour). `this.dayDarkness` (0..1) exposé.
- **Nuit = plus froid** : décale la cible de température vers le froid (neige plus dure, désert qui se rafraîchit) ; la potion de feu l'annule. **Feux de camp plus marqués la nuit**.
- **HUD** : petite **icône soleil/lune** (textures générées) à gauche de la minimap.

### Audio (validé « parfait »)
- Moteur centralisé (`sound.js`) : **musique par zone** (fondu), **bruitages combat**, jingles level-up/game over, **ambiance vent/vagues côtière**, **sons d'UI** (panneaux, équip, transactions, pas, ramassage), sons élémentaires des sorts, rugissement de boss. Réglages muet/volume persistés.

### UI / Carte
- HUD WoW-like (cadre héros, sac hotbar, barre XP), **toasts**, **minimap** (haut-droite, fenêtre zoomée qui suit le joueur : biomes texturés, rivières/glace, mobs rouges, repère village doré, boussole) — **clic minimap → ouvre la carte du monde**.
- **Carte du monde plein écran (M)** : **cadrée/zoomée sur l'île**, marqueurs village/boss/PNJ/joueur + **mobs** (rouge/élite jaune/boss orange).
- **Accueil** = vrai village en fond vivant ; le héros affiché = **dernier perso joué** (save) sinon le **Chevalier**.

---

## 3. CE QU'IL RESTE À FAIRE (dans l'ordre conseillé)

### A. Polish map / déco
- ✅ **Déco biomes FAITE pour les 4 biomes** : forêt (chênes Mystic + sous-bois), **désert** (palmiers/rochers de grès/arbres morts/sables mouvants — `16cefb6`), **neige** (sapins variés/chute de neige — `fb6ce78`). Méthode = grille jittered uniforme, arbres destructibles qui remplissent les arènes (cf. `scatterDesertProps`/`scatterSnowProps`/`addTree(...,true)`).
- ⛔ **Reliefs / montagnes : ÉCARTÉ** (l'utilisateur n'en veut pas — ne pas reproposer).
1. **Déco animée restante** (optionnel) : **moulin à VENT** (`MillPropeller` sur une tour, désert), **rides d'eau** (`Water Ripples`), fleurs/plantes animées, drapeaux ailleurs. (Cascades : demandaient un dénivelé → sans objet maintenant que le relief est écarté, sauf à une bouche de rivière.)
2. **Intérieurs / donjons** (gros chantier, nouvelles scènes/transitions) : entrer dans les maisons et grottes (`TilesetHouse/Interior`, `TilesetDungeon` ; entrées de grotte dispo dans `TilesetReliefDetail`). `TilesetFloor.png` contient de **vrais sols** (sable/neige/glace) si besoin un jour.

> **PROCHAINE SESSION — l'utilisateur choisira parmi** : **Artisanat chez Aldric** (recettes data-driven, brief polish §5), **Brouillard de guerre + carte M** (révélation persistante, brief polish §4), **plus de déco animée** (ci-dessus), **plus d'ennemis / patterns de boss** (cf. §B). Donjons = à part (gros).

### B. Boss & monstres
4. **Patterns d'attaque des boss restants** : Gélées (slam), Cyclopes (bull-rush), Tengu (déluge+transfo) sont **FAITS** ; il reste **Bambou / Crâne / autres** qui n'ont que contact/charge.
5. **Plus d'ennemis** : ~10 monstres utilisés sur ~70 dispo dans `Actor/Monster/`.

### C. Contenu de jeu
6. ✅ **📜 QUÊTES FAITES** : système data-driven (`src/data/quests.js`, ~17 quêtes en chaîne, types talk/kill/collect, marqueurs `!`/`?`, journal touche J, palier end-game « battre les Gardiens »). **Artisanat chez Aldric** (recettes data-driven, brief polish §5) reste un bon prochain pas structurant.
7. **🐾 Animaux d'ambiance** (`Actor/Animal/` ~26) : critters / familiers / montures.
8. **FX élémentaires manquants** (Glace/Foudre/Plante/Eau) — surtout cosmétique tant qu'aucune mécanique ne les pilote (l'élément vient de l'apparence du Mage : feu/lumière/ombre). *(Potions de soin/mana/température = déjà au marchand.)*
9. **Idées en réserve** : PNJ/village qui s'allument la nuit ; mobs nocturnes ; passifs/stats secondaires (crit/vitesse/vol-de-vie) ; rations chaudes/eau fraîche (anti-chaleur côté désert).

### D. Phase 4 — Multijoueur (gros morceau, après le solo)
10. **Multijoueur Colyseus** + persistance serveur (Supabase/SQLite à trancher).
11. **Compétence NAGE** → débloque l'**île maudite** (et permet d'**invoquer le Dragon de mer** à un point précis dans l'eau : il quitte sa ronde, devient un vrai boss de raid).
12. **Arène à sens unique** (multi) : les autres joueurs peuvent ENTRER mais pas SORTIR tant que le boss vit.
13. **Brouillard de guerre** (§7, nécessite la persistance serveur).
14. Plages le long de la côte, équilibrage RAID, loot légendaire de raid, nettoyage code mort.

---

## 4. Pièges & astuces déjà rencontrés (à ne pas refaire)
- **Corps physique statique désactivé** : `body.enable = false` ne le retire PAS de l'arbre → `overlapRect` le détecte encore (un PNJ baladeur se croyait bloqué par lui-même). Utiliser **`physics.world.disable(sprite)`**.
- **Peuplement d'un biome dense** : ne PAS faire `break` au 1er échec de placement (sinon budget abandonné) ; pour la forêt, autoriser les mobs **sous les canopées** (seuls les troncs bloquent, via `previewBlocked`).
- **Boss** : poser `setImmovable/pushable=false` APRÈS `monsters.add` ; dégâts de contact via le **callback du collider** (l'overlap général ne déclenche pas sur corps solide). Ne JAMAIS tweener un objet `Sound` Phaser (gel du jeu) → fondu via objet proxy.
- **Rendu** : poser un rectangle de fond couleur-herbe derrière la tilemap (seam 1px au zoom ×3).
- **Recul/mort** : appeler `setVelocity` AVANT `takeDamage` (sinon body `undefined` → gel du step physique).
- **Outil carte** : script temporaire `_*.mjs` qui réplique `noise2D/biomeAt/isOcean/rivières` → PNG (encodeur PNG maison via zlib) pour visualiser la map sans lancer le jeu. **Supprimer après** (préfixe `_`).
- **Ponts/gués** : après `tile.setCollision(false)` sur les tuiles de gué, **APPELER `waterLayer.calculateFacesWithin(0,0,MAP_W,MAP_H)`** — sinon Arcade garde les anciennes « faces » et le pont reste infranchissable.
- **Voile plein écran + zoom ×3** : pour un overlay qui doit couvrir tout l'écran (nuit), un **rectangle couvrant TOUT le monde** (scrollFactor 1) est plus simple/sûr qu'un `scrollFactor(0)` (qui est quand même mis à l'échelle par le zoom). Depth ~9000 (au-dessus des sprites `depth=y`, sous les flashs/HUD).
- **Anti-mosaïque des sols** : teinter par un **bruit CONTINU** (`noise2D`) quantifié, PAS par `tileNoise` par-tuile (= damier). Échelle réglable via `TINT_PATCH`.
- **Tester un cycle long** (jour/nuit 20 min) : réduire temporairement la constante de durée (ex. 90 s), valider, **remettre la vraie valeur avant commit**.

---

*Détail technique exhaustif (fonctions, constantes, historique commit) dans la mémoire Claude `mmorpg-project.md`.*
