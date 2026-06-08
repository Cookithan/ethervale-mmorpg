# HANDOFF — état du jeu & prochains chantiers

> Écrit pour le prochain Claude. Lis **ce fichier + la mémoire auto** (`MEMORY.md`). Repo : `github.com/Cookithan/ethervale-mmorpg`, branche `main`, **HEAD = `7869fe3` (poussé)**. Jeu = Phaser 3.90 + Vite. `npm run dev` → http://localhost:5173 (Ctrl+Maj+R après modif : le HMR ne relance pas `create()`/`preload()`).

## 1) ÉTAT GIT / DEBUG
- `src/main.js` `arcade.debug` est repassé à **`false`** (committé). Le remettre à `true` localement pour voir les hitbox pendant le réglage, mais **le repasser à `false` avant un commit**.
- Non committés (volontairement) : `Brief/*.png` (maquettes jetables) + `.claude/`. Ne pas les committer.
- ⚠️ Worktrees ultracode = partent d'`origin/main` → **`git push` AVANT** un workflow qui lit/rend du code récent (déjà fait jusqu'à `7869fe3`).

## 2) CE QUI EST FAIT (session « intérieurs vivants », HEAD `7869fe3`)
**TAVERNE** — on s'assoit (E) sur **n'importe quelle chaise/tabouret** (hitbox de siège dynamique : `solidBody.enable = libre && pas dessus`, cf. `updateSeatHint`) ; on se **lève en bougeant** (clavier). S'asseoir **appelle le barman** (`callBarman`) : il vient **se coller au client** via **SA PORTE** (`spr_door` percée dans le comptoir col 14, trou collision 8px infranchissable joueur ; `_interior.barDoor`), **itinéraire à étapes** (`barmanPath` : derrière→porte→allée ligne 8.0→client) qui **évite les meubles**. Dialogue : bulle « J'arrive » → arrivé « boisson ou repas ? » (`openServerChoice`) → carte filtrée par `cat`. Repart par sa porte à la fermeture (`barmanReturn`/`onTavernShopClosed`). Structure **multi** : `seat.takenBy` (1 chaise=1 joueur), `bw.servingSeat` (1 client à la fois). Murs lambris bois foncé.
**APOTHICAIRE** — Ylva immobile, **se met en mouvement pendant qu'elle prépare** (`bw.prepper`, gate sur `this._brewing`) ; commande = délai selon rareté (3/6/10 s, `prepPotion`), livraison au sac.
**DORTOIR** — dormir = soin + mana + sauvegarde + **point de repos** (`player.respawnHome`) → à la mort on réapparaît **dans son lit** (`respawnAtVillage` branche `goInterior('dorm', restSpawn)`).
**BOUTIQUES À NIVEAUX** (apothicaire/tavern) — panneau bespoke « ardoise/bannières », items par `tier`, RÉNOVER (or + niveau perso, `SHOP_CONFIGS.costs/minLevel`). 7 nouveaux consommables (élixirs + repas/boissons à `foodBuff`). Marchand = potions de BASE seulement ; reste `vendor:'apothecary'`/`'tavern'`. Stack 6 potions, **pas de stack** repas/boissons (`isStackable` exclut `item.cat`). **« Vendre TOUT »** marchand (`sellAll`). Pas de musique de boutique dans les lieux (`openShop` ne joue `mus_shop` que si `!shopType`).
**4 BÂTIMENTS ENTERABLES** — forge / marchand / maison (Aldwin+Elara) / banque. `interiorConfig` (flags `forge`/`shopGeneral`), branches `buildInterior` (`} else if (id===...)` avant le `else` apothicaire), cols/rows + murs id-aware, `enter:` sur les villageois, carré d'entrée étendu, détection `update` (tout `e.zone`), routage `interiorInteract`, **override résident** (`_interiorNpcOverride`, maison Aldwin/Elara). Marchand singleton décalé hors de la porte (`spawnMerchant` +1 tuile) ; hitbox porte marchand +15px (bâtiment retourné).
**DIVERS** — pas d'attaque/compétence dans un intérieur (`if (this.inInterior) return` dans basicAttack/shootForward/castSpell*/fireProjectile) ; pas de clic-déplacement assis ; messages allégés.

## 3) PROCHAINS CHANTIERS (à proposer/choisir)
1. **Polish visuel des 4 nouveaux intérieurs** (forge/marchand/maison/banque) — le mobilier est un PREMIER JET d'agents (frames Penzilla devinés : l'enclume/fournaise/lit/coffre réutilisent des pièces existantes). **Méthode** : compositeur `scripts/room_preview.cjs` (rend une salle en PNG, mêmes coords que `buildInterior`) → Read le PNG → corriger les frames/positions. ⚠️ certaines pièces peuvent être bizarres/mal placées.
2. **Banque fonctionnelle** (coffre/stockage d'or & objets) — dialogue dit « bientôt ».
3. **Déco fine du bourg extérieur** (assets CC0 à fournir) / **île maudite** / réactiver le **dragon de mer** (`spawnSeaDragon` `return` en tête).
4. **MULTIJOUEUR** (Partie B, gros chantier Colyseus/Supabase) — la taverne a déjà des hooks (`takenBy`, `servingSeat`).

## 4) MÉTHODE (rappel — ça marche)
- **Compositeur** `scripts/room_preview.cjs` pour le visuel des salles + screenshots itératifs.
- **AskUserQuestion AVANT un gros choix de design** ; ne pas foncer seul (déco = assets Ninja/Penzilla, pas Sprout).
- **Workflow ultracode** = design/recon en parallèle, je présente + valide avant le gros build (⚠️ `git push` avant si worktrees).
- Je suis **sans visuel** → demander à l'utilisateur de tester (F5) + décrire les bugs ; F12 console pour les erreurs rouges.

## 5) POINTEURS FICHIERS (vérifiés sur `7869fe3`)
- Intérieurs : `GameScene.js` → `interiorConfig` (~3658), `buildInterior` (~3729, branches tavern/inn/dorm/forge/merchant/house/bank/else=apothecary), `interiorInteract` (~4350), `updateInterior`/`updateSeatHint`/`updateBarman`/`sitDown`/`standUp`/`callBarman`/`barmanReturn`/`barmanPath`/`prepPotion`/`restInBed`.
- Entrées : `spawnVillage` villagers (~3227) + carré d'entrée (~3296) ; `enterInterior`/`goInterior` ; détection dans `update` (~6248).
- Boutiques : `UIScene.js` → `openShop`/`openServerChoice`/`buildLocationShop`/`orderItem`/`renovateShop`/`drawMenuUpgrade`/`shopEffectStr`/`sellAll`. Données : `src/data/items.js` (`SHOP_CONFIGS`/`SHOP_MAX_TIER`/`SHOP_STOCK`, consommables ~181-211).
- Repos/respawn : `restInBed`/`respawnAtVillage` (GameScene) ; `player.respawnHome`/`foodBuff`/`shopLevels` (Player + save.js).
