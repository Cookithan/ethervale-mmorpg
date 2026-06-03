# Brief — Éthervale : améliorations Combat / Items / Inventaire / Progression / Quêtes

> Document à intégrer dans un projet **déjà existant**. Il ne s'agit PAS de repartir de zéro.
> Objectif : poser des **systèmes** clairs et lisibles, sans casser ce qui marche déjà.

---

## Contexte du projet

MMO RPG 2D top-down (médiéval fantasy), pixel art, **Phaser 3 + Vite**, multijoueur prévu via **Colyseus**, persistance **Supabase**. Cible mobile + PC (PWA).

**État actuel (déjà codé, NE PAS refaire) :**
- Phases 1 à 3 terminées : déplacement, caméra, collisions, combat solo, monstres avec IA basique, XP/niveaux, drop d'items, inventaire, équipement, stats (PV/Attaque/Défense).
- 4 classes existent : **Guerrier, Mage, Soigneur, Tank**.
  - Guerrier : attaque mains nues au corps-à-corps.
  - Mage : projectiles (~1/sec), gros dégâts.
  - Soigneur : projectiles plus faibles + peut se soigner.
  - Tank : lent, beaucoup de PV (pas encore d'attaque claire).
- L'**or** existe déjà comme monnaie.
- Phase en cours : **contenu solo (Phase 6)**. Le multijoueur (Phase 4) n'est PAS commencé.

---

## Règles de travail (impératives)

1. **Solo-first** : tout ce qui suit se code et se teste en solo (un seul joueur). Aucune dépendance au réseau.
2. **Ne casse pas l'existant** : intègre par-dessus le code actuel, ne réécris pas les systèmes qui fonctionnent.
3. **Crée des SYSTÈMES, pas du contenu en dur** : items, quêtes, monstres doivent être pilotés par des **données** (objets/JSON/config), pas codés en dur un par un. On doit pouvoir ajouter une quête ou un item en ajoutant une ligne de données, sans toucher au code.
4. **MVP strict** : implémente la version minimale qui marche, fais-la valider, puis enrichis. Pas de feature bonus tant que la base n'est pas validée.
5. **Commit après chaque feature** qui fonctionne.
6. Les **chiffres** donnés ci-dessous (cooldowns, coûts de mana, taux de drop, PV) sont des **points de départ à équilibrer**, pas des valeurs définitives.

---

## 1. Système de combat unifié

Une seule règle pour les 4 classes, pour rester simple à comprendre :

- Chaque perso a **2 barres** : **Vie** (rouge) et **Mana** (bleue).
- L'**attaque de base** est **gratuite et sans cooldown** → spammable, c'est le dégât de fond.
- Chaque classe a **1 sort** (un seul) qui **coûte du mana + a un cooldown**.
- Le **mana se régénère lentement** tout seul.

Rythme visé : on spamme l'attaque de base, et on place son sort quand le mana/le cooldown le permettent.

### Ciblage (style WoW allégé)
- Tap/clic sur un ennemi → il devient la **cible active**.
- Un **cadre de cible** s'affiche (nom + barre de vie de la cible).
- L'attaque de base et les sorts offensifs visent cette cible.
- Le **soin ne nécessite pas de cibler** : il s'applique automatiquement à **l'allié blessé le plus proche** (ou à soi-même si on est seul).

---

## 2. Les 4 classes (attaque de base + 1 sort chacune)

| Classe | Attaque de base (gratuite) | Sort (mana + cooldown) | Identité |
|---|---|---|---|
| **Guerrier** | Coup mains nues rapide (déjà codé) | **Charge** : dash jusqu'à la cible + gros dégât. Instantané. (cd ~6s) | DPS corps-à-corps mobile |
| **Tank** | Coup mains nues qui tape **moins fort** (réutiliser la hitbox melee du Guerrier, dégâts réduits) | **Bouclier** : −50% dégâts reçus pendant 4s. Instantané. (cd ~10s) | Encaisse |
| **Mage** | Projectile ~1/sec (déjà codé) | **Météore** : pose une zone au sol, dégâts sur la durée à tout ce qui est dedans (AoE). **Avec incantation** (voir §3). (mana élevé, cd ~8s) | Gros dégâts à distance |
| **Soigneur** | Petit projectile faible (déjà codé) | **Soin** : rend des PV à l'allié blessé le plus proche (ou soi-même). Instantané. (cd ~3s) | Soutien |

**Hitbox melee (pour Guerrier et Tank)** : une attaque au corps-à-corps = on fait apparaître une **hitbox temporaire** (rectangle/arc) devant le perso, dans sa direction, qui vit ~150 ms ; on teste l'overlap avec les ennemis pendant cet instant et on applique les dégâts.

> Note d'architecture pour plus tard : centralise le **calcul des dégâts** dans une fonction unique (côté logique de jeu), pour qu'il soit facile de la déplacer **côté serveur** à la Phase 4. Ne disperse pas la logique de dégâts dans le rendu.

---

## 3. Barre d'incantation (cast bar)

Pour le feeling "gros sort" :

- Le **Météore du Mage** a un **temps d'incantation (~1,5s)** : à l'appui, une petite barre se remplit ; le sort ne part qu'**à la fin**.
- Pendant l'incantation : le joueur **ne peut pas bouger**, et **s'il prend un coup, l'incantation est annulée** (sort perdu).
- **Tous les autres sorts restent instantanés** (Charge, Bouclier, Soin).

Implémentation : un timer (~1,5s) + une barre qui se remplit + une condition d'annulation (mouvement ou dégât reçu). Si le timer va au bout → le sort part.

> **MVP** : commence avec **tout instantané** (Météore inclus). Ajoute la cast bar **uniquement sur le Météore** dans un second temps, pour tester le feeling avant de l'étendre.

---

## 4. Interface de combat (HUD)

Pensée **mobile + PC**, volontairement minimale :

- **2 boutons** seulement : `ATK` (attaque de base, toujours dispo) et `SORT` (affiche le **coût en mana** + un voile gris qui se vide = le **cooldown**).
- **Barres Vie + Mana** près du perso (ou en bas avec les boutons).
- **Cadre de cible** en haut/centre quand un ennemi est sélectionné (nom + sa vie).
- **Mobile** : joystick virtuel au pouce gauche pour se déplacer, les 2 boutons au pouce droit.
- **PC** : déplacement clavier existant + sorts sur touches `1` / `2` (ou clic sur les boutons).
- **Bouton d'ouverture de l'inventaire/personnage** (icône sac) accessible depuis le HUD ; touche `I` ou `C` sur PC (voir §6).
- **Minimap** en haut à droite (toujours visible) + bouton/touche `M` pour la carte du monde plein écran (voir §7).

Schéma indicatif :
```
        +-- Cible : Gobelin ----+
        | ######___  Vie        |
        +-----------------------+

              [ perso ]

   Vie   ##########____
   Mana  #######_______
        [  ATK  ]  [  SORT (cd)  ]   [sac]
```

---

## 5. Items

**4 emplacements d'équipement seulement**, chacun lié à une stat que le joueur connaît déjà :

| Slot | Effet |
|---|---|
| Arme | + Attaque |
| Armure | + Défense (réduit les dégâts reçus) |
| Casque | + Vie max |
| Anneau | + Mana max (ou régénération de mana) |

**Impératif** : les items doivent **réellement modifier les stats branchées sur le combat** (équiper une épée +10 Attaque doit faire taper plus fort pour de vrai).

### Rareté
Couleur + multiplicateur sur la même base d'item :

| Rareté | Couleur | Exemple (Attaque) |
|---|---|---|
| Commun | gris | +5 |
| Magique | bleu | +12 |
| Rare | violet | +25 |
| Légendaire | or | +50 |

→ Un même item de base est généré avec des chiffres plus gros selon la rareté. Pas besoin de créer des centaines d'items différents : **base × multiplicateur de rareté**.

### Restriction par classe
Certains items ne sont utilisables que par certaines classes. Pour rester simple, **seules les armes sont restreintes** ; le reste est universel.

| Slot | Restriction |
|---|---|
| **Arme** | **Spécifique à la classe** — Guerrier → épée · Tank → masse/bouclier · Mage → bâton/sceptre · Soigneur → bâton de soin |
| Armure / Casque / Anneau | Toutes classes |

- Chaque item porte un champ **classes autorisées** dans ses données (défaut = toutes les classes). Au moment d'équiper, on vérifie que la classe du joueur est autorisée.
- Si l'item n'est **pas** pour la classe du joueur → il apparaît **grisé** dans l'inventaire avec la mention "Réservé : Mage" (par ex.), et ne peut pas être équipé.
- Le loot peut tomber **pour n'importe quelle classe**. Un item inutilisable par le joueur n'est pas perdu : il se **revend** au marchand (ou se **troque** entre joueurs plus tard, en multi). → C'est un futur levier d'échange entre joueurs, gratuit à mettre en place côté données.

---

## 6. Écran de personnage & inventaire

Écran dédié (le "paper doll") qui montre le perso, son équipement et ses stats. **C'est principalement de l'UI par-dessus les données d'inventaire/équipement déjà codées en Phase 3** — pas un nouveau système de fond.

**Ouverture** : bouton (icône sac) sur le HUD, ou touche `I` / `C` sur PC. Overlay plein écran (en solo, peut mettre le jeu en pause).

**Contenu de l'écran :**
- **Personnage (paper doll)** : le sprite du perso au centre, avec ses **4 slots d'équipement** autour (Arme, Armure, Casque, Anneau).
  - Tap sur un slot équipé → déséquipe (renvoie l'item dans l'inventaire).
  - Tap sur un item de l'inventaire → l'équipe dans le bon slot (si la classe l'autorise, cf §5).
- **Grille d'inventaire** : 6-8 slots affichant les items possédés (couleur = rareté).
- **Panneau de stats** : **Vie, Mana, Attaque, Défense**, affichées en **total = base + équipement**, idéalement avec le détail (ex : `Attaque 25 (15 + 10)`). Afficher aussi **Niveau, barre d'XP, Or**.
- **Détail d'item (tooltip)** : au tap/survol d'un item, montrer son nom, sa rareté (couleur), sa/ses stat(s), et son éventuelle **restriction de classe**.

**Impératif** : équiper/déséquiper un item doit **recalculer et mettre à jour les stats en direct**. Exemple : équiper un casque +20 Vie max augmente immédiatement la barre de Vie max ; équiper une arme +10 Attaque change tout de suite les dégâts infligés. L'écran ne doit pas être seulement décoratif.

**Mobile-first** : tap pour équiper/déséquiper (drag-and-drop optionnel), overlay plein écran, bouton fermer visible.

Schéma indicatif :
```
+-----------------------------------------------+
|  PERSONNAGE                            [ X ]   |
|                                                |
|   [Casque]                   Niveau 7          |
|   [ Arme ]    ( sprite       XP ####____       |
|   [Armure]      du perso )   Or : 340          |
|   [Anneau]                                     |
|                              Vie     120 (100+20) |
|   Inventaire                 Mana     80 (80+0)   |
|   [ ][ ][ ][ ]               Attaque  25 (15+10)  |
|   [ ][ ][ ][ ]               Défense  12 (5+7)    |
+-----------------------------------------------+
```

---

## 7. Carte & exploration (minimap + carte du monde)

Deux vues qui partagent **les mêmes données d'exploration** (le système de révélation ne se code qu'une fois) :

### Minimap (toujours visible)
- Petit carré en **haut à droite** de l'écran, qui **suit le joueur** et montre les environs immédiats.
- Affiche un **point pour le joueur** (et plus tard, en multi : points pour les autres joueurs, PNJ, boss).
- Techniquement en Phaser : une **deuxième caméra** dézoomée centrée sur le joueur. Reste petite sur mobile pour ne pas encombrer l'écran.

### Carte du monde (plein écran, à la demande)
- Ouverte par un **bouton** (icône carte) ou la touche **`M`** sur PC. Overlay plein écran + bouton fermer.
- Montre **tout le monde déjà exploré** ; les zones jamais visitées restent **en noir**.

### Brouillard de guerre (fog of war)
- Un calque noir opaque recouvre les zones non explorées. Quand le joueur se déplace, on **efface un disque** autour de sa position → la carte se révèle au fil de l'exploration.
- **Impératif : la révélation doit être persistante.** On stocke la progression d'exploration (grille "tuile vue / pas vue") dans **Supabase**, pour qu'elle reste après déconnexion/reconnexion. Sinon le brouillard se réinitialise à chaque session = frustrant.
- Minimap et carte du monde **lisent la même grille** d'exploration.

> **MVP** : commence par la **minimap qui suit** (sans brouillard), valide l'affichage mobile + PC. Puis ajoute la **carte du monde** plein écran. Puis le **brouillard persistant** par-dessus, en dernier.

---

## 8. Marchand (PNJ)

3 fonctions suffisent :

1. **Acheter** : stock de base (potions, équipement commun/magique). **Pas de légendaire au marchand** → les meilleurs items se méritent sur les boss.
2. **Vendre** : revendre les items inutiles contre de l'or (y compris les items d'autres classes ramassés). Évite l'inventaire qui déborde.
3. **Potions** : consommables (soin instantané, régén mana) — raison de revenir régulièrement.

Pour l'instant : **prix fixes**. (Une vraie place de marché entre joueurs viendra plus tard, en multi.)

---

## 9. Progression & difficulté

Objectif de design : un jeu **exigeant où il faut farmer pour devenir fort**, mais **lisible** (jamais injuste/opaque). La difficulté vient de "cet ennemi est plus fort que moi, je dois progresser", pas de "le jeu triche".

Trois courbes à régler (ce sont des **chiffres**, pas de nouveaux systèmes) :

### a) Les ennemis scalent par zone
Les PV/dégâts des monstres montent selon la **zone**, pas de façon fixe. Exemple de départ :
- Forêt : ~50 PV
- Désert / Grotte : ~300 PV
- Pic gelé (end-game) : ~2000 PV

→ Le joueur progresse en **osant aller plus loin**, et farme la zone précédente pour s'équiper assez.

### b) Courbe d'XP exponentielle
Chaque niveau coûte nettement plus que le précédent. Exemple : niv.2 = 100 XP, niv.3 = 250, niv.10 = 5000.
→ Montée **rapide au début** (le joueur accroche), puis **lente** vers le haut niveau.

### c) Taux de drop serrés
La rareté se fabrique avec des pourcentages bas. Exemple par kill :
- Commun 60% · Magique 25% · Rare 12% · Légendaire 3%
- Les meilleurs items sont **exclusifs aux boss**, à taux faible → le farm de boss devient la boucle end-game.

---

## 10. Quêtes (nouveau système à ajouter)

Une quête = **un objectif chiffré + une récompense**. C'est ce qui donne une *raison* de tuer des monstres (anti-répétition) et c'est la **principale source d'XP du leveling**.

**3 types couvrent l'essentiel (et réutilisent l'existant) :**
- **Tuer** : "Tue 10 gobelins" → compteur de kills.
- **Collecter** : "Récupère 5 peaux de loup" → repose sur le loot existant.
- **Parler** : "Va voir le forgeron" → repose sur les PNJ existants.

**Système** : un compteur générique qui écoute les events de jeu (kill, ramassage, interaction PNJ) et coche quand l'objectif est atteint. Une quête doit être une **ligne de données** (id, type, objectif, quantité, récompenses XP/or/item), pas du code dédié.

**Interface (style WoW) :**
- PNJ avec une quête dispo → icône **`!`** au-dessus de la tête.
- Quête à rendre → icône **`?`**.
- **Suivi à l'écran** : `Gobelins : 3/10`.
- Validation au retour du PNJ → récompenses (XP + or + parfois item).

> **MVP** : code le **système** + **3-4 quêtes** de test. On en ajoutera autant que voulu ensuite, en données.

**Rôle dans la progression :**
- **Quêtes** = leveling rapide et guidé (le "tutoriel long").
- **Farm** = activité end-game, une fois les quêtes terminées.

---

## 11. La boucle de gameplay visée

```
zone dure → je galère → je farme la zone d'avant → je m'équipe / monte un peu
→ je reviens → je passe → nouvelle zone plus dure → ...
```

C'est le cœur du jeu : chaque palier de difficulté pousse à progresser avant de continuer.

---

## 12. Retravailler le contour de la map (forme de continent)

**Constat (d'après une capture du jeu)** : la map est actuellement un **disque quasi parfait** — un cercle de terre entouré d'eau, avec les biomes en **bandes horizontales** (neige en haut, herbe au milieu, désert en bas) et le **village pile au centre géométrique**. Ça donne un fort effet "rond / généré au rayon".

**Objectif** : un contour de **continent irrégulier** + des biomes moins stratifiés, **sans casser le contenu déjà placé** (village, créatures, maisons gardent leurs positions).

### ÉTAPE 0 — Diagnostic obligatoire AVANT toute modif
Identifier **comment la limite terre/eau est décidée** dans le code. Deux cas probables :

- **Cas A — génération par distance au centre** (très probable vu le cercle parfait) : quelque chose comme `si distance(tuile, centre) < rayon → terre, sinon eau`.
  → **C'est la cause du rond.** Solution : remplacer le **rayon fixe** par un **rayon qui varie selon l'angle** (modulé par du bruit / une fonction périodique). Le contour devient une côte irrégulière (caps, golfes) **sans toucher aux coordonnées du contenu placé** — seule l'eau autour change de forme.
  - Superposer une grande ondulation (forme générale) + une petite (côte découpée).
  - Régler pour garder ~la même surface de terre, afin de ne pas désaper le contenu existant.
- **Cas B — terre posée à la main, tuile par tuile** : alors on retouche les bords **manuellement**, zone par zone (golfes qui mordent la terre, caps qui s'étirent dans l'eau), sans rien régénérer.

> **Ne PAS régénérer toute la map à l'aveugle.** Le village, les créatures et les maisons sont placés dessus : il faut préserver leurs positions. On modifie **la forme du contour/de l'eau**, pas le contenu.

### Rendre le contour irrégulier
- **Grignoter la terre** : golfes/baies d'eau qui rentrent dans les terres, de tailles et profondeurs **différentes**.
- **Étirer la terre** : caps / presqu'îles / pointes dans l'eau (une grande, une petite, une fine et longue).
- **Quelques petites îles** détachées au large (1-3 tuiles) → effet archipel/continent.
- **Règle d'or** : **aucune portion de côte ne doit ressembler à celle d'à côté.** Cercle = partout pareil ; continent = partout différent. Éviter la symétrie (un côté large, un autre effilé).

### Casser les bandes de biomes
- Les biomes en **lignes horizontales droites** renforcent l'effet stratifié. Faire **mordre les biomes les uns dans les autres** de façon irrégulière : un doigt de neige qui descend, une langue de désert qui remonte. (La frontière herbe/neige actuelle est déjà bien ondulée → reproduire ce style sur les autres transitions.)

### Décentrer le village
- Le village est au **centre géométrique exact**, ce qui accentue la symétrie circulaire. Le **décaler légèrement** du centre casse déjà beaucoup l'impression de cercle parfait.

### Mise en œuvre (impératif)
- Faire le **diagnostic (Étape 0) en premier** et adapter la méthode au cas A ou B.
- Procéder **par petites touches** (une portion de côte / un biome à la fois), **pas** "rends la map irrégulière" en une passe.
- **Commit après chaque modif** pour pouvoir revenir en arrière si quelque chose casse.

---

## 13. À NE PAS faire maintenant (réservé à la Phase 4 — multijoueur)

Tout ce qui suit dépend du réseau et **ne doit pas être codé en avance** ni hardcodé en supposant un seul joueur :

- **Boss communautaires** : barre de PV partagée entre plusieurs joueurs, dégâts mis en commun, loot distribué au groupe. → Le boss peut être codé **en solo** (IA, patterns, zones rouges télégraphiées, table de loot), mais **laisse vides** les hooks "PV partagés / loot de groupe".
- **Synchronisation des joueurs**, chat temps réel, voir les autres sur la map.
- **Place de marché / troc entre joueurs** (prix dynamiques) → reste un marchand PNJ à prix fixes pour l'instant.
- **Quêtes de groupe / communautaires**.
- Pleine utilité du **Tank** (Provocation / menace pour forcer le boss à le cibler) → à ajouter en Phase 4.

> Principe : conçois le code de combat/loot pour que le **calcul d'autorité** (qui décide des dégâts, PV des monstres, drops) puisse passer **côté serveur** plus tard, sans tout réécrire.

---

## 14. Ordre d'implémentation suggéré (tout en solo)

> 🚩 **À FAIRE EN PREMIER (maintenant)** : retravailler le **contour de la map** pour qu'il ne soit plus rond (voir §12 — à la main, zone par zone, **sans régénérer** la map ni casser le contenu existant, commit entre chaque portion).

Ensuite :

1. **Système de combat unifié** : 2 barres (Vie/Mana), attaque de base + 1 sort par classe (mana + cooldown), régén mana.
2. **Hitbox melee** pour le Tank (réutilise celle du Guerrier, dégâts réduits) → les 4 classes deviennent jouables.
3. **Ciblage** (sélection d'ennemi + cadre de cible) et **HUD** (2 boutons, barres, joystick mobile, bouton inventaire).
4. **Courbe d'XP exponentielle** (le plus rapide à ressentir).
5. **Scaling des ennemis par zone**.
6. **Items** : 4 slots branchés sur le combat + système de rareté (base × multiplicateur) + **restriction de classe sur les armes**.
7. **Écran de personnage & inventaire** (paper doll + grille + panneau de stats **recalculées en direct** à l'équipement).
8. **Taux de drop serrés** + items légendaires exclusifs aux boss.
9. **Marchand PNJ** (acheter / vendre / potions).
10. **Système de quêtes** + 3-4 quêtes de test.
11. **Minimap** (2e caméra qui suit le joueur, haut-droite).
12. **Carte du monde** plein écran (touche `M` / bouton).
13. **Brouillard de guerre** persistant (grille d'exploration sauvegardée dans Supabase), lu par la minimap et la carte.
14. (Optionnel) **Cast bar** sur le Météore du Mage.

Valide chaque étape avant de passer à la suivante.
