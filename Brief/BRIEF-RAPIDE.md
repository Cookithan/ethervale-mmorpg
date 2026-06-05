# Brief rapide — The Last Adventure (MMORPG Phaser)

> Lecture express pour reprendre le projet. Détails : `Brief/ETAT_DU_JEU.md`. **À faire en priorité : `Brief/TODO-prochaine-session.md`.**

## Le jeu
RPG 2D top-down pixel art, **Phaser 3.90 + Vite**, solo d'abord (multi = Phase 4). Repo public `Cookithan/ethervale-mmorpg`. Lancer : `npm run dev` (souvent déjà lancé). Sauvegarde = localStorage.

## Fichiers
- `src/scenes/GameScene.js` — le monde (map, village, combat, boss, ~5000 l.).
- `src/scenes/UIScene.js` — HUD/panneaux (sac, marchand, forge, fiche perso C, journal J).
- `src/scenes/BootScene.js` — préchargement + anims · `MenuScene` · `IntroScene` · `CharacterScene`.
- `src/entities/` — Player, Monster, Projectile, Drop.
- `src/data/` — items.js, classes.js, quests.js, save.js, sound.js.

## Déjà fait (ne pas refaire)
4 classes + 2 sorts + sort de set, combat/ciblage/HUD WoW, items 4 raretés + panoplies + items forgés + items d'élite, artisanat + stacking conso, 17 quêtes, mort douce, bateau, cap 50, température, jour/nuit (20 min), déco 4 biomes, boss + arènes + patterns, audio (musiques par zone + nuit + victoire + raid), minimap + carte M, dégâts flottants, attaques de mobs (charge/tir/zone), nouveaux mobs (raptor/chauve-souris), élites revues. **Village refondu en CERCLE** (8 bâtiments distincts, place + feu de camp animé avec recul, chemins en planches/anneau + soleil, enseignes de lieux, noms PNJ cachés, entrées préparées).

## Reste (ordre conseillé)
1. Les **6 points** de `Brief/TODO-prochaine-session.md` (bugs + équilibrage).
2. **Déco fine du village** (assets CC0 à fournir : Kenney Tiny Town conseillé).
3. **Intérieurs** (taverne/apothicaire… entrées déjà prêtes via `enter`/`buildingEntrances`).
4. Icônes distinctes des pièces de set ; île maudite ; brouillard de guerre ; plages/FX.
5. **Phase 4 = multijoueur** (Colyseus + Supabase) = gros morceau final.

## Règles de travail (l'utilisateur y tient)
- **UNE chose → valider au navigateur (reload complet F5) → commit FR + push.**
- **AskUserQuestion avant tout choix de design.** `node --check` après chaque édition.
- Commits : message FR + `Co-Authored-By: Claude...`. Pousser `git push origin main` après chaque commit.
- ⚠️ Ne jamais lire un .png comme texte (crash). Pour voir une image = outil Read.
- Assets bruts dans `Full_asset/` (gitignoré) ; seuls les sprites utilisés vont dans `public/assets/`. 3 packs : Ninja Adventure (CC0), Sprout Lands + Mystic Woods (non-commercial + crédit). Extraction de frames d'un tileset = script node jetable (zlib), à supprimer après.
