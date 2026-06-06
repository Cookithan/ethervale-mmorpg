# ⚠️ HANDOFF — reprise des intérieurs (2026-06-07) — LIRE EN PREMIER

> Un nouveau Claude reprend ce chantier. L'utilisateur n'est PAS satisfait du rendu actuel (taverne/apothicaire) : « rien ne va ». Plusieurs itérations de placement de tuiles **à l'aveugle** = encore amateur (chevauchements, pièces mal rendues, teintes off).

## VISION VALIDÉE par l'utilisateur (via questions — à RESPECTER absolument)
- **Murs** : PIERRE CHAUDE brun-gris (façon réf). Le bleu froid actuel = REJETÉ.
- **Agencement** : MODÉRÉ & ÉPURÉ (~4 tables aérées), surtout PAS bondé.
- **Sol** : BOIS FONCÉ chaleureux.
- **Lumière** : CHAUDE & TAMISÉE (cosy).
- **Clients (PNJ assis)** : AUCUN (juste le PNJ de service derrière son comptoir).
- **Feu** : AUCUN feu visible (ni cheminée ni feu de camp) → **LANTERNES** pour la lumière.
- **Objets sur tables** (chopes/plats/bougies) : OUI (fait vivant).
- **UI** : refaire TOUS les boutons/menus avec le **Theme Wood** Ninja (helpers déjà prêts).
- Réf = pack CraftPix « Tavern Top-Down » (PAYANT, l'utilisateur NE PAIE PAS) → on APPROCHE avec du gratuit.

## ASSETS DISPO (gratuits, déjà copiés + chargés dans BootScene)
- **Penzilla « Top-Down Retro Interior »** : `public/assets/tiles/penz_floors.png` (sols+murs, 18 col), `penz_furn.png` (mobilier, 13 col), `penz_doors.png` (portes/fenêtres/escaliers, 18 col), `penz_items.png` (objets, 8 col). Tuiles 16×16.
- **★ CATALOGUE EXACT des pièces (rects col/row/w/h) = `Brief/penzilla-catalog.md`** ← LE LIRE (évite de deviner : les découpes ratées venaient de là). Frame = row*cols + col.
- **Mystic Woods** : `mw_floor`, `mw_walls` (pierre BLEUE, frames pleins 33/34), `mw_door`, `mw_carpet`.
- **Ninja Theme Wood (UI, CC0)** : `public/assets/ui/` (ui_panel, ui_bg, btn_normal/hover/pressed, btn_yes/no…). Helper prêt = **`src/ui/wood.js`** (`woodPanel`, `woodButton`, nine-slice). Déjà branché sur l'invite Oui/Non.
- **Outil** : `node scripts/penz_crop.cjs <png> <sy> <sh> <scale> <out.png>` = recadre+zoome une planche avec GRILLE de tuiles cyan → Read l'image pour lire les rects. Indispensable.
- Cainos « Pixel Art Top Down - Basic v1.2.3 » aussi dans Full_Asset (murs/structures, pas exploité).

## OÙ EST LE CODE (`src/scenes/GameScene.js`)
- Intérieur HORS-MAP (≈ -3200,-3200) : `interiorConfig`/`enterInterior`/`buildInterior`/`destroyInterior`/`exitInterior`/`updateInterior`/`interiorInteract`. `this.inInterior` gate l'update.
- `buildInterior(id)` : helpers `pp(sc,sr,w,h,dx,dy,depth)` (penz_furn), `pd(...)` (penz_doors), `si(frame,dx,dy,depth)` (penz_items), `solid(dx,dy,wpx,hpx)` → `furnSolids` → colliders via `wall()`. Fond sombre plein écran (scrollFactor 0). Branches `if (id==='tavern') {...} else {apothicaire}`. Salle 15×12 ; porte = trou au centre du mur bas.
- Entrée = invite **Oui/Non** bois (`showEnterPrompt`/`hideEnterPrompt`). Sortie AUTO en marchant sur la porte. Entrables = `buildingEntrances` (tavern/apothecary seulement ; inn/bank PAS branchés). PNJ d'entrée rendus traversables (`spawnVillagers`).

## CE QUI MARCHE
- Entrer/circuler/sortir (plus de carte noire). Spawn validé (save hors-map → respawn village).

## CE QUI NE VA PAS / À REFAIRE
- Rendu des 2 salles encore amateur malgré le catalogue. ⚠️ **Vrai problème : placement à l'aveugle (Claude ne voit pas le jeu rendu).** RECO : avancer par **petits incréments validés par screenshot** (sol → murs → 1 meuble → …), pas tout d'un coup.
- TODO : **Auberge** (lits + comptoir) et **Banque** (coffre-fort) non faites + non branchées entrables. UI bois à étendre (menu/sélection/création/marchand).

## ÉTAT GIT
- **TOUT NON COMMITÉ** (gros lot : intérieurs + UI bois + assets `penz_*`/`ui_*`/`mw_*` + fix spawn + `scripts/penz_crop.cjs`). Voir `git status`/`git diff`.

---

# Brief — Refonte des intérieurs du village (asset Penzilla)

**Jeu : The Last Adventure** — Phaser 3.90. Repo : `Cookithan/ethervale-mmorpg`.

> Les 4 intérieurs (Taverne, Apothicaire, Auberge, Banque) sont des **scènes séparées** déjà fonctionnelles, mais le design est à reprendre. Un premier jet a été fait : **murs/sol/bar corrects**, mais **4 défauts majeurs à corriger** (voir section CORRECTIONS). Objectif : pièces denses, vivantes et **chacune identifiable**, comme l'image de référence Penzilla.

## Asset
- **Penzilla — Top-Down Retro Interior** (https://penzilla.itch.io/top-down-retro-interior). Vérifier la licence + ajouter à `CREDITS.md`.
- Contient : sols, murs épais, **bar/comptoir, bouteilles, tables, bancs, chaises, tonneaux, étagères, lits, tapis, cheminée murale, plantes, coffres, chaudron, fioles**.

## Contexte code
- PNJ avec champ `enter` : `tavern` (Brewen) · `apothecary` (Ylva) · `inn` (Mira) · `bank` (Cornélius).
- Scène intérieure déjà gérée (téléportation in/out fonctionne). On retouche **uniquement le décor** de chaque pièce.

---

## ⚠️ CORRECTIONS PRIORITAIRES (les 4 défauts du premier jet)

1. **Pièces trop grandes et vides → densifier.** Il y a un grand vide au centre. Soit **réduire la taille** de la pièce, soit **ajouter beaucoup plus de mobilier**. Cible : une salle **remplie et vivante** comme l'image de réf (tables, bancs, déco partout contre les murs), avec juste un couloir de circulation libre — pas un hangar avec 4 meubles.

2. **Les pièces se ressemblent toutes → différencier.** Actuellement Taverne et Apothicaire ont le même comptoir + la même étagère. **Chaque pièce doit être reconnaissable sans son titre** :
   - Taverne = bar + bouteilles + tables/bancs + tonneaux.
   - Apothicaire = **étagères de fioles colorées + chaudron + herbes** (PAS le bar de la taverne).
   - Auberge = **lits** + comptoir d'accueil.
   - Banque = **coffre-fort massif** + grand comptoir.
   Ne pas recycler le même comptoir partout.

3. **Enlever le feu de camp du centre.** Un feu de camp 🔥 au milieu d'une pièce = incohérent (ça se met dehors). Le remplacer par une **cheminée murale** (contre un mur), avec animation de flammes. Une seule source de feu par pièce (pas de doublon avec le poêle).

4. **Regrouper chaises + tables.** Les chaises isolées contre les murs, ça fait abandonné. Chaque table a **ses chaises/bancs autour**. C'est un ensemble.

---

## Principes communs (à appliquer aux 4 pièces)
- **Sol** bois ou pierre (pas d'herbe), remplit toute la pièce.
- **Murs épais** avec le haut visible (perspective) + bords assombris — c'est ce qui donne le rendu "intérieur" de l'image de réf.
- **Meubles contre les murs, circulation libre au centre** — mais pièce **dense**.
- **PNJ derrière son comptoir/poste**, jamais au centre.
- **Lumière d'ambiance** : chaude orangée (Taverne, Auberge), verdâtre/violacée (Apothicaire), neutre/froide (Banque).
- **Collisions** sur tous les meubles ; **porte de sortie** repérable (tapis devant).
- **Tester entrer → circuler → ressortir** à chaque pièce.

---

## Pièce 1 — La Taverne (Brewen) — FAIRE EN PREMIER
- **Bar en bois** au fond, **étagère de bouteilles colorées** au-dessus, Brewen derrière.
- **4-5 tables avec bancs/chaises autour** (regroupés !), réparties dans la salle.
- **Tonneaux** dans les coins, **cheminée murale** allumée (pas de feu de camp central), tapis, lanternes suspendues.
- Sol pierre/bois, lumière chaude orangée. Pièce-modèle : soigne-la, les autres en découlent.

## Pièce 2 — L'Apothicaire (Ylva)
- **Comptoir** avec Ylva derrière (différent du bar de la taverne).
- **Étagères murales pleines de fioles/potions colorées** (signature), **chaudron qui mijote** (vapeur animée), **herbes suspendues**, sacs/paniers au sol.
- Lumière **verdâtre/violacée**. La pièce doit crier "apothicaire" au premier regard.

## Pièce 3 — L'Auberge (Mira)
- **Comptoir d'accueil** près de l'entrée, Mira derrière.
- **2-3 lits** alignés contre un mur (signature), **cheminée murale**, table + chaises regroupées, plantes, tapis.
- Lumière chaude douce, ambiance repos.

## Pièce 4 — La Banque (Cornélius)
- **Grand comptoir** qui sépare l'espace, Cornélius derrière.
- **Coffre-fort massif** bien visible (signature), colonnes/pierre, piles de pièces/registres sur le comptoir, tapis rouge central.
- Lumière **neutre/froide** — sérieux, pas cosy.

---

## Ordre
1. **Taverne** (applique les 4 corrections + cale le système : densité, murs, lumière, cheminée murale, tables+chaises groupées, collisions). Valide à fond.
2. **Apothicaire** · 3. **Auberge** · 4. **Banque** → même système, identité + couleurs différentes, chacune reconnaissable.

> Règle d'or : si on cache le titre de la pièce, on doit savoir où on est rien qu'au mobilier.
