# TODO — prochaine session (notes rapides à traiter demain)

> Liste posée le 2026-06-06 (HEAD `8cf3a77`). 6 points : bugs + équilibrage. Traiter un par un, valider au navigateur, commit + push entre chaque.

---

## 1. 🐛 Des mobs entrent dans l'arène du boss
**Constat** : des monstres ordinaires se baladent / spawnent DANS l'arène scellée d'un boss.
**Attendu** : l'arène doit rester vide de mobs (seul le boss).
**Où regarder** : `GameScene.lockArena` (évacue déjà les mobs présents via `m.despawn()` dans le rayon), `spawnableTile`/`spawnableForest` (`nearBossLair` exclut les repaires au spawn INITIAL), et le **respawn** (`spawnMonsterNear` / boucle de respawn) — vérifier qu'un mob ne peut pas RESPAWN dans une arène active (`this.activeArena`) ni y entrer en errant (collider/mur d'arène ne bloque que le boss ?).
**Piste** : dans la fonction de respawn, refuser une tuile si `this.activeArena` et distance au centre ≤ rayon ; et/ou pousser dehors les mobs qui entrent dans `activeArena` (comme `keepMonsterOutOfPrairie`).

## 2. 🎵 Le jingle de victoire doit durer ~5 s
**Constat** : `mus_victory` (joué à la mort d'un boss) joue le morceau entier (trop long).
**Attendu** : ~5 secondes puis retour à la musique de zone.
**Où** : `Audio.playVictory` (sound.js) — le son joue en `loop:false` jusqu'à `complete`. Ajouter une **coupure programmée** : `scene.time.delayedCall(5000, ...)` ou un fondu de sortie à ~5 s qui remet `victoryActive=false` et `curKey=null` (la zone reprend). Attention : pas de `scene` dispo dans playVictory → passer la scène ou utiliser un setTimeout / un tween proxy.

## 3. ⚖️ XP des mobs au spawn — trop d'XP au niveau 3
**Constat (mots de l'utilisateur)** : « mob au spawn moins d'xp si niveau 3 ».
**Interprétation** : les mobs proches du village montés au niveau 3 (par distance) donnent trop d'XP → la courbe d'XP par niveau de zone monte trop vite près du spawn. **À CLARIFIER** avec l'utilisateur demain.
**Où** : `Monster` constructeur, `xpReward = def.xp * lvlMul * xpMul` (lvlMul = `MOB_HP_MUL^(lvl-1)`, donc l'XP suit les PV ×2/niveau). Piste : faire une courbe d'XP plus douce que celle des PV (ex. `xpMul` plus plat), ou capper l'XP des mobs de bas niveau de zone.

## 4. 🗡️ Durabilité d'arme : ne se casse que pour le Guerrier ?
**Constat (mots)** : « arme qui ne se casse que pour le guerrier ».
**Interprétation possible** : (a) BUG = seule l'arme du Guerrier perd de la durabilité (les autres classes non), ou (b) SOUHAIT = ne faire casser les armes QUE pour le Guerrier. **À CLARIFIER**.
**Où** : `Player.wearSlot('weapon')` — qui l'appelle ? L'usure d'arme est-elle branchée uniquement sur l'attaque de mêlée (Guerrier/Tank) et pas sur les tirs (Mage/Soigneur) ? Chercher les appels `wearSlot('weapon')` dans GameScene (mêlée vs tir). Si seul le Guerrier use son arme → vérifier que le Tank/mêlée aussi, et décider du comportement voulu pour Mage/Soigneur.

## 5. ❄️ Armure épique (violette) qui ralentit à cause du froid
**Constat** : une armure violette (épique) fait ralentir le joueur dans le froid (neige).
**Interprétation** : l'armure n'a pas de `coldResist` → le joueur subit le ralentissement de température comme sans armure. Peut-être perçu comme un « malus » de cette armure.
**Où** : `items.js` (armures épiques : `plate`, `forged_plate`, `legend_armor`, pièces de set, items d'élite armure) — aucune n'a `coldResist`/`heatResist` sauf `furcloak`/`desertgarb`. `GameScene.updateTemperature` applique le ralenti si `temp` extrême et pas de résistance. **À décider** : est-ce un bug (l'utilisateur s'attend à ce qu'une bonne armure protège un peu du froid) ou normal (la résistance vient d'items dédiés) ? Identifier l'armure violette précise concernée.

## 6. 🐛 Mort pendant un boss verrouillé → réapparition DANS l'arène
**Constat** : si on meurt alors qu'un boss est verrouillé (arène scellée), on réapparaît **dans l'arène** (piégé).
**Attendu** : à la mort, l'arène se libère et on respawn au **village**.
**Où** : `GameScene.handleDeath` / `die` — il y a déjà `this.releaseArena()` + `activeBoss=null` au respawn (cf. mémoire), mais visiblement insuffisant : vérifier que **`releaseArena` est bien appelé AVANT de poser la position de respawn**, que le boss est désengagé (`combatEngaged=false`, PV restaurés, retour repaire), et que le mur invisible/arène ne re-verrouille pas au moment du respawn. Tester : mourir volontairement contre un boss de raid (Tengu/Samouraï) et vérifier le respawn au village.

---

### Méthode (rappel)
Une chose → valider au navigateur (reload **complet** F5) → commit FR + `Co-Authored-By` → push. `AskUserQuestion` pour les points #3 et #4 (ambigus). `node --check` après chaque édition.
