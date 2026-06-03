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
    id: 'q_leather', giver: 'Tom', type: 'collect', target: 'mat_leather', targetName: 'Cuir', count: 5,
    title: 'Artisanat', desc: 'Les bêtes lâchent du Cuir. Rapporte-en 5 à Tom (les matériaux s\'empilent à gauche du sac).',
    reward: { xp: 90, gold: 30, item: 'potion_big' }, next: 'q_explore',
  },
  q_explore: {
    id: 'q_explore', giver: 'Tom', type: 'talk', target: 'Edda',
    title: 'Les environs', desc: 'Edda se promène dans la prairie et connaît la région. Va lui parler.',
    reward: { xp: 50, gold: 70 }, next: 'q_spiders',
  },
  q_spiders: {
    id: 'q_spiders', giver: 'Edda', type: 'kill', target: 'spider', targetName: 'Araignée', count: 4,
    title: 'Le défi du désert', desc: 'Prouve ta valeur : franchis un gué vers le désert et terrasse 4 Araignées.',
    reward: { xp: 160, gold: 120, item: 'sabre' },
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
