# HANDOFF — « Island of Ergas » (état 2026-06-10)

> **PROCHAIN CLAUDE : lis ce fichier EN PREMIER, puis l'index mémoire `MEMORY.md`.**
> Ce doc dit exactement où on en est et ce qu'il reste.

---

## ⚡ DERNIÈRE SESSION (2026-06-10) — JUICE de combat + fixes donjon-grottes — ✅ COMMITÉ & POUSSÉ
HEAD = **`c9cc91f`** (poussé `origin/main`), build OK (`npx vite build` EXIT=0). Commit unique : juice + fixes donjon-grottes + assets donjon (`deco/aband/`, `chest.png`, `dungeon_props.png`) + scripts d'extraction + PNG de référence Brief + ce HANDOFF. **Exclus du commit** (laissés en working tree, non suivis) : `.claude/` (config locale outil) et les dumps jetables `Brief/_bal _boss _fx _sarger`. Détail mémoire = [[combat-juice-dungeon-fixes]].

1. **JUICE de combat** (validé en chantier) — tout via `hitMonster` : **coups critiques** (consts `CRIT_CHANCE=0.05`, `CRIT_MUL=1.6`, `HITSTOP_MS=55` en tête de GameScene), `hitSpark()` (étincelle d'impact en primitives), `deathPop()` (éclat de mort, ×1.7 + shake pour élite), `hitstop()` (gel physique ~55 ms, garde anti-cumul, désactivable), `flashHurt()` **proportionnel** (`Player.lastHurtFrac`), `updateLowHpVignette()` (voile rouge pulsant <25 % PV).
2. **Donjon-grottes instanciées (`cave_a`/`cave_b`, WIP non testé)** — **mort instantanée corrigée** : trashLevel 7/8→**5/6** + garde `Math.min(...,MONSTER_MAX_LEVEL)` ; **projectiles bloqués par les murs** (colliders dans `buildDungeon`) ; **invuln d'apparition 1.8 s** ; coffre lumineux `unlockDungeonChest()` (violet→doré). ⚠️ **Toute la feature donjon-grottes (~494 l.) reste à TESTER en jeu.**
3. **Métiers & artisanat étendu** = chantier choisi puis **ABANDONNÉ par l'utilisateur** (aucun code écrit). **Ne PAS reproposer** sans demande explicite.
4. **Décision** : le **MULTIJOUEUR se fera à la TOUTE FIN** — « pour l'instant que solo » (Colyseus avait été pré-choisi pour plus tard, cf. §4).

**TODO immédiat prochaine session** : **tester en jeu** le donjon-grottes (entrées = bouches de grotte du monde) + le juice de combat ; ajuster si besoin (`CRIT_CHANCE`/`HITSTOP_MS`, difficulté/déco des grottes). Déjà commité+poussé, donc itérer librement.

## 🎯 PROCHAINE SESSION — IDÉE RETENUE PAR L'UTILISATEUR : « Bibliothèque de compétences par classe » (grimoire + loadout)
**Concept** : chaque classe a un GRAND pool de compétences ; le joueur en **équipe un nombre LIMITÉ** dans sa barre de sorts (slots) → il **compose son build** et peut le changer. Mécanique = **grimoire + loadout**. **Acquisition = DÉBLOCAGE PROGRESSIF via le CONTENU** (pas tout d'un coup) : on gagne les compétences en jouant, et les plus **puissantes/rares sont GATED derrière le contenu difficile — Sargèr (end-game), donjons, boss**. Très MMO : personnalisation + rejouabilité + carotte de farm (chasser une compétence sur un boss).
- **Existant à étendre** : aujourd'hui chaque classe = `spell` (niv.1) + `spell2` (~niv.10) + `spell3` (ultime de panoplie) dans `src/data/classes.js` (+ `MAGE_KITS` par élément pour le Mage). Cast + mana/cooldowns dans `GameScene` (`castSpell`/`castSpell2`/`castSpell3`, `nextSpellAt`/`nextSpell2At`/`nextSpell3At`, `SPELL3_COST`). Barre de sorts/UI dans `UIScene`. Persistance : `save.js makeSave`/`Player.applySave`.
- ✅ **SPEC VALIDÉE (2026-06-10) — détail + les 40 compétences = [[skill-library-loadout]]** :
  - **10 compétences/classe** (les 3 actuelles + 7) ; **4 slots max** équipés ; **swap au VILLAGE seulement** ; **déblocage progressif via le contenu** (qq-unes par niveau, les fortes lâchées par boss/donjons/Sargèr).
  - **PAS de catégories rigides D4** (écarté). Cœur du design = **système d'ÉTATS-COMBOS inter-classes** : une classe POSE un état, une autre le DÉTONE → les classes « fusionnent ». 5 états : 💀 Vulnérable, ❄️ Gel (→Fracas), 🔥 Embrasé (→détone), 🩸 Saignement, ⚡ Marque. (ex. Mage Gèle → Guerrier Fracasse ; Tank pose 💀 → Soigneuse Châtie ; Soigneuse Marque → Mage détone.)
  - ⚠️ **MAGE = pool UNIFIÉ accessible à TOUS les mages** (pas de verrou par apparence/élément ; l'élément feu/glace/ombre = choix de loadout) → **revoir `MAGE_KITS`** (aujourd'hui lie les sorts à l'apparence).
  - **Aspects/runes (modificateurs lâchés par boss durs) = v2** (après la bibliothèque de base).
  - ⚠️ La fusion inter-classes brille surtout en **multi** (= toute fin) ; en solo, chaque classe garde des **auto-combos** + tout est **conçu prêt** pour le co-op.
- **Forks à trancher la prochaine fois (AskUserQuestion avant de coder)** : sources précises par compétence (qui lâche quoi, drop %/pity) ; UI grimoire (4 slots + verrouillé/déverrouillé) ; **moteur d'ÉTATS** (poser/lire/détoner sur les `Monster`) ; refonte barre de sorts (4 slots configurables vs 3 sorts en dur) ; persistance save (compétences connues + loadout) ; équilibrage par compétence.

---

## 0. Cadre & règles de travail
- **Jeu** : RPG action top-down, **Phaser 3.90 + Vite**. Lancer : `npm run dev` → http://localhost:5173 (HMR ; **Ctrl+Shift+R** si assets/preload changent — le HMR ne relance pas `create()`).
- **Repo** : github.com/Cookithan/ethervale-mmorpg (compte gh `Cookithan`), branche **main**. `git push origin main` après commit. **HEAD propre = `80889fe`** (+ ce HANDOFF).
- **Claude est AVEUGLE en jeu** (aucun playtest possible). Vérification = `npx vite build` (attendre **EXIT=0**) + outils PNG :
  - `scripts/room_preview.cjs` → aperçu des **intérieurs** (PNG).
  - `scripts/map_preview.cjs` → aperçu de la **carte monde** (océan/Ergas/Sargèr/sous-zones, PNG `Brief/_map.png`). **Éditer ses constantes en tête** pour tester un placement à la vue. **Excellent anti-placement-à-l'aveugle.**
- **Avant CHAQUE commit** : `arcade.debug=false` (main.js l.22) **ET** `DEBUG_GIVE_BOAT=false` (GameScene.js, en tête). Messages de commit terminés par `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- ⚠️ **« Flag dance »** : tout commit touchant `GameScene.js` → passer `DEBUG_GIVE_BOAT` à **false**, build, commit, push, **puis le remettre `true` en LOCAL** (pour les tests : barque offerte + touche **G** = téléport sur Sargèr + gate de niveau désactivé). **Ne JAMAIS pousser le flag à true.** (Actuellement false dans le dépôt — le remettre true en local si on reprend les tests Sargèr.)
- **Outils dev dormants** (flags en tête de GameScene) : `DEBUG_SPAWN_BOSS` (=null ; mettre un id → touche **B** invoque ce boss à côté), `DEBUG_GIVE_BOAT` (=false), `TEST_UNLOCK_SKILLS` (=false).
- **Règle utilisateur** : proposer (AskUserQuestion) AVANT un gros changement/choix de design. Déco = assets Ninja (pas Sprout). L'utilisateur valide en jeu ; il signale bugs/ressenti → on itère. Il a autorisé **ultracode** (workflows multi-agents) pour les gros chantiers Sargèr — produire des SPECS apply-ready puis implémenter soi-même.

## 1. CE QUI VIENT D'ÊTRE FAIT (cette session) = l'END-GAME « ÎLE DE SARGÈR »
Détail complet en mémoire : **[[sarger-endgame]]** (`memory/sarger-endgame.md`). Résumé :
- **Sargèr = 2e continent PLEINE TAILLE à l'EST** (même ellipse 96×82 qu'Ergas ; carte élargie `MAP_W 540→640`). Ergas **inchangé** (coords absolues fixes — prouvé via `map_preview.cjs`). Accessible en **barque** (3000 or), **gate niveau 30** (`enforceSargerGate`).
- **GAUNTLET** : Dargoth au CENTRE, **scellé** tant que ses **3 Gardiens** (Nyl/Akaoni/Fujin) ne sont pas abattus (`player.dargothUnlocked`, persistant). Sa mort = **épilogue** (`EpilogueScene`) + badge **« Légende d'Ergas »** sur l'écran de sélection (`player.gameCompleted`). Récompense unique = **Sceau de Dargoth** (légendaire) + pièce de panoplie.
- **Sargèr v2 (donjon WoW à ciel ouvert)** : terrain en **4 sous-zones miroir corrompu** d'Ergas (`cursedSub`) ; **déco** par sous-zone + brume + voile teinté ; **Bourg Fantôme** (ruines-miroir + **avant-poste/hub** : repos, forge, lore, Quartier-maître) ; **donjon peuplé** (trash dense niveau max + **élites ★ group-required** + **5 Rares ♦**) ; **monnaie Éclats Maudits** → **Reliquaire** (vendeur). Wayfinding : **boussole en mer**, marqueur carte M, **Oona fixe au rivage est** d'Ergas (donneuse de la quête finale).
- **Aussi cette session (avant Sargèr v2)** : review d'équilibrage des boss (slams adoucis pour le Tank, Tank speedMul 0.78, Dargoth tanky), fix FX feu infini (`playFx` détecte les anims qui bouclent), réticule de cible lisible, **sac de mort renouvelé à chaque mort** (plus de perte à 3), **rapatriement du sac par l'apothicaire** (−1 niveau + 50 or → sac sur le comptoir), temps mort global entre capacités de boss (anti-enchaînement), carte M recadrée par île, nuit = ellipse du village, feu réduit sous la pluie.

## 2. ÉTAT DU JEU (vue d'ensemble)
Le jeu est **complet en solo** : 4 classes (Guerrier/Tank/Mage/Soigneur), multi-personnages (écran de sélection), monde-île d'**Ergas** (prairie/forêt/désert/neige/côte) + **Sargèr** (île maudite end-game), **16 boss** à patterns WoW (phases + 4 briques + FX), **5 rares** sur Sargèr, village vivant (forge/marché/banque/taverne/apothicaire/auberge **enterables**, intérieurs vivants), quêtes (chaîne guidée → Dargoth), météo/jour-nuit/brouillard de guerre, artisanat, panoplies, économie, **épilogue/fin de jeu**. Détail = `MEMORY.md` + ses fichiers (surtout [[sarger-endgame]], [[boss-patterns-fx]], [[mmorpg-project]]).

## 3. À TESTER EN JEU (angles morts — Claude ne peut pas)
Tout Sargèr v2 est **build-OK mais peu/pas validé au navigateur** (gros volume livré). À vérifier en priorité (F5 → flag `DEBUG_GIVE_BOAT=true` en local → touche **G** = téléport sur Sargèr) :
1. **PERFS** sur Sargèr (monde doublé + déco dense + ~96 mobs + élites + 5 rares). Si ça rame : baisser densités (`BIOME_SPAWN.cursed.mult`, seuils de `scatterCursedProps`).
2. **DIFFICULTÉ** : volontairement **group-required pur** (élites ×128 PV) → brutal en solo (assumé, en attendant le multi). Ajuster si trop/pas assez.
3. **Le DRAGON** (`dragonblue`, raid maudit) : on lui a ajouté barrage+nova mais il est **segmenté** → ses anneaux pourraient **figer** pendant un sort (NON vérifié). Si moche : restructurer (appeler `updateDragon` même pendant un cast) ou retirer ses sorts.
4. Rendu : côte de Sargèr, ruines, avant-poste + ses 4 PNJ, rares ♦ (minimap), Reliquaire (achat → butin aux pieds), brume au-dessus du perso, voile teinté par sous-zone.
5. Pas de **crash** résiduel. (Un crash a déjà été corrigé : feu de l'avant-poste poussé dans `this.campfires` sans `glow` → `updateCampfires` plantait. **Leçon : toute entrée de `this.campfires` doit avoir x/y/radius/until/sprite/flame/glow/seed, sinon crash à la 1re frame.**)

## 4. PROCHAINS CHANTIERS POSSIBLES (au choix de l'utilisateur — DEMANDER)
- **MULTIJOUEUR** = LE gros chantier visé (refonte : serveur autoritaire **Colyseus** [pré-choisi] + sync + prédiction + auth/saves **Supabase** + refactor simulation/rendu + hébergement). Débloque les RAIDS (Tengu des Glaces, Samouraï Sylvestre, Dragon) + le contenu group-required de Sargèr. **Ce N'EST PAS un petit ajout** (nouvelle fondation). ⚠️ **DÉCISION 2026-06-10 : le multi se fera à la TOUTE FIN — « pour l'instant que solo ».** Ne pas démarrer le réseau sans demande explicite.
- ⛔ **Métiers & artisanat étendu (récolte/niveaux)** : proposé puis **ABANDONNÉ** par l'utilisateur (2026-06-10). Ne pas reproposer.
- **Polish Sargèr** : équilibrage après tests, le dragon (cf. §3.3), packs d'élites en paires plus serrés, plus d'offres au Reliquaire (panoplie maudite dédiée), ambiance sonore/météo propre à Sargèr, particules d'âmes/braises (émetteur prévu mais non fait — voir spec `Brief/_sarger/deco.txt` section ambianceFx C/D + `this._ghostWisps` déjà rempli mais non utilisé).
- **Contenu Ergas** : déco fine du bourg (assets CC0 à FOURNIR par l'utilisateur), cosmétiques.
- **Bugs/équilibrage** signalés en testant.

## 5. POINTEURS TECHNIQUES CLÉS
- **Tout le gros code = `src/scenes/GameScene.js`** (génération monde, spawn, déco, combat, UI hooks) + `src/scenes/UIScene.js` (HUD/panneaux/carte M) + `src/entities/Monster.js` (boss/mobs + moteur de patterns) + `src/entities/Player.js` + `src/data/` (items.js, quests.js, classes.js, save.js, sound.js) + `src/scenes/EpilogueScene.js`.
- **Sargèr** : `CURSED_ISLE={ox:300,oy:65,rx:96,ry:82}` (centre tuile ~480,175) ; `isCursedIsland`/`cursedSub` ; gauntlet keep-out `hypot(tx-ccx,ty-ccy)<58` ; `spawnCursedRares`/`spawnGhostRuins`/`spawnSargerOutpost`/`scatterCursedProps` (toutes appelées dans `create()`).
- **Boss** : moteur de PHASES + briques dans `Monster.js` ; callbacks FX (`playFx`) dans GameScene ; flags d'instance `boss.dargoth/guardian/isRare/noArena`. `noArena` court-circuite `updateArena` (rares = combat ouvert).
- **Saves** (`src/data/save.js` `makeSave` + `Player.applySave`) : `player.resources` (poche matériaux dont `mat_curse`, à l'abri de la mort) ; champs persistés ajoutés cette session : `sargerSlain`, `dargothUnlocked`, `gameCompleted`, `counterBag` (+ déjà `bankGold/bankItems`). Compat assurée (defaults `?? 0/false/null`).
- **Pièges connus** : (a) `this.campfires` exige des entrées complètes (cf. §3.5) ; (b) `cursedBounds` n'est calculé qu'à `setupMinimap` (tard dans create) → pour la déco, calculer la bbox direct depuis `CURSED_ISLE` ; (c) `equipmentOfTier` exclut `unique`/`set`/`eliteOnly`/`craftedOnly`/`ranged` du butin normal ; (d) les n° de ligne des SPECS de workflow ne sont PAS fiables (le code bouge constamment) → toujours re-grep avant d'éditer.
- **Workflows (ultracode)** : produire des **specs apply-ready** (parallèle + ancrées dans le code réel) puis IMPLÉMENTER soi-même (les agents en worktree sur un fichier partagé = conflits). Sorties de cette session conservées dans `Brief/_sarger`, `_bal`, `_boss`, `_fx` (jetables).
- **Temp/jetable** (non committé, ignorable) : `Brief/_bal _boss _fx _sarger` (sorties de workflows), `Brief/_map*.png` (aperçus carte).
