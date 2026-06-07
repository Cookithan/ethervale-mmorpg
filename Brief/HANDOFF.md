# HANDOFF — état du jeu & prochaine session

> Écrit pour le prochain Claude. Lis **ce fichier + la mémoire auto** (`MEMORY.md` → [[interieurs-village-chantier]], [[mmorpg-project]]). Repo : `github.com/Cookithan/ethervale-mmorpg`, branche `main`, **HEAD = `ec25e06` (poussé)**. Jeu = Phaser 3.90 + Vite. `npm run dev` → http://localhost:5173 (Ctrl+Maj+R après modif : le HMR ne relance pas `create()`/`preload()`).

## 1) ÉTAT GIT / DEBUG (à régler en début de session)
- **`src/main.js` a `arcade.debug = true`** = NON commité (local only), laissé exprès pour voir les hitbox. **Le mettre à `false` avant un commit de prod.**
- Non commités aussi : `Brief/*.png` (maquettes room_preview jetables) + `.claude/`. Ne pas les committer.
- ⚠️ Les **worktrees d'un workflow ultracode partent d'`origin/main`** (dernier commit POUSSÉ), pas du local → **`git push` AVANT** de lancer un workflow qui lit/rend du code récent.

## 2) CE QUI EST FAIT (intérieurs du village)
✅ **TAVERNE**, **APOTHICAIRE**, **AUBERGE** faits. L'auberge = **2 intérieurs** :
- **`inn` (réception, 14×10)** : comptoir en **L fermé** (banc cols 1-9 + retour vertical col 9 = banc `setAngle(90)`) qui **enferme Mira** (npc_woman) → on lui parle PAR-DESSUS le banc (inaccessible). Étagères au fond. **Porte du dortoir EN HAUT À DROITE** (`spr_door` animée, `setScale(2,1)`) + texte « Dortoir » + passage ouvert à droite.
- **`dorm` (dortoir, 17×18)** : ~20 lits Ninja (`nin_bed_*`, 5×4, le lit central-bas est sauté pour dégager la porte), allées praticables, **mur bois** (`woodWall = id==='inn'||id==='dorm'`). **Pas de PNJ** (`interiorConfig('dorm')` → npcTex/npcName null).
- **Transition** : `goInterior(id,{spawn,exitTo})` (garde `_transitioning` anti-boucle de fondu) + `exitInterior()` gère `_interior.exitTo` (dortoir→réception via `dormReturn`) sinon retour village.
- **Portes = `spr_door`** (Sprout, `public/assets/tiles/spr_door.png`, 16×16 ×4). Anim **`door-cycle`** (BootScene, frames [1,3,0,0,3,1]). Trou de porte du bas = **2 tuiles** (passage large) + sprite `setScale(2,1)`. Marcher dessus → joue l'anim puis `delayedCall(230, bascule)`.
- **Caméra FIXE en intérieur** : `fitInteriorCamera()` (dans `goInterior`) = `stopFollow` + centre la pièce ; zoom = `min(zoomVillage(=_savedZoom||3), fitPièce)` → petites pièces au zoom normal, **dortoir dézoomé pour tenir en entier**. Sortie village restaure `startFollow`+`setZoom`. `updateInterior` ne recentre plus.

⏳ **Reste : intérieur BANQUE** (PNJ Cornélius, key `bank`) — pas fait, à brancher comme les autres.

## 3) PROCHAINE TÂCHE (demandée par l'utilisateur) — rendre les lieux FONCTIONNELS
Trois systèmes, indépendants. **Toujours : compositeur `scripts/room_preview.cjs` pour le visuel + screenshots itératifs ; propose (AskUserQuestion) avant un gros choix de design.**

### A. Items VENDABLES par lieu (fioles → apothicaire, repas → taverne)
**Existant** : marchand **singleton** (`spawnMerchant` GameScene ~3505 ; `this.villagers[0].merchant=true`) ; `interactWith(t)` (~3625) : `if (t===this.merchant) ui.openShop()` `else if (t.role==='forge') ui.openForge()` `else openDialogue`. Boutique = `UIScene.openShop` + `drawBuyColumn/drawSellColumn` (~905-1003). Stock = `SHOP_STOCK` (items.js:236, statique, tout sauf legendary/set/craftedOnly/eliteOnly). Consommables existants (items.js ~181-190) : `potion`/`potion_big` (vie), `potion_mana`/`_big` (mana), `potion_fire`/`potion_frost` (thermiques), `campfire_kit`. **PAS de fioles dédiées, PAS de repas.** Forge Aldric = `openForge` + `RECIPES` (items.js ~208).
**À faire** :
1. items.js : ajouter un champ `shop`/`category` aux items (ou créer `SHOP_CONFIGS = { apothecary:{types:['consumable']…}, tavern:{types:['food']} }`). Ajouter les **repas** (`type:'consumable'`, `heal:N`, stackable) et des **fioles** d'apothicaire (potions vie/mana/résist).
2. Boutique par lieu : faire que le PNJ d'INTÉRIEUR ouvre une boutique filtrée. Donner un `role` au cfg (cf. B) → dans `interiorInteract`, router vers `ui.openShop(shopType)` au lieu de `openDialogue`. Adapter `drawBuyColumn(...,shopType?)` pour utiliser `SHOP_CONFIGS[shopType]` au lieu de `SHOP_STOCK`.
3. ⚠️ `SHOP_STOCK` est calculé une fois au load → faire une **fonction** de stock dynamique, ou recalculer.

### B. QUÊTES données par Mira (réception de l'auberge)
**Existant** : `quests.js` (17 quêtes, types talk/kill/collect, `reward`, chaîne `next`). GameScene : `handleQuestInteraction(t)` / `acceptQuest(id,npc)` / `claimQuest(npc)` / `questKill(mon)` / `updateQuestMark(npc,s)` / `activeQuest()`. **Les PNJ du village sont des objets tabulaires `{name, x, y, lines, role…}` ; les PNJ d'intérieur sont juste `this._interior.npc` (sprite) + `_interior.cfg`.** `interiorInteract()` (~4068) ouvre `openDialogue` SANS jamais appeler `handleQuestInteraction` → **un PNJ d'intérieur ne peut pas donner/valider de quête aujourd'hui.**
**À faire (le « pont ») :**
1. Dans `interiorInteract()` : créer un wrapper `const npcW = {name: it.cfg.npcName, texture: it.cfg.npcTex, x: it.npc.x, y: it.npc.y}` puis `if (!this.handleQuestInteraction(npcW)) openDialogue(...)` (même ordre qu'`interactWith` village).
2. Marqueurs `!`/`?` en intérieur : dans `updateInterior()`, mettre à jour un marqueur sur `it.npc` (équivalent `updateQuestMark`), car `updateNpcs()` ne traite que `this.npcs[]`.
3. quests.js : ajouter des quêtes `giver:'Mira'` (vérifier que `it.cfg.npcName === 'Mira'` pour l'inn — OK). Décider PARALLÈLE (bonus) vs ALTERNATIVE (remplace la chaîne).

### C. REPOS = dormir dans un lit du dortoir → regagner de la vie
**Existant** : `Player.heal(amount)` (plafonne `maxHp`), `takeDamage`, i-frames 600ms. Les lits du dortoir sont des **meubles SOLID** (`bed()` → `solid(...)`), aucune interaction. Respawn ne restaure PAS la vie. Caméra fixe en intérieur.
**À faire :**
1. Dans `buildInterior('dorm')`, créer pour chaque lit une **ZONE overlap** (PAS le solid existant) → `this._interior.beds=[{zone,x,y,sleeping}]`.
2. Dans `updateInterior()` : si le joueur overlap un lit → `startResting(bed)` = soin progressif (ex. `+5 hp` toutes les 100ms pendant ~5s via `time.addEvent`), petite teinte + texte « Reposé ! ». **Interrompre** si dégâts (hook `takeDamage`) ou si on quitte le lit / la pièce.
3. Optionnel : enregistrer un point de repos (`lastRest`) pour le respawn.

## 4) MÉTHODE INTÉRIEURS (rappel — ça marche)
- Placement à l'aveugle = rendu amateur. **Compositeur** `scripts/room_preview.cjs` rend une salle en PNG (mêmes coords que `buildInterior`) : `COLS=14 ROWS=10 node scripts/room_preview.cjs <design> Brief/out.png 6 92` → **Read le PNG** → corriger → reporter dans `buildInterior`. Ops : floor/woodWallRing/furn/item/bed/tileRot/doorf/glowT/whole. Catalogue = `Brief/penzilla-catalog.md`.
- **Workflow ultracode** = N maquettes parallèles dans des worktrees (⚠️ `git push` AVANT). A bien marché pour la taverne, l'apothicaire, l'auberge (réception/dortoir) — voir les designs `recep_enc_L/U/D`, `dortoir_big` dans le compositeur.

## 5) POINTEURS FICHIERS (vérifiés sur `ec25e06`)
- Intérieurs : `GameScene.js` → `interiorConfig` (~3639), `buildInterior(id)` (~3711, branches tavern/inn/dorm/else=apothecary), `goInterior`/`exitInterior`/`fitInteriorCamera`/`destroyInterior`, `updateInterior` (~3996), `interiorInteract` (~4068), `updateBarman` (~4035).
- Boutique/forge : `UIScene.js` → `openShop`/`drawBuyColumn`/`drawSellColumn` (~905-1003), `openForge`/RECIPES (~1098-1322), `openDialogue` (~1717). Données : `src/data/items.js` (`SHOP_STOCK` :236, consommables :181, MATERIALS :192, RECIPES :208).
- Quêtes : `src/data/quests.js` ; GameScene `handleQuestInteraction`/`acceptQuest`/`claimQuest`/`questKill`/`updateQuestMark` (~4079-4231).
- Vie : `src/entities/Player.js` → `heal`/`takeDamage`/`envHurt` (~423-462), `recomputeStats` (~212).
- Save multi-perso : `src/data/save.js`. Scènes : Boot/Menu/Select/Character/Intro/Game/UI (`src/main.js` ordre).

## 6) GOTCHAS
- Lit du dortoir = collider SOLID actuel ; pour le repos, créer une **zone overlap séparée** (ne pas réutiliser le solid qui bloque).
- `interiorInteract` n'appelle PAS `handleQuestInteraction` (pont à créer pour les quêtes Mira).
- `SHOP_STOCK` statique (load-time).
- Marchand = singleton (boutiques par lieu = router via le `role` du PNJ d'intérieur, pas forcément refaire un 2e sprite marchand).
- Caméra fixe : les textes flottants seront au zoom de la pièce.
- Boss : `setImmovable/pushable=false` APRÈS `monsters.add` ; dégâts contact via callback collider. Récul : `setVelocity` AVANT `takeDamage`. (cf. [[mmorpg-project]])
