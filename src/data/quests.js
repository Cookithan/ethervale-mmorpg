/**
 * Quêtes (brief §10) — chaîne de début GUIDÉE, data-driven. Une quête = une ligne ci-dessous.
 * Types :
 *  - 'talk'    : parler à un PNJ (`target` = nom du PNJ). count implicite = 1.
 *  - 'kill'    : tuer `count` monstres d'un type (`target` = clé MONSTER_TYPES, ex. 'lizard').
 *  - 'collect' : avoir `count` d'un MATÉRIAU (`target` = id d'item, ex. 'mat_leather') ; consommé au rendu.
 * `giver` = nom du PNJ qui donne ET valide la quête. `next` = id de la quête suivante (chaîne).
 * `reward` = { xp, gold, item? (id d'objet ajouté au sac) }.
 */
export const QUESTS = {
  q_forge: {
    id: 'q_forge', giver: 'Mira', type: 'talk', target: 'Aldric le Forgeron',
    title: 'Premiers pas', desc: 'Va te présenter à Aldric le forgeron (maison de gauche). Il répare et améliore ton équipement.',
    reward: { xp: 30, gold: 40 }, next: 'q_lizards',
  },
  q_lizards: {
    id: 'q_lizards', giver: 'Mira', type: 'kill', target: 'lizard', targetName: 'Lézard', count: 6,
    title: 'Nuisibles', desc: 'Des lézards rôdent autour du village. Chasse-en 6 pour faire tes preuves.',
    reward: { xp: 70, gold: 50 }, next: 'q_leather',
  },
  q_leather: {
    id: 'q_leather', giver: 'Mira', type: 'collect', target: 'mat_leather', targetName: 'Cuir', count: 5,
    title: 'Artisanat', desc: 'Les bêtes lâchent du Cuir. Rapporte-en 5 à Mira (les matériaux s\'empilent à gauche du sac).',
    reward: { xp: 90, gold: 30, item: 'potion_big' }, next: 'q_explore',
  },
  q_explore: {
    id: 'q_explore', giver: 'Mira', type: 'talk', target: 'Edda',
    title: 'Les environs', desc: 'Edda se promène dans la prairie et connaît la région. Va lui parler.',
    reward: { xp: 50, gold: 70 }, next: 'q_spiders',
  },
  q_spiders: {
    id: 'q_spiders', giver: 'Edda', type: 'kill', target: 'spider', targetName: 'Araignée', count: 4,
    title: 'Le défi du désert', desc: 'Prouve ta valeur : franchis un gué vers le désert et terrasse 4 Araignées.',
    reward: { xp: 160, gold: 120, item: 'focus1' }, next: 'q_racoons',
  },
  q_racoons: {
    id: 'q_racoons', giver: 'Sylvane', type: 'kill', target: 'racoon', targetName: 'Raton', count: 5,
    title: 'Pillards des bois', desc: 'Des ratons saccagent les réserves en lisière de forêt. Chasse-en 5.',
    reward: { xp: 110, gold: 60, item: 'potion_big' }, next: 'q_lingots',
  },
  q_lingots: {
    id: 'q_lingots', giver: 'Mira', type: 'collect', target: 'mat_essence', targetName: 'Lingot de fer', count: 6,
    title: 'Le fer d\'Iroas', desc: 'Le forgeron manque de métal. Rapporte 6 Lingots de fer (lâchés par les bêtes des bois et du désert).',
    reward: { xp: 130, gold: 40, item: 'chainmail' }, next: 'q_north',
  },
  q_north: {
    id: 'q_north', giver: 'Mira', type: 'talk', target: 'Rurik',
    title: 'Vers le nord', desc: 'Rurik connaît les terres gelées mieux que quiconque. Va lui parler avant de monter au nord.',
    reward: { xp: 70, gold: 80 }, next: 'q_owls',
  },
  q_owls: {
    id: 'q_owls', giver: 'Rurik', type: 'kill', target: 'owl', targetName: 'Hibou', count: 5,
    title: 'Les yeux des neiges', desc: 'Les hiboux des neiges fondent sur les imprudents. Abats-en 5 pour ouvrir la voie.',
    reward: { xp: 150, gold: 90, item: 'focus2' }, next: 'q_bears',
  },
  q_bears: {
    id: 'q_bears', giver: 'Rurik', type: 'kill', target: 'bear', targetName: 'Ours', count: 4,
    title: 'Le poids du froid', desc: 'Les ours descendent des cimes, affamés. Terrasse-en 4 — ce ne sera pas une promenade.',
    reward: { xp: 200, gold: 130, item: 'ring_topaz' }, next: 'q_mushrooms',
  },
  q_mushrooms: {
    id: 'q_mushrooms', giver: 'Sylvane', type: 'kill', target: 'mushroom', targetName: 'Champignon', count: 6,
    title: 'Spores maléfiques', desc: 'Des champignons corrompus pullulent au cœur des bois. Purge-en 6.',
    reward: { xp: 180, gold: 110, item: 'plate' }, next: 'q_finale',
  },
  q_finale: {
    id: 'q_finale', giver: 'Tibert', type: 'talk', target: 'Mira',
    title: 'L\'espoir d\'Iroas', desc: 'Tu as repoussé les ténèbres de chaque contrée. Reviens au village porter la nouvelle à Mira.',
    reward: { xp: 300, gold: 250, item: 'potion_mana_big' }, next: 'q_boss_bamboo',
  },

  // ===== PALIER END-GAME : traquer les GARDIENS (boss solo). count 1 = un boss. Difficile. =====
  q_boss_bamboo: {
    id: 'q_boss_bamboo', giver: 'Sylvane', type: 'kill', target: 'giantbamboo', targetName: 'Colosse de Bambou', count: 1,
    title: 'Le Gardien des bois', desc: 'Au cœur de la forêt veille Sylvas, le Colosse de Bambou. Abats ce Gardien corrompu.',
    reward: { xp: 350, gold: 250, item: 'plate' }, next: 'q_boss_cyclop',
  },
  q_boss_cyclop: {
    id: 'q_boss_cyclop', giver: 'Edda', type: 'kill', target: 'democyclop', targetName: 'Cyclope des Sables', count: 1,
    title: 'L\'œil des dunes', desc: 'Gorehk, le Cyclope des Sables, écrase quiconque s\'aventure trop loin. Mets fin à son règne.',
    reward: { xp: 450, gold: 320, item: 'signet' }, next: 'q_boss_slime',
  },
  q_boss_slime: {
    id: 'q_boss_slime', giver: 'Rurik', type: 'kill', target: 'giantslime', targetName: 'Gelée Polaire', count: 1,
    title: 'Le froid qui dévore', desc: 'Givralk, la Gelée Polaire, engloutit tout sur le pic gelé. Dissous-la.',
    reward: { xp: 550, gold: 400, item: 'focus3' }, next: 'q_boss_kraken',
  },
  q_boss_kraken: {
    id: 'q_boss_kraken', giver: 'Bram', type: 'kill', target: 'squidred', targetName: 'Kraken des Récifs', count: 1,
    title: 'La terreur des récifs', desc: 'Vorakh, le Kraken, hante les rivages et tire des orbes mortelles. Approche-toi et terrasse-le.',
    reward: { xp: 700, gold: 550, item: 'focus_fire' }, next: 'q_boss_dargoth',
  },
  q_boss_dargoth: {
    id: 'q_boss_dargoth', giver: 'Oona', type: 'kill', target: 'giantflam', targetName: 'Dargoth', count: 1,
    title: 'Le Seigneur Maudit', desc: 'Il te faudra une barque pour franchir les flots jusqu\'à l\'île maudite. Là règne Dargoth. Affronte-le, et Iroas connaîtra l\'aube.',
    reward: { xp: 1200, gold: 1000, item: 'potion_mana_big' },
  },
}

export const FIRST_QUEST = 'q_forge'

/** count d'objectif (talk = 1 sinon q.count). */
export function questGoal(q) {
  return q.type === 'talk' ? 1 : q.count
}

/** Avancement courant d'une quête (collect = lu dans la poche de matériaux ; sinon compteur stocké). */
export function questProgress(player, q) {
  if (!q) return 0
  if (q.type === 'collect') return Math.min(q.count, player.resources?.[q.target] ?? 0)
  return Math.min(questGoal(q), player.quest?.progress ?? 0)
}

/** Vrai si l'objectif est atteint. */
export function questComplete(player, q) {
  return !!q && questProgress(player, q) >= questGoal(q)
}

/** id de la prochaine quête ACCEPTABLE (null si une quête est active ou la chaîne est finie). */
export function nextQuestId(player) {
  if (player.quest) return null
  const done = player.questsDone ?? []
  if (!done.length) return FIRST_QUEST
  const nx = QUESTS[done[done.length - 1]]?.next
  return nx && !done.includes(nx) ? nx : null
}
