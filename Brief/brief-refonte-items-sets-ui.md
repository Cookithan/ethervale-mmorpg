# Brief — Refonte Items, Panoplies, Compétences & UI

**Jeu : The Last Adventure (monde d'Iroas)** — Phaser 3.90 + Vite. Repo : `Cookithan/ethervale-mmorpg`.

> Gros chantier de contenu solo. À intégrer dans le jeu **existant**, **sans casser** ce qui marche. Procéder **étape par étape** (voir l'ordre en fin de doc), valider au navigateur, **commit + push** entre chaque.

---

## Fichiers concernés (carte du code)
- `src/data/items.js` — `ITEMS`, `RARITY`, `SLOTS`, `SLOT_LABELS`, `SHOP_STOCK`, helpers.
- `src/data/classes.js` — `CLASSES` (spell / spell2), apparences.
- `src/entities/Player.js` — stats, `takeDamage`, logique des sorts, `recomputeStats`.
- `src/scenes/UIScene.js` — HUD, **boutons ATK/SORT (~ligne 281+)**, voile de cooldown.
- `src/scenes/CharacterScene.js` — fiche perso / paper-doll (touche C).
- `src/scenes/GameScene.js` — drops des boss (`hitMonster`), incantation existante.

## Assets à utiliser (à poser dans `Full_asset/`, créditer dans `CREDITS.md`)
- **Kyrise's Free 16x16 RPG Icon Pack** → icônes de base (potions, matériaux, armes/armures/anneaux communs→épiques).
- **Admurin's Armory (free)** → les **armes de set** (pièces spectaculaires) + armures de set si dispo.
- **RPG Ability Icons Collection (frosty_rabbid, ~100 icônes, 24×24)** → icônes de la **barre de compétences**.
- ⚠️ Vérifier la **licence** de chaque pack avant usage.

## Règles de travail (impératives)
1. **Une chose à la fois** → valider → commit → suivante. Jamais un gros bloc.
2. **Ne pas casser l'existant** : compléter, pas réécrire.
3. **Data-driven** : items/sets définis en données, pas en dur.
4. **NOMMER TOUS LES ITEMS** : aucun "Plastron"/"Anneau" générique — chaque item a un nom propre et thématique.
5. Chiffres = points de départ à équilibrer.

---

## PARTIE 1 — Rareté (relabel)

Garder les **clés internes** (`common/rare/epic/legendary`) pour ne rien casser ; changer seulement les **labels affichés** :
- `common` → **Commun** (gris)
- `rare` → **Rare** (bleu) *(était "Magique")*
- `epic` → **Épique** (violet) *(était "Rare")*
- `legendary` → **Légendaire** (or, boss only)

**Pièces de set** : marquage visuel **vert émeraude** (via le champ `set`) + nom de la panoplie + progression **"x/4"** dans l'infobulle.

## PARTIE 2 — Drops & sécurité anti-malchance

- **Loot normal des mobs** : table aléatoire **Commun 60% · Rare 28% · Épique 12%** (légendaires + sets PAS sur cette table).
- **Pièces de set** : drop **boss + coffres**, avec taux — boss de biome ~**30%**, coffres ~**10%**.
- **Légendaires** : ~**15-20%** sur les boss.
- **🛡️ Pity** : après **X kills** d'un boss sans sa pièce de set (ex. 5), drop **garanti** au kill suivant.

**Où droppe chaque pièce de set** (réparti sur la progression, panoplie complétable AVANT l'île maudite) :
- Boss **forêt** → **Armure** de set
- Boss **désert** → **Relique** de set
- Boss **neige** (Givralk) → **Anneau** de set
- Boss de raid **neige** (Raijin) → **Arme** de set *(la pièce Admurin spectaculaire)*
- **Dargoth** (île maudite, boss final) → un **Légendaire** + trophée de fin

## PARTIE 3 — Catalogue d'items (~57)

| Catégorie | Nombre | Détail |
|---|---|---|
| Armes | 20 | 5 par classe (Commun → Rare → Épique → Légendaire → Arme de set) |
| Armures | 10 | 6 universelles (dont 2 résist. froid/chaud) + 4 de set |
| **Reliques** | 8 | 4 universelles + 4 de set *(ex-slot "Focus")* |
| Anneaux | 8 | 4 universels + 4 de set |
| Consommables | 7 | potions soin/mana (P/G), potion feu, potion givre, feu de camp |
| Matériaux | 4 | cuir, os, lingot de fer, cristal |

**Armes par classe** : Guerrier = épées/lames (`fx-slash`) · Tank = masses/armes lourdes (`fx-circslash`) · Mage = baguettes/bâtons/sceptres · Soigneur = bâtons/sceptres bénis. Restriction par classe (déjà gérée par `canEquip`).

### ⚠️ Slot "Focus" → "Relique" (changement de fonction)
- **Renommer** le slot : label affiché `Relique` (garder la **clé interne `focus`** pour ne rien casser).
- **Supprimer la réduction de cooldown** (`spellCd`). Nouvelles fonctions, une relique donne **l'une OU l'autre** :
  - **+ durée** de l'effet du sort (`spellDuration`) — bouclier/zones/contrôle/clones durent plus longtemps.
  - **+ dégâts / effet** du sort (`spellPower`).
- Supprimer le doublon actuel `focus2`/`focus_plant`.

## PARTIE 4 — Les 4 panoplies (4 pièces, liées à la classe)

Une panoplie = **Arme + Armure + Relique + Anneau** (vert émeraude).
**2 pièces** → bonus de stat · **4 pièces (complète)** → débloque la **compétence de set** (touche 3 ; perdue si on retire une pièce).

| Classe | Panoplie | Pièces | Bonus 2 pièces | Compétence (4 pièces) |
|---|---|---|---|---|
| Guerrier | **Dernier Chevalier** | Lame du Dernier Chevalier · Cuirasse du Serment · Étendard du Chevalier · Anneau du Serment | + Attaque | **Cri intimidant** |
| Tank | **Cœur en Pierre** | Masse du Cœur en Pierre · Carapace de Granit · Pierre du Gardien · Anneau Tellurique | + PV / Défense | **Onde de choc** |
| Mage | **Magie Ancienne** | Sceptre de la Magie Ancienne · Robe Runique · Tome Ancien · Anneau Arcanique | + Mana / effet sort | **Image miroir** |
| Soigneur | **Vie Sacrée** | Sceptre de la Vie Sacrée · Robe Sacrée · Reliquaire Béni · Anneau Béni | + Mana / régén | **Résurrection** |

## PARTIE 5 — Compétences de set (touche 3, débloquées par panoplie complète)

- **Cri intimidant** (Guerrier) : les ennemis proches sont **effrayés et fuient** quelques sec.
- **Onde de choc** (Tank) : frappe au sol → ennemis autour **étourdis (stun)** + forcés de te cibler.
- **Image miroir** (Mage) : invoque des **clones** qui tirent et détournent les coups. *(Cooldown long, durée courte — à brider à l'équilibrage, c'est l'ultime "cheaté".)*
- **Résurrection** (Soigneur) : ramène un **allié mort** (multi) ; en solo → **auto-résurrection une fois**.
- Communes : **touche 3**, **cooldown long** (~30-45 s), plus fortes que les sorts 1 et 2, **désactivées** dès qu'il manque une pièce.

## PARTIE 6 — Modifs de sorts existants (`classes.js` + `Player.js`)

**Mage** (refonte du kit) :
- Sort 1 = **Blizzard** (givre, zone + ralentit) — *remplace le Météore*.
- Sort 2 (niv 10) = **Pyroblast** (feu, **mono-cible** gros dégât).
- Sort 3 (set) = **Image miroir** *(déplacée depuis l'ancien sort 2)*.
- **Vie de base : 60** (au lieu de 70).
- **Tous ses sorts sont incantés et annulables si touché** (étendre la mécanique `castInterrupted` déjà existante sur le Météore à tous les sorts du mage).
- ⚠️ Garder son **tir de base fiable/spammable** pour se défendre de près.

**Soigneur** :
- Sort 1 = **Mot de pouvoir : Bouclier** — pose un **bouclier qui absorbe les dégâts** (soi/allié) **+ petit soin** au lancement (~15-20% PV). *Remplace le Soin direct.*
- Sort 2 (niv 10) = **Sanctuaire** *(inchangé)*.
- Sort 3 (set) = **Résurrection**.
- **+ dégâts d'attaque de base** (viable en solo).

## PARTIE 7 — Barre de compétences (refonte visuelle, façon WoW)

État actuel (`UIScene.js` ~ligne 281) : boutons = **rectangles avec texte "ATK"/"SORT"**. La logique (cooldown, mana, clic) marche → **ne pas la refaire**, juste **habiller**.
- **Icônes à la place du texte** (pack RPG Ability Icons) : chaque compétence montre son **dessin**.
- **4 cases** : Attaque de base · Sort 1 · Sort 2 · **Sort 3 (set)**.
- Cases carrées, **bordure dorée**, icône qui remplit la case ; le voile de cooldown existant passe par-dessus.
- **Raccourci clavier** en petit dans un coin de la case (Espace/F, 1, 2, 3).
- **Chiffres de cooldown** au centre quand ça recharge (en plus du voile).
- **Grisé + cadenas** si non débloqué (déjà fait pour le sort 2 niv 10 → faire pareil pour le sort 3 de set).
- **Flash** de l'icône au lancement (retour visuel).
- La case du **sort de set** a une **bordure vert émeraude** (cohérent avec les pièces de set).

## PARTIE 8 — Onglet perso (fiche personnage)

- **Plus accessible** : ajouter un **bouton permanent sur le HUD** (icône sac/perso), cliquable **souris + tactile**. Garder C en raccourci.
- **Plus beau** (paper-doll retravaillé) : perso au centre bien mis en valeur, slots clairs autour, **pièces de set en vert émeraude** avec progression **"x/4"** et bonus de panoplie listés (actifs en surbrillance, suivants grisés), panneau de stats lisible. Style cohérent avec l'ambiance du jeu.

## PARTIE 9 — À surveiller (équilibrage, en test)
- **Mage** : fragile (60 PV) + sorts incantés → puissant mais risqué ; vérifier qu'il reste jouable (tir de base fiable).
- **Soigneur** : assez de mordant pour farmer seul, sans redevenir une fontaine de soin.
- **Image miroir** (set Mage) : brider durée/cooldown pour ne pas être cassé.

---

## AVANCEMENT (2026-06-04)
- ✅ **1. Rareté** : relabel Rare/Épique + helpers `itemColor`/`itemTint` (champ `set` → émeraude). Commit `3566694`.
- ✅ **2. Slot Relique** : label « Relique » (clé interne `focus`), cooldown retiré, `spellPower`/`spellDuration` (+ `spellDurationMul` Player). Commit `4d19fe4`.
- ✅ **3. Assets** : Kyrise (CC BY 4.0), RPG Ability Icons (CC0), Admurin's Armory (free) dans `Full_Asset/`, crédités. Commits `184d32a`/`cbff2de`.
- ✅ **4. Catalogue (icônes)** : armures (`d4b2ce9`), anneaux (`b3a2a55`), reliques=cristaux (`265c727`), potions/matériaux (`3b7d18f`), 4 légendaires Admurin (`3c22ba6`), **TOUTES les armes Admurin redressées (`5aa3d92`)**. Outil de découpe maison (recréer `_crop.mjs`) = **trim au contenu + rotation -45° (les armes Admurin pointent en haut-gauche → verticales) + resize ~18px**. `swingTex` abandonné (la vraie arme swingue). Helper `weaponScale(key,targetPx)` = taille à l'écran constante. **Arme tenue en main = toggle touche X** (`updateHeldWeapon`, offsets/rotation par direction, cachée pendant l'attaque). `heldScale` sur le grimoire (0.7). Flair de rareté à l'attaque + aura permanente en main (épique violet/légendaire or). Migration `refreshItemDef` (applySave) rafraîchit les icônes des vieilles saves. ⚠️ Reste mineur : greatblade/hache un peu fines (repiocher une cellule Admurin si besoin).
- ✅ **6. Panoplies** (`f8f5219`) : `SETS` (4 sets de classe) + 16 pièces (`set:` émeraude) + `setStatus()` (bonus 2/4) appliqué dans `recomputeStats` (`p.activeSet` si 4/4). Exclues du marchand/butin normal. Infobulle nom panoplie + bonus + « n/4 ». Icônes : armes émeraude Admurin (set_sword/glaive/scepter), relique=rel_emerald, armure/anneau réutilisés (teintés set). **DEBUG touche G** = ajoute la panoplie de classe (À RETIRER à l'étape 8).
- ✅ **5. Sorts Mage + Soigneur** : **Mage `625621b`** — PV 60, Météore→**Blizzard** (givre+ralentit, FX `Elemental/Ice`+`Magic/Circle`, `Monster.applySlow`), mirror→**Pyroblast** (mono-cible feu), tous incantés. **Soigneur `36575fb`** — attaque 11→15 (+rangedDmgMul), Soin→**Mot de pouvoir : Bouclier** (absorption `Player.shieldHp` dans `takeDamage` + bulle `fx_shield` + petit soin), Sanctuaire inchangé.
- ✅ **7. Compétences de set** (`4b392d5`) : **touche 3 = `castSpell3`** (si `p.activeSet`, cd ~35 s, coût 30). Les 4 marchent : Mage **Image miroir** ; Tank **Onde de choc** (RockSpike+stun+provoque, `Monster.stun`) ; Guerrier **Cri intimidant** (Spark+fuite, `Monster.fear`) ; Soigneur **Résurrection** (auto-revive solo via `p.reviveCharge`+`handleDeath`).
- 💡 **FX en réserve** (pack Ninja `FX/Elemental`) : Thunder (foudre), Water/WaterPillar (geyser), Plant/PlantSpike (racines), RockSpike, IceSpike → idées de compétences/boss futures.
- ✅ **8. Drops de set + pity** (`0f73204`) : `trySetPieceDrop(mon)` sur kill de boss — forêt→armure, désert→relique, neige→anneau, raid neige→arme (panoplie de la classe). 30 % + pity garanti à 5 (`p.setPity` persisté). Pas de doublon. **Debug G retiré.**
- ⏭️ Reste : **9** (barre de compétences WoW — 4 cases ATK/sort1/sort2/sort3-set, icônes RPG Ability, cadenas, cooldown, bordure émeraude set), **10** (onglet perso paper-doll : bouton HUD + pièces de set vertes x/4 + bonus).

### 🗺️ Cartographie Admurin (`Full_Asset/32x32_PixelWeapons_Free.png`, grille 14×14 de 32px, col,row à partir de 0)
Outil de découpe : recréer un script `_crop.mjs` (zlib, RGBA8) — voir historique. **Colonnes** (moitié gauche) : col0=épées, col1=lances/bâtons, col2=masses/sceptres, col3=arcs, col4/5=boucliers, col6=marteaux/divers. **Lignes** : 0-4 = paliers métal (bronze→acier→sombre), **ligne 5 = ORNÉ OR (légendaires)**, ligne 6 = orné turquoise. **Lignes 7-11 = PANOPLIES ÉLÉMENTAIRES complètes** (givre / **VERT ÉMERAUDE [row 8] = armes de SET toutes prêtes** / feu / clair / cyan), ligne 12 = bois/sombre. Moitié haute-droite (cols 7-13, rows 0-6) = pièces d'**armure** (casque/plastron/jambes/bottes). **Légendaires déjà extraits** : (0,5) épée or, (1,5) masse or, (2,5) sceptre or, (2,6) sceptre cosmique bleu. **Pour l'étape 6, armes de set = ligne 8 (émeraude)** : (0,8) épée, (1,8) lance/bâton, (2,8) sceptre, etc.

## Ordre d'implémentation (étape par étape, commit entre chaque)
1. **Rareté** : relabel des affichages (Commun/Rare/Épique/Légendaire) + marquage set vert émeraude.
2. **Slot Relique** : renommer `focus`→Relique, retirer le cooldown, ajouter `spellDuration` / `spellPower`.
3. **Assets** : poser Kyrise + Admurin + RPG Ability Icons, créditer.
4. **Catalogue d'items** : refaire `ITEMS` (tous nommés, icônes assignées), 5 armes/classe + universels.
5. **Modifs de sorts** : Mage (Blizzard / Pyroblast / 60 PV / incantations) + Soigneur (Bouclier+soin / +dégâts).
6. **Système de panoplies** : champ `set`, table `SETS`, détection "set complet" dans `recomputeStats`, bonus 2/4 pièces.
7. **Compétences de set** : ajouter le **sort 3** (touche 3) débloqué par panoplie complète (Cri intimidant / Onde de choc / Image miroir / Résurrection).
8. **Drops** : pièces de set par boss (mapping ci-dessus) + pity + Dargoth = légendaire.
9. **Barre de compétences** : icônes + style WoW (bordures, cadenas, chiffres de cooldown, bordure émeraude set).
10. **Onglet perso** : bouton HUD permanent + refonte visuelle du paper-doll.

Valider chaque étape au navigateur avant la suivante.
