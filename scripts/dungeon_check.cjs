// JETABLE — valide les configs de donjon : rendu ASCII + connectivité (flood fill depuis l'entrée).
// Usage : node Brief/_dungeon_check.cjs   (configs DUPLIQUÉES ici depuis dungeonConfig — à resynchroniser si besoin)

const CONFIGS = {
  cave_a: {
    rooms: [
      { x: 18, y: 26, w: 10, h: 6 }, { x: 19, y: 17, w: 9, h: 6 }, { x: 7, y: 17, w: 8, h: 7 },
      { x: 3, y: 25, w: 7, h: 5 }, { x: 18, y: 8, w: 12, h: 7 }, { x: 3, y: 1, w: 14, h: 9 }, { x: 30, y: 9, w: 5, h: 5 },
    ],
    corridors: [
      { x: 21, y: 22, w: 4, h: 5 }, { x: 14, y: 19, w: 5, h: 3 }, { x: 7, y: 23, w: 3, h: 3 },
      { x: 21, y: 14, w: 4, h: 4 }, { x: 15, y: 9, w: 5, h: 3 },
    ],
    entry: { x: 22, y: 29 },
    boss: { x: 9, y: 5 }, chest: { x: 5, y: 3 },
    trash: [[23, 19], [10, 20], [5, 27], [21, 11], [26, 12], [32, 11]],
    torches: [[18, 26], [27, 26], [19, 17], [27, 17], [7, 17], [14, 23], [3, 25], [9, 29], [18, 8], [29, 8], [30, 9], [34, 13], [3, 1], [16, 1], [3, 9], [16, 7]],
    decor: [[24, 30], [6, 28], [11, 19], [25, 10], [32, 12], [7, 7], [13, 3]],
  },
  cave_b: {
    rooms: [
      { x: 2, y: 11, w: 7, h: 7 }, { x: 13, y: 9, w: 12, h: 9 }, { x: 12, y: 2, w: 7, h: 5 },
      { x: 22, y: 2, w: 7, h: 5 }, { x: 15, y: 21, w: 9, h: 5 }, { x: 28, y: 9, w: 12, h: 9 },
    ],
    corridors: [
      { x: 9, y: 12, w: 4, h: 4 }, { x: 14, y: 6, w: 3, h: 4 }, { x: 22, y: 6, w: 3, h: 4 },
      { x: 19, y: 3, w: 3, h: 3 }, { x: 18, y: 17, w: 3, h: 5 }, { x: 25, y: 12, w: 3, h: 3 },
    ],
    entry: { x: 5, y: 14 },
    boss: { x: 34, y: 13 }, chest: { x: 38, y: 15 },
    trash: [[15, 11], [21, 14], [15, 4], [25, 4], [17, 23], [21, 23]],
    torches: [[2, 11], [8, 17], [13, 9], [24, 9], [13, 17], [12, 2], [18, 6], [22, 2], [28, 6], [15, 21], [23, 25], [28, 9], [39, 17], [28, 17], [39, 9]],
    decor: [[5, 16], [16, 13], [14, 5], [26, 3], [19, 24], [31, 11], [36, 16]],
  },
}

for (const [id, cfg] of Object.entries(CONFIGS)) {
  const floor = new Set()
  const add = (r) => { for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) floor.add(x + ',' + y) }
  cfg.rooms.forEach(add); cfg.corridors.forEach(add)
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9
  for (const k of floor) { const [x, y] = k.split(',').map(Number); minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y) }
  // flood fill 4-dir depuis l'entrée
  const seen = new Set([cfg.entry.x + ',' + cfg.entry.y])
  const q = [[cfg.entry.x, cfg.entry.y]]
  while (q.length) {
    const [x, y] = q.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + ',' + (y + dy)
      if (floor.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]) }
    }
  }
  const orphans = [...floor].filter((k) => !seen.has(k))
  // marqueurs : tous sur du sol ?
  const bad = []
  const onFloor = (x, y, label) => { if (!floor.has(x + ',' + y)) bad.push(`${label} (${x},${y}) HORS-SOL`) }
  onFloor(cfg.entry.x, cfg.entry.y, 'entry')
  onFloor(cfg.entry.x, cfg.entry.y + 1, 'exit(sous entry)')
  onFloor(cfg.boss.x, cfg.boss.y, 'boss')
  onFloor(cfg.chest.x, cfg.chest.y, 'chest')
  cfg.trash.forEach(([x, y]) => onFloor(x, y, 'trash'))
  cfg.torches.forEach(([x, y]) => onFloor(x, y, 'torch'))
  cfg.decor.forEach(([x, y]) => onFloor(x, y, 'decor'))
  // rendu ASCII
  const mark = new Map()
  const put = (x, y, c) => mark.set(x + ',' + y, c)
  cfg.torches.forEach(([x, y]) => put(x, y, 't'))
  cfg.decor.forEach(([x, y]) => put(x, y, 'd'))
  cfg.trash.forEach(([x, y]) => put(x, y, 'm'))
  put(cfg.chest.x, cfg.chest.y, 'C')
  put(cfg.boss.x, cfg.boss.y, 'B')
  put(cfg.entry.x, cfg.entry.y, 'E')
  put(cfg.entry.x, cfg.entry.y + 1, 'X')
  let out = `\n=== ${id} === ${maxx - minx + 1}x${maxy - miny + 1} tuiles, ${floor.size} sols, orphelins=${orphans.length}\n`
  for (let y = miny - 1; y <= maxy + 1; y++) {
    let row = ''
    for (let x = minx - 1; x <= maxx + 1; x++) {
      const k = x + ',' + y
      if (mark.has(k) && floor.has(k)) row += mark.get(k)
      else if (floor.has(k)) row += '.'
      else { // mur si voisin (8-dir) d'un sol
        let wall = false
        for (let ddx = -1; ddx <= 1 && !wall; ddx++) for (let ddy = -1; ddy <= 1; ddy++) if (floor.has((x + ddx) + ',' + (y + ddy))) { wall = true; break }
        row += wall ? '#' : ' '
      }
    }
    out += row + '\n'
  }
  if (orphans.length) out += `❌ TUILES INACCESSIBLES : ${orphans.slice(0, 10).join(' ')}\n`
  if (bad.length) out += `❌ ${bad.join(' | ')}\n`
  if (!orphans.length && !bad.length) out += '✓ tout connecté, tous les marqueurs sur du sol\n'
  console.log(out)
}
