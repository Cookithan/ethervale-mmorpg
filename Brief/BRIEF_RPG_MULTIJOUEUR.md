# Brief — Projet RPG Multijoueur 🎮

## Contexte

Je veux créer un **jeu RPG multijoueur en ligne** jouable sur **mobile et PC** (via navigateur, style PWA).

---

## Ce que je veux

### Gameplay
- **50 joueurs max** sur la même map (on commence à 10 pour le MVP)
- **Combat en temps réel** contre des monstres et des boss
- **Boss communautaires** à battre à plusieurs
- **Système d'XP** et de niveaux
- **Items** qui droppent sur les monstres et boss
- **Cosmétiques** pour personnaliser son perso

### Technique
- **Plateforme** : Mobile + PC (navigateur, PWA)
- **Vue** : 2D top-down (vue de dessus style Pokémon/Zelda)
- **Style graphique** : Pixel art (simple, assets gratuits disponibles sur itch.io)
- **Stack** :
  - **Phaser.js** pour le moteur de jeu (JavaScript)
  - **Colyseus** pour le multijoueur temps réel (Node.js, gratuit)
  - **Supabase** pour la persistance des données (compte, items, progression)
  - **Vercel** pour héberger le front
  - **Railway** pour héberger le serveur Colyseus
- **Budget** : 0€ (tout gratuit au début)

### Univers
- **Médiéval fantasy classique** : épées, mages, dragons
- **Multi-biomes** : forêt, désert, neige, grotte, etc.
- **3 classes de perso** au lancement : Guerrier, Mage, Tank

---

## MVP (ce qu'on fait en premier)

Pour commencer simplement :

1. **1 map** avec une zone de combat
2. **1 classe** (Guerrier de base)
3. **3 types de monstres** simples
4. **1 boss communautaire**
5. **Système XP + niveau** jusqu'à 10
6. **5 items** basiques (épée, armure, casque, bottes, accessoire)
7. **Chat** en temps réel dans la zone
8. **10 joueurs** simultanés max

On ajoute le reste (classes, biomes, cosmétiques) après validation du MVP.

---

## Ordre de développement suggéré

### Phase 1 — Fondations (solo d'abord)
- Carte 2D avec tilemaps Phaser
- Personnage qui se déplace (WASD ou click-to-move)
- Caméra qui suit le perso
- Système de collision

### Phase 2 — Combat solo
- Monstres avec IA basique (patrouille, attaque si proche)
- Combat click-to-move simple
- Système de PV, dégâts, mort
- XP + level up
- Drop d'items

### Phase 3 — Inventaire + Stats
- Inventaire (6-8 slots)
- Équipement sur le perso
- Stats (PV, Attaque, Défense)
- UI claire et simple

### Phase 4 — Multijoueur (Colyseus)
- Serveur Colyseus Node.js
- Synchronisation des positions des joueurs
- Chat temps réel
- Voir les autres joueurs sur la map
- Test à 5-10 joueurs

### Phase 5 — Combat coop
- Partager les dégâts sur un monstre
- Boss communautaire (barre de PV partagée)
- Récompenses distribuées à tout le groupe
- Loot aléatoire

### Phase 6 — Polish + contenu
- 2-3 biomes supplémentaires
- 3 classes de perso
- Cosmétiques
- Animations + sons
- UI propre

---

## Règles importantes

1. **Solo first** : on code toujours la partie solo AVANT d'ajouter le multi
2. **MVP strict** : pas de feature bonus tant que le MVP de chaque phase n'est pas validé
3. **Commit après chaque feature** qui marche
4. **Pas de 3D** : uniquement 2D top-down pixel art
5. **Pas de backend custom** : Supabase pour tout ce qui est persistance, Colyseus pour le temps réel

---

## Stack détaillée

### Frontend (jeu)
```
Phaser 3      → moteur de jeu 2D
JavaScript    → langage principal
Vite          → bundler (comme CookiMiner)
PWA           → installable sur mobile et PC
```

### Serveur multijoueur
```
Colyseus      → synchronisation temps réel
Node.js       → runtime
Railway       → hébergement gratuit
```

### Backend / Data
```
Supabase      → base de données (comptes, items, progression)
              → auth (connexion des joueurs)
              → realtime (chat, événements globaux)
```

### Assets
```
itch.io       → assets pixel art gratuits
OpenGameArt   → assets libres de droits
LPC Sprite    → sprites RPG open source
```

---

## Ressources suggérées pour démarrer

- **Tuto Phaser 3 officiel** : https://phaser.io/tutorials/making-your-first-phaser-3-game
- **Tuto Phaser + Colyseus** : https://docs.colyseus.io/getting-started/phaser3-client/
- **Assets RPG gratuits** : https://opengameart.org/art-search-advanced?keys=rpg+top+down
- **Tilesets RPG gratuits** : https://itch.io/game-assets/free/tag-rpg

---

## Prochaine action

Proposer un plan détaillé pour la **Phase 1** (fondations) avec :
- Code de base Phaser pour une map top-down
- Tilemap simple (forêt)
- Personnage qui se déplace au clavier
- Caméra qui suit

Attends ma validation avant de passer à la Phase 2.
