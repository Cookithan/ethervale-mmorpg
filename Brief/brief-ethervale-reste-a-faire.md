# Brief — Éthervale : ce qui reste à faire (recentré sur le code réel)

> Ce document est aligné sur **l'état réel du dépôt** (`Cookithan/ethervale-mmorpg`). Il ne décrit **que ce qui reste à construire** : la majeure partie du contenu solo est déjà codée — **ne pas la refaire**.
> Stack en place : **Phaser 3.90 + Vite 7**. Pas encore de Colyseus ni de Supabase.

---

## Carte du code (pour t'y retrouver)

- `src/data/classes.js` — 4 classes, leurs sorts (charge/shield/meteor/heal), apparences.
- `src/data/items.js` — items, `RARITY` (4 paliers + couleurs), slots (weapon/armor/focus/ring), restriction par classe, légendaires boss-only, durabilité.
- `src/data/save.js` — sauvegarde **localStorage** (`mmorpg_save_v1`), via `makeSave/loadSave/writeSave`.
- `src/entities/Player.js` — joueur : `hp`, `takeDamage()`, `level/xp/xpToNext`, `gold`, `equipped`, `inventory`, buff bouclier.
- `src/entities/Monster.js` — définitions des monstres (hp, damage, xp), élites, monstres à distance.
- `src/entities/Projectile.js`, `src/entities/Drop.js` — projectiles et objets au sol.
- `src/scenes/GameScene.js` (gros fichier) — génération de map (`ISLAND_RX/RY`, `VILLAGE_OFF_X`, `CURSED_ISLE`, `tileNoise`), combat, sorts, marchand, boss + arène (`ARENA_RADIUS`, `BOSS_BAR_RANGE`, `BIOME_BOSSES`), respawns.
- `src/scenes/UIScene.js` — HUD en jeu.
- `src/scenes/CharacterScene.js` — fiche personnage / inventaire / équipement (touche C).
- `src/scenes/MenuScene.js`, `src/scenes/BootScene.js` — menu d'accueil, chargement des assets.

## Déjà fait (NE PAS refaire)

4 classes + kits (mana + cooldown) · skins séparés de la classe · items 4 raretés + couleurs + restriction de classe + légendaires boss-only + durabilité · 4 slots d'équipement · fiche personnage/inventaire (CharacterScene) · monstres par biome + élites + boss de biome avec arène et barre de boss · map île elliptique avec biomes au bruit, village décentré, île maudite end-game, difficulté par distance · marchand, PNJ, sons, sauvegarde locale.

---

## Règles de travail (impératives)

1. **Une chose à la fois** : coder, tester, valider, **commit**, puis suivant.
2. **Ne casse pas l'existant** : compléter le code en place, pas le réécrire.
3. **MVP strict** ; chiffres = points de départ à équilibrer.
4. Pour le multi : **serveur autoritaire** (Partie B) — non négociable.

---

# PARTIE A — Reste de contenu (solo)

## A0. Vérifications rapides AVANT de coder (peut-être déjà partiellement fait)

Inspecter ces points et **ne compléter que si absent** :
- **Inventaire limité à 5 items** (sac), équipement des 4 slots à part → vérifier la taille dans `Player.js` / `CharacterScene.js`.
- **Aura de couleur au drop** selon la rareté (halo sur l'objet au sol) → vérifier `Drop.js` ; ajouter le halo coloré (couleurs de `RARITY`) si absent.
- **Icônes de compétences dans le HUD** (attaque de base + sort, avec coût mana + cooldown visibles) → vérifier `UIScene.js` ; améliorer si seulement du texte.
- **Créatures placées dans les zones de prairie** → les monstres spawnent déjà par biome dans `GameScene.js` ; vérifier que les zones d'herbe sont bien peuplées, ajuster sans régénérer la map.

## A1. Système de mort & sac de récupération (NOUVEAU — à construire)

Introuvable dans le code actuel. À implémenter :
- À la mort : déposer **or + les items du sac (max 5)** dans **un sac à l'endroit de la mort**. **Garder l'équipement porté + le niveau.** Respawn au village.
- Le sac est **visible sur la mini-map et la grande carte**.
- **Récupérable par le propriétaire uniquement** (en multi : garanti côté serveur).
- À la récupération : **message listant ce qui a été repris** (or + objets).
- **Un seul sac à la fois** : mourir à nouveau avant de récupérer crée un nouveau sac et l'ancien est perdu ; **reset définitif après 3 morts** sans récupération.
- Accroche : le handler de mort du joueur dans `GameScene.js` + l'objet de sauvegarde dans `save.js` (ajouter l'état du sac).

## A2. Cap niveau 50 + courbe d'XP "façon WoW" (à caler)

- Fixer le **niveau max à 50**.
- **Courbe d'XP exponentielle** : rapide au début, mur de plus en plus raide vers 50 (le farm hardcore est l'end-game, pas le leveling).
- Accroche : `Player.js` (`level`, `xp`, `xpToNext`, montée de niveau).

## A3. Bateau au marchand → débloquer l'eau & les terres maudites (à construire)

- L'**île maudite (`CURSED_ISLE`) existe déjà** dans `GameScene.js`, mais l'accès par bateau est à ajouter.
- Ajouter un **bateau (asset)** permettant de **traverser l'eau**.
- **Acheté au marchand, très cher en or** (gros puits à or end-game).
- Une fois le bateau acquis → l'eau devient franchissable → accès aux **terres maudites + boss end-game** (le contenu le plus dur, après le niveau 50).
- Accroche : stock du marchand + collisions eau dans `GameScene.js`.

---

# PARTIE B — Multijoueur (Phase 4-5)

> 🚩 Le projet est déjà sur GitHub : bien. Avant d'attaquer, **brancher un commit/push réguliers** — la Phase 4 remue beaucoup de fichiers.

## Diagnostic (déjà fait — voici les conclusions)

- **Les dégâts sont calculés côté client** : `Player.takeDamage()` (et stats monstres dans `Monster.js`). → **À déplacer côté serveur** : c'est le plus gros chantier solo→multi.
- **La sauvegarde est en localStorage** (`save.js`). → **À migrer vers Supabase** pour le multi.
- L'**état d'un joueur** (forme à mettre dans le state schema) est déjà défini dans `makeSave()` : classe/apparence, level, xp, gold, hp, equipped, inventory, position.
- Le **système de boss + arène + barre de boss** existe (`GameScene.js`) → à adapter en **PV partagés** pour les boss communautaires.

## ⚠️ Principe fondamental — Serveur autoritaire (non négociable)

Le serveur Colyseus est la **seule source de vérité**. Le client envoie des **intentions** ; le serveur **valide, calcule (dégâts, PV, loot, mort) et diffuse**. Ne jamais faire confiance au client pour les chiffres (triche + désync sinon).

## Modèle de synchro

1. **État continu** (state schema Colyseus) : positions, PV, mana, état (incantation/bouclier/mort).
2. **Événements ponctuels** (messages) : "X a lancé Y". **On ne transmet pas les animations** → chaque client rejoue l'anim localement à partir de l'événement (léger, fluide).

## Étapes (couche par couche, tester à 2 joueurs puis 5-10)

1. **Serveur Colyseus** (Node.js, hébergé Railway) : installer, créer une Room = la map, définir le **state schema** (réutiliser la forme de `makeSave`).
2. **Voir les autres bouger** : synchro des positions + **prédiction côté client pour soi** + **interpolation pour les autres**.
3. **Plaques de nom + barres Vie/Mana** au-dessus des joueurs (couleur par classe).
4. **Chat de zone** (via Colyseus), **en bas à gauche**, + anti-spam serveur.
5. **Actions & animations synchronisées** : les sorts existent déjà (`GameScene.js`) → les déclencher via événements réseau (projectile, bouclier, soin, charge, météore + cast bar).
6. **Combat autoritaire** : déplacer la logique de `takeDamage` côté serveur ; **PV des monstres partagés** ; attribution des dégâts (pour le loot par contribution) ; mort/respawn cohérents avec A1 (sac protégé serveur).
7. **Monstres & loot pilotés serveur** (spawn, IA, tirage de rareté côté serveur ; affichage avec l'aura de rareté).
8. **Boss communautaires** : adapter le système d'arène existant en **PV partagés affichés en grand** ; attaques uniques télégraphiées par boss ; **menace/aggro + Provocation du Tank** ; **loot par contribution** ; annonce dans le chat.
9. **Persistance & reconnexion** : migrer `save.js` vers **Supabase** (level, xp, équipement, inventaire, or, position, exploration, état du sac de mort) ; gérer les déconnexions.
10. **Sécurité / anti-triche** (gratuit si serveur autoritaire) : valider vitesse, cooldowns, mana, portée, dégâts, droit de ramasser un sac ; rate-limit.
11. **Capacité** : démarrer à 10 joueurs, puis viser 50 (n'envoyer que les entités proches quand nécessaire).

## À NE PAS faire maintenant

Multi multi-régions · groupes formels (au MVP, tous les joueurs d'une zone sont "ensemble") · monde persistant qui change après un boss · modération de chat avancée.

---

> 📝 **À part (pas pour Claude Code)** : le **lore / l'histoire d'Éthervale** est de l'écriture, pas du code — à rédiger séparément.
