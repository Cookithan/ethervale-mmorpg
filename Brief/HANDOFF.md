# HANDOFF — « Island of Ergas » (état 2026-06-11)

> **PROCHAIN CLAUDE : lis ce fichier EN PREMIER, puis l'index mémoire `MEMORY.md`.**
> Ce doc dit exactement où on en est et ce qu'il reste.

---

## ⚡ SESSION 2026-06-11 — 5 COMMITS POUSSÉS (`3df955c` → `5913a31` → `a650ac3` → `71bdd70` → ce HANDOFF), TOUT VALIDÉ EN JEU
Détail complet en mémoire : [[dungeons-v2-dragon-mer]] + [[skill-library-loadout]] (section mapping) + MEMORY.md (équilibrage, icônes).

1. **`3df955c` — DONJONS-GROTTES v2 (premiers vrais tests → refonte, user : « nickel »).** Agrandis/élargis ~4× (Grotte Moussue 7 salles 32×31, Tanière Ocre 6 salles + boucle 38×24, couloirs 3-5 tuiles, chambres de boss 14×9 / 12×9). **FIX DEPTH structurel** ⭐ : le donjon (y≈-6000) passe à la convention du monde `depth = y` — sinon projectiles (`y+40`), butin (`Drop` à `y`), FX/télégraphes (`boss.y±n`) passaient SOUS le sol (invisibles) ; sous-sol à `DG−20/30/40`, aura du boss à `bounds.y−10`. **Barres de PV fantômes** corrigées (`teardownDungeon` → `despawn()` au lieu de `destroy()` brut). **Déco SOLIDE** (pierres/idoles/coffre, collider joueur SEULEMENT — les mobs sans pathfinding se coinceraient). **Entrée au CONTACT** de la bouche (E explicitement REFUSÉ par l'user pour l'entrée) + **SORTIE à la touche E** (invite « ↑ Sortir (E) » surlignée). **COFFRE « JOURNALIER » persistant** : pillage horodaté `player.dungeonChests[id]` (save), rouvre VIDE 20 h (`DUNGEON_CHEST_REFILL_MS`), le boss repope à chaque visite. Outil **`scripts/dungeon_check.cjs`** (ASCII + flood-fill — TOUJOURS le relancer après modif de layout, configs dupliquées à resynchroniser). + **Dragon de mer réactivé** (le `return` masquant datait du brouillard de guerre) avec **PLONGÉE** : barque à <130 px du corps → s'enfonce (remous), avance invisible (remous discrets = son ombre), ressurgit à ≥4 s et >240 px ; piéton sur la plage = ne plonge jamais. + **9 MP3 réencodés 256→128 kbps** (mus_tavern 18,1→9,1 Mo, total ~50→25 Mo ; ffmpeg via winget, binaire sous `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_…\bin`, PAS dans le PATH des shells).
2. **`5913a31` — MAPPING PRÉCIS boss→compétence (user : « nickel »).** `SKILL_SOURCES` + `skillTaughtBy(skillId, mon)` dans `classes.js` : chaque gated a SON boss (match `typeKey` + flags `guardian`/`dungeonBoss` — types réutilisés entre Ergas/Sargèr/donjons). Échos narratifs (Akaoni→Cri de rage, Akaoni le Damné→Furie ; Fujin→Météore, Fujin le Damné→Cataclysme), chaque donjon enseigne un sort (Spectre→Image miroir, Griffe-Pourrie→Forteresse), Nyl→Intervention divine. Grimoire = « 🔒 Enseigné par … » ; toast nominatif. Panoplie 4/4 = 2e voie pour l'ULT (Player.js ~301, intact). Raids/Dargoth/rares/boss « 2 » n'enseignent rien.
3. **`a650ac3` — ÉQUILIBRAGE DES SORTS (audit complet code vs catalogue) + dragon→Sargèr.** **Guerrier/Tank : +2 mana/NIVEAU** (pools figés 60/70 face à des sorts gated à 45-55 = ULT injouable ; rattrapage auto des vieilles saves dans `applySave`, plancher = mana de classe + niveaux acquis). Météore 3→3,8×ATQ R72→84 (rendait moins que Tempête de feu niv.1) ; Onde de choc stun boss 4→2,2 s (dépassait le Cri de guerre) ; Image miroir 6→8 s ; Nova sacrée 1,5→1,8 ; infobulles resynchronisées. **Laissés exprès** : Charge (signature), Mur de garde 50 % (identité Tank), Pyroblast>traits (feu=dégâts), Cataclysme (setup requis), régén globale 1,6/s (toucher = buffer les casters). **Dragon des Abysses déplacé : il rôde autour de SARGÈR** (`buildSeaPath(cx,cy,maxR)` paramétré sur `CURSED_ISLE`) — gardien thématique des eaux end-game, hors champ à l'accueil.
4. **`71bdd70` — ICÔNES DÉDIÉES des 16 pièces de panoplie (user : « nickel »).** 13 icônes Kyrise (CC BY, **chacune examinée à l'œil** — règle absolue) : `set_armor_/set_relic_/set_ring_{war,tank,mage,heal}` (items/) + `set_staff_heal` (weapons/ — la Soigneuse a ENFIN son arme distincte du Mage). Plus aucun `rel_emerald`/`eq_ring_emerald` partagé. Vieilles saves migrées (`refreshItemDef`). **Outil dev `DEBUG_GIVE_SET`** (dormant) : touche **P** → la panoplie de sa classe tombe aux pieds.

⚠️ **WORKING TREE LOCAL** : `DEBUG_GIVE_BOAT = true` (volontaire — flag dance : JAMAIS commiter à true).
**RESTE / PROCHAINE SESSION** : **retours d'équilibrage** de l'user en jouant (la 1re passe chiffrée est faite, le ressenti tranchera) ; backlog : **polish Sargèr** (braises/âmes — `this._ghostWisps` rempli mais jamais branché, spec `Brief/_sarger/deco.txt` section ambianceFx C/D), **dragon segmenté en RAID à vérifier** (ses anneaux pourraient figer pendant un cast), timer entre quêtes (option, jamais fait), cosmétiques, lore écrit ; **GROS CHANTIERS à trancher : MOBILE/PWA (jamais commencé — joystick virtuel, UI tactile, manifest) PUIS MULTIJOUEUR (toute fin, décision ferme)**. ⛔ Interdits (ne pas reproposer) : métiers/récolte, relief/montagnes, température inversée Sargèr.
📒 **Revue COMPLÈTE des 9 briefs faite le 2026-06-11** : tout le reste y est FAIT — ne pas refouiller les vieux briefs, ce HANDOFF + MEMORY.md font foi.

---

## 0. Cadre & règles de travail
- **Jeu** : RPG action top-down, **Phaser 3.90 + Vite**. Lancer : `npm run dev` → http://localhost:5173 (HMR ; **Ctrl+Shift+R** si assets/preload changent — le HMR ne relance pas `create()`).
- **Repo** : github.com/Cookithan/ethervale-mmorpg (compte gh `Cookithan`), branche **main**. `git push origin main` après commit.
- **Claude est AVEUGLE en jeu** (aucun playtest possible). Vérification = `npx vite build` (attendre **EXIT=0**) + outils PNG :
  - `scripts/room_preview.cjs` → aperçu des **intérieurs** (PNG).
  - `scripts/map_preview.cjs` → aperçu de la **carte monde** (PNG `Brief/_map.png`).
  - `scripts/dungeon_check.cjs` → **donjons** : ASCII + connectivité (configs DUPLIQUÉES, à resynchroniser avec `dungeonConfig`).
- **Avant CHAQUE commit** : `arcade.debug=false` (main.js l.23) **ET** tous les flags `DEBUG_*` à **false** (GameScene.js en tête), build, commit, push, **puis remettre `DEBUG_GIVE_BOAT=true` en LOCAL**. Messages de commit en français, terminés par `Co-Authored-By: Claude ... <noreply@anthropic.com>`.
- **Outils dev dormants** (flags en tête de GameScene, commités à false) : `DEBUG_SPAWN_BOSS` (id → touche **B** invoque ce boss), `DEBUG_GIVE_BOAT` (barque + **G** téléport Sargèr + gate off), `DEBUG_TP_HAMLET` (**H** → hameau Ombrebois, grottes-donjons au NO/SE), `DEBUG_GIVE_SET` (**P** → panoplie de sa classe aux pieds), `TEST_UNLOCK_SKILLS`.
- **Règles utilisateur** : AskUserQuestion AVANT gros changement/choix de design (mais quand il dit « go », on fonce) ; assets À REGARDER (Read du PNG) avant de choisir ; il valide en jeu → itère sur ses retours ; déco = assets Ninja ; ultracode autorisé pour les gros chantiers (specs apply-ready puis implémenter soi-même).

## 1. ÉTAT DU JEU (vue d'ensemble)
Le jeu est **complet et POLI en solo** : 4 classes × bibliothèque de compétences (4 slots, ~8-9 sorts/classe, états-combos 🩸❄️🔥💀⚡, chasse à la compétence sur boss PRÉCIS, équilibrage passé), monde d'**Ergas** + **Sargèr** miroir end-game (gauntlet Dargoth + épilogue), **2 donjons-grottes instanciés** (validés, coffres journaliers), **16 boss** à patterns WoW + 5 rares ♦, village vivant (8 bâtiments enterables), quêtes, météo/jour-nuit/brouillard, artisanat, panoplies (icônes dédiées), économie, multi-personnages, dragon de mer d'ambiance autour de Sargèr. Musiques compressées. Détail = `MEMORY.md`.

## 2. PROCHAINS CHANTIERS POSSIBLES (au choix de l'utilisateur — DEMANDER)
- **Retours d'équilibrage** des sorts (en jouant) + bugs signalés.
- **Petits** : polish Sargèr (braises/âmes), vérif dragon-raid segmenté, timer entre quêtes, cosmétiques, déco fine du bourg (assets CC0 à fournir par l'user).
- **MOBILE / PWA** : jamais commencé, à faire idéalement AVANT le multi (joystick virtuel, boutons tactiles, manifest, perfs).
- **MULTIJOUEUR** = LE chantier final (Colyseus serveur autoritaire + Supabase + refactor dégâts côté serveur + sync/prédiction + hébergement). Débloque raids, group-content de Sargèr, états-combos inter-classes. ⚠️ Décision ferme : à la TOUTE FIN.
- ⛔ Ne pas reproposer : métiers/récolte, relief/montagnes, température inversée Sargèr.

## 3. POINTEURS TECHNIQUES CLÉS
- **Tout le gros code = `src/scenes/GameScene.js`** (+ `UIScene.js`, `entities/Monster.js` (boss/patterns/états), `entities/Player.js`, `src/data/` items/quests/classes/save/sound, `EpilogueScene.js`).
- **Donjons** : `dungeonConfig` (layouts), `buildDungeon`/`spawnDungeonContents`/`updateDungeon`/`teardownDungeon`. ⭐ Toute zone HORS-MAP doit suivre `depth = y` (sous-sol encore en dessous) sinon tout ce qui se depth-e sur y devient invisible. `despawn()` (jamais `destroy()`) pour retirer un Monster.
- **Compétences** : catalogue `SKILLS` + `SKILL_SOURCES`/`skillTaughtBy` (classes.js) ; cast `castSlot`/`skillEffects()` ; déblocage `tryUnlockSkillFromBoss` (GameScene ~7220) ; grimoire chez Ylva (UIScene `buildGrimoire`).
- **Sargèr** : `CURSED_ISLE={ox:300,oy:65,rx:96,ry:82}` ; dragon de mer = `spawnSeaDragon`/`buildSeaPath` (GameScene ~3155) + `updateSeaPatrol` (Monster, plongée).
- **Saves** (`makeSave`/`applySave`) : nouveaux champs `dungeonChests` (coffres journaliers) ; rattrapage mana mêlée dans applySave ; compat assurée partout (`?? défaut`).
- **Pièges connus** : (a) entrées `this.campfires` complètes sinon crash ; (b) `equipmentOfTier` exclut unique/set/eliteOnly/craftedOnly/ranged ; (c) les n° de ligne bougent constamment → re-grep avant d'éditer ; (d) PNG = outil Read, jamais cat ; (e) winget installe hors PATH de session (chercher le binaire sous `%LOCALAPPDATA%\Microsoft\WinGet\Packages`).
- **Temp/jetable** (non committé) : `Brief/_bal _boss _fx _sarger`, `Brief/_map*.png`, `.claude/`.
