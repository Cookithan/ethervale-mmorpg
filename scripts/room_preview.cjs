// Compositeur d'INTERIEUR hors-jeu : rend une salle (sol + murs + mobilier Penzilla)
// dans un PNG zoome, pour VOIR le placement sans lancer le jeu (anti "placement a l'aveugle").
// Reproduit la semantique de GameScene.buildInterior : pp()=furn origine(0,0), si()=item origine(0.5),
// pd()=doors origine(0,0), tint = MULTIPLY. TILE=16, salle 15x12.
// Usage : node scripts/room_preview.cjs <design> <out.png> [scale]
//   <design> = nom d'une fonction de design ci-dessous (ex: tavern_current, tavern_v1)
const fs = require('fs')
const zlib = require('zlib')

// --- decode PNG -> {W,H,ch,bpp,stride,px} (filtres + Paeth, comme penz_crop.cjs) ---
function decode(p) {
  const b = fs.readFileSync(p)
  let o = 8, W, H, ct, bd
  const idat = []
  while (o < b.length) {
    const len = b.readUInt32BE(o)
    const t = b.toString('ascii', o + 4, o + 8)
    const d = b.slice(o + 8, o + 8 + len)
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9] }
    else if (t === 'IDAT') idat.push(d)
    else if (t === 'IEND') break
    o += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4
  const bpp = ch * (bd / 8), stride = W * bpp
  const px = Buffer.alloc(H * stride)
  const pth = (a, b2, c) => { const q = a + b2 - c, A = Math.abs(q - a), B = Math.abs(q - b2), C = Math.abs(q - c); return A <= B && A <= C ? a : B <= C ? b2 : c }
  let pos = 0
  for (let y = 0; y < H; y++) {
    const f = raw[pos++]
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++]
      const L = x >= bpp ? px[y * stride + x - bpp] : 0
      const U = y > 0 ? px[(y - 1) * stride + x] : 0
      const UL = (x >= bpp && y > 0) ? px[(y - 1) * stride + x - bpp] : 0
      let r
      if (f === 0) r = v; else if (f === 1) r = v + L; else if (f === 2) r = v + U; else if (f === 3) r = v + ((L + U) >> 1); else r = v + pth(L, U, UL)
      px[y * stride + x] = r & 255
    }
  }
  return { W, H, ch, bpp, stride, px }
}
// pixel RGBA d'une source (gere ch=3/4/1)
function sample(img, x, y) {
  if (x < 0 || y < 0 || x >= img.W || y >= img.H) return [0, 0, 0, 0]
  const i = y * img.stride + x * img.bpp
  if (img.ch === 4) return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]
  if (img.ch === 3) return [img.px[i], img.px[i + 1], img.px[i + 2], 255]
  return [img.px[i], img.px[i], img.px[i], 255]
}

// --- encode PNG (RGBA) ---
const CT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]) }
function encode(W, H, rgba) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6
  const raw = Buffer.alloc(H * (1 + W * 4)); let p = 0
  for (let y = 0; y < H; y++) { raw[p++] = 0; for (let x = 0; x < W * 4; x++) raw[p++] = rgba[y * W * 4 + x] }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// --- sheets ---
const A = 'public/assets/tiles/'
const sheets = {
  penz_floors: decode(A + 'penz_floors.png'),
  penz_furn: decode(A + 'penz_furn.png'),
  penz_doors: decode(A + 'penz_doors.png'),
  penz_items: decode(A + 'penz_items.png'),
  mw_walls: decode(A + 'mw_walls.png'),
  mw_door: decode(A + 'mw_door.png'),
}
const cols = { penz_floors: sheets.penz_floors.W / 16, penz_furn: 13, penz_doors: 18, penz_items: 8, mw_walls: sheets.mw_walls.W / 16 }
console.error('DIMS', Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, `${v.W}x${v.H} (${v.W / 16}col x ${v.H / 16}row)`])))

// --- canvas natif (taille configurable via env COLS/ROWS) ---
const TILE = 16, COLS = (process.env.COLS ? +process.env.COLS : 15), ROWS = (process.env.ROWS ? +process.env.ROWS : 12), W = COLS * TILE, H = ROWS * TILE
const cv = new Float32Array(W * H * 4) // premultiplie ? non : on stocke RGBA 0..255, alpha gere a la compo
// fond sombre 0x0a0810 plein
for (let i = 0; i < W * H; i++) { cv[i * 4] = 0x0a; cv[i * 4 + 1] = 0x08; cv[i * 4 + 2] = 0x10; cv[i * 4 + 3] = 255 }

function tintMul(rgb, tint) { // tint=0xRRGGBB multiply
  if (tint == null) return rgb
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255
  return [rgb[0] * tr / 255, rgb[1] * tg / 255, rgb[2] * tb / 255]
}
// blit une sous-image (sx,sy,sw,sh) de `img` vers le canvas, coin haut-gauche (dx,dy) px, scale entier-ish, tint mult, alpha global
function blit(img, sx, sy, sw, sh, dx, dy, scale, tint, ga, flip) {
  scale = scale || 1; ga = ga == null ? 1 : ga
  dx = Math.round(dx); dy = Math.round(dy) // IMPERATIF : coords pixel ENTIERES (sinon py fractionnaire -> index plat fausse la colonne)
  if (process.env.DBG2) console.error('blit dest col', dx / 16, 'dx', dx)
  const ow = Math.round(sw * scale), oh = Math.round(sh * scale)
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const srcX = flip ? sx + (sw - 1 - Math.floor(x / scale)) : sx + Math.floor(x / scale) // miroir horizontal (chaises)
    const s = sample(img, srcX, sy + Math.floor(y / scale))
    let a = s[3] / 255 * ga
    if (a <= 0) continue
    const px = dx + x, py = dy + y
    if (process.env.DBG3 && x === 0 && y === 0) console.error('WRITE px', px, 'py', py, 'W', W, 'cvlen', cv.length)
    if (px < 0 || py < 0 || px >= W || py >= H) continue
    const c = tintMul([s[0], s[1], s[2]], tint)
    const j = (py * W + px) * 4
    cv[j] = c[0] * a + cv[j] * (1 - a)
    cv[j + 1] = c[1] * a + cv[j + 1] * (1 - a)
    cv[j + 2] = c[2] * a + cv[j + 2] * (1 - a)
    cv[j + 3] = 255
  }
}
// ADD (lumiere) : disque radial doux centre (cx,cy) rayon R, couleur tint, intensite k
function glow(cx, cy, R, tint, k) {
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255
  for (let y = Math.max(0, cy - R); y < Math.min(H, cy + R); y++) for (let x = Math.max(0, cx - R); x < Math.min(W, cx + R); x++) {
    const d = Math.hypot(x - cx, y - cy); if (d > R) continue
    const f = (1 - d / R) * k
    const j = (y * W + x) * 4
    cv[j] = Math.min(255, cv[j] + tr * f); cv[j + 1] = Math.min(255, cv[j + 1] + tg * f); cv[j + 2] = Math.min(255, cv[j + 2] + tb * f)
  }
}

// ====== DSL de placement (unites TILE, fractions OK) ======
const ops = {
  floor(frame, tint) { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) blit(sheets.penz_floors, (frame % cols.penz_floors) * 16, ((frame / cols.penz_floors) | 0) * 16, 16, 16, c * 16, r * 16, 1, tint) },
  wallRing(tint, g0, g1) { // 2 rangees haut + cotes + bas (trou g0,g1)
    const wt = (cx, cy) => { const f = (cx + cy) % 2 ? 33 : 34; blit(sheets.mw_walls, (f % cols.mw_walls) * 16, ((f / cols.mw_walls) | 0) * 16, 16, 16, cx * 16, cy * 16, 1, tint) }
    for (let c = 0; c < COLS; c++) { wt(c, 0); wt(c, 1) }
    for (let r = 2; r < ROWS; r++) { wt(0, r); wt(COLS - 1, r) }
    for (let c = 1; c < COLS - 1; c++) if (c !== g0 && c !== g1) wt(c, ROWS - 1)
  },
  // pp : meuble penz_furn, origine HAUT-GAUCHE, (sc,sr,w,h) tuiles -> pose en (gx,gy) tuiles
  furn(sheet, sc, sr, w, h, gx, gy, tint, flip) { if (process.env.DBG) console.error('furn', sheet, 'col', sc, 'row', sr, w + 'x' + h, '@', gx, gy); const cc = cols[sheet]; for (let tr = 0; tr < h; tr++) for (let tc = 0; tc < w; tc++) { const f = (sr + tr) * cc + (sc + tc); blit(sheets[sheet], (f % cc) * 16, ((f / cc) | 0) * 16, 16, 16, (gx + tc) * 16, (gy + tr) * 16, 1, tint, 1, flip) } },
  // si : item penz_items par FRAME, origine CENTRE, (cx,cy) tuiles, scale option
  item(frame, cx, cy, scale, tint) { scale = scale || 1; const cc = cols.penz_items; const sz = 16 * scale; blit(sheets.penz_items, (frame % cc) * 16, ((frame / cc) | 0) * 16, 16, 16, Math.round(cx * 16 - sz / 2), Math.round(cy * 16 - sz / 2), scale, tint) },
  whole(sheet, cx, cy, tint) { const img = sheets[sheet]; blit(img, 0, 0, img.W, img.H, Math.round(cx * 16 - img.W / 2), Math.round(cy * 16 - img.H / 2), 1, tint) },
  glowT(cx, cy, R, tint, k) { glow(Math.round(cx * 16), Math.round(cy * 16), R, tint, k) },
  // OMBRE DE MUR : assombrit le sol pres des murs (profondeur/relief interieur) ; depth=px de degrade
  wallShadow(depth, k) {
    depth = depth || 10; k = k == null ? 0.5 : k
    const top = 2 * 16, left = 1 * 16, right = (COLS - 1) * 16, bot = (ROWS - 1) * 16
    for (let y = top; y < bot; y++) for (let x = left; x < right; x++) {
      let d = Math.min(y - top, x - left, right - 1 - x, bot - 1 - y) // distance au mur le plus proche
      if (d >= depth) continue
      const f = (1 - d / depth) * k
      const j = (y * W + x) * 4
      cv[j] *= (1 - f); cv[j + 1] *= (1 - f); cv[j + 2] *= (1 - f)
    }
  },
}

// ====== DESIGNS ======
const designs = {}

// Reproduction FIDELE de la taverne actuelle (pour confirmer le "rien ne va")
designs.tavern_current = () => {
  const g0 = 6, g1 = 7, doorCx = (g0 + 1) // en tuiles
  ops.floor(28, 0xb07a44)
  ops.wallRing(0xc89860, g0, g1)
  ops.glowT(7.5, 6, 150, 0xffba70, 0.20)
  ops.whole('mw_door', doorCx + 0.5, ROWS - 1 + 0.5) // porte centree approx
  ops.furn('penz_doors', 6, 3, 2, 2, 1, 0); ops.furn('penz_doors', 6, 3, 2, 2, 9, 0) // fenetres
  // tavern
  ops.furn('penz_furn', 10, 2, 3, 3, 5, 6) // tapis
  ops.furn('penz_furn', 6, 11, 6, 2, 4, 2) // bar
  ops.furn('penz_furn', 2, 4, 3, 3, 10, 0) // etagere
  ops.item(57, 10.5, 0.5); ops.item(49, 11.4, 0.5); ops.item(57, 11.6, 1.5)
  ops.furn('penz_furn', 12, 1, 1, 1, 4.6, 4); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 4) // tabourets
  ops.furn('penz_furn', 5, 6, 1, 3, 1, 7); ops.furn('penz_furn', 5, 6, 1, 3, 13, 7) // lampadaires
  ops.glowT(1.5, 7.4, 36, 0xffcf8a, 0.3); ops.glowT(13.5, 7.4, 36, 0xffcf8a, 0.3)
  ops.furn('penz_furn', 11, 0, 1, 2, 2, 6.4); ops.item(54, 2.3, 6.4); ops.item(26, 2.8, 6.5)
  ops.furn('penz_furn', 8, 0, 1, 2, 2, 7.8)
  ops.furn('penz_furn', 0, 2, 3, 2, 5, 6.4); ops.item(54, 5.6, 6.5); ops.item(34, 6.5, 6.5); ops.item(26, 7.2, 6.5)
  ops.furn('penz_furn', 8, 0, 1, 2, 5, 7.8); ops.furn('penz_furn', 8, 0, 1, 2, 7, 7.8)
  ops.furn('penz_furn', 11, 0, 1, 2, 10, 6.4); ops.item(49, 10.3, 6.4); ops.item(26, 10.8, 6.5)
  ops.furn('penz_furn', 8, 0, 1, 2, 10, 7.8)
  ops.furn('penz_furn', 11, 0, 1, 2, 4, 9.2); ops.item(54, 4.4, 9.2)
  ops.furn('penz_furn', 8, 9, 2, 2, 11, 9)
  ops.furn('penz_furn', 0, 9, 1, 2, 1, 5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.6) // tapis porte
}

// ---- helper : groupe TABLE + chaises (chaise au-dessus dessinee AVANT la table = derriere ; au-dessous APRES = devant) ----
function tableGroup(tx, ty, opts) {
  opts = opts || {}
  if (opts.up) ops.furn('penz_furn', 8, 0, 1, 2, tx, ty - 1.05)   // chaise haut (derriere)
  ops.furn('penz_furn', 11, 0, 1, 2, tx, ty)                       // table ronde
  ;(opts.items || []).forEach((it, i) => ops.item(it, tx + 0.5 + (i - (opts.items.length - 1) / 2) * 0.4, ty + 0.35))
  if (opts.down) ops.furn('penz_furn', 8, 0, 1, 2, tx, ty + 0.95)  // chaise bas (devant)
  if (opts.left) ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.9, ty + 0.05)
  if (opts.right) ops.furn('penz_furn', 9, 0, 1, 2, tx + 0.9, ty + 0.05)
}

// TAVERNE v1 — on ASSUME le set cosy (pas de faux bar facon cuisine) : bar = etagere a bouteilles + comptoir en commodes
designs.tavern_v1 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR) // bois (pas de tint -> vraie couleur)
  // RUGS sous les zones (avant les meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.5, 7.6)  // tapis losanges gauche (3x2)
  ops.furn('penz_furn', 10, 2, 3, 2, 9.5, 7.6)  // tapis losanges droite
  ops.wallRing(0xc89860, g0, g1)
  // fenetres (cotes, pas au centre = laisse la place au bar)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  // === BAR (haut-centre) ===
  ops.furn('penz_furn', 2, 4, 3, 3, 6, 2)       // etagere a bouteilles (bibliotheque claire 3x3) sous le mur du fond
  // bouteilles/jarres sur les rayons de l'etagere
  ops.item(6, 6.5, 2.4); ops.item(57, 7.5, 2.4); ops.item(49, 8.4, 2.4)
  ops.item(56, 6.5, 3.4); ops.item(58, 8.4, 3.4)
  // comptoir = 2 commodes + buffet au milieu (cols 5-9, rows ~5)
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 5); ops.furn('penz_furn', 3, 0, 1, 2, 7, 5); ops.furn('penz_furn', 0, 0, 2, 2, 8, 5)
  // chopes/plat sur le comptoir
  ops.item(54, 5.6, 5.15); ops.item(42, 6.4, 5.15); ops.item(61, 8.4, 5.15); ops.item(54, 9.2, 5.15)
  // tabourets devant le comptoir
  ops.furn('penz_furn', 12, 1, 1, 1, 5.5, 7); ops.furn('penz_furn', 12, 1, 1, 1, 8.5, 7)
  // === TABLES (bas) : 4 tables groupees, lane centrale libre cols 6-7 ===
  tableGroup(2.5, 8.2, { up: true, down: true, items: [54, 26] })
  tableGroup(4.3, 9.6, { up: true, items: [42, 61] })
  tableGroup(10.5, 8.2, { up: true, down: true, items: [49, 26] })
  tableGroup(12.3, 9.6, { up: true, items: [54, 34] })
  // === coin lounge (fauteuil + plante) bas-gauche ===
  ops.furn('penz_furn', 0, 9, 1, 2, 1, 9.4)     // plante
  // === LANTERNES (lampadaires + lueurs chaudes, AUCUN feu) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.5); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.5)
  // PORTE + tapis de seuil (mat horizontal propre, pas l'ovale violet)
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 2, 2, 1, doorCx - 0.5, ROWS - 1.5)
  // lumieres d'ambiance (ADD) en dernier
  ops.glowT(7.5, 6, 150, 0xffba70, 0.16)
  ops.glowT(1.5, 5.0, 40, 0xffcf8a, 0.32); ops.glowT(13.5, 5.0, 40, 0xffcf8a, 0.32)
  ops.glowT(7.5, 3.2, 46, 0xffce7a, 0.22) // halo sur le bar
}

// TAVERNE v2 — bar lisible (etagere a bouteilles + comptoir long-table) + 4 tables groupees en bas, centre aere
designs.tavern_v2 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xe6cba2 // tint chaud leger pour "bois fonce chaleureux" sans ternir
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  // RUGS sous les 2 clusters de tables (avant meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.1)
  ops.furn('penz_furn', 10, 2, 3, 2, 9.2, 8.1)
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0) // fenetres
  // plante coin haut-gauche
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.3)
  // === BAR ===
  ops.furn('penz_furn', 2, 4, 3, 3, 6, 2)          // etagere a bouteilles (3x3)
  ops.item(6, 6.5, 2.45); ops.item(57, 7.0, 2.45); ops.item(49, 7.6, 2.45); ops.item(56, 8.2, 2.45)
  ops.item(58, 6.6, 3.45); ops.item(57, 7.4, 3.45); ops.item(56, 8.2, 3.45)
  ops.furn('penz_furn', 0, 2, 3, 2, 6, 4.4)        // COMPTOIR = longue table (cols6-8)
  ops.item(54, 6.4, 4.55); ops.item(42, 7.0, 4.55); ops.item(49, 7.6, 4.55); ops.item(61, 8.3, 4.55)
  ops.furn('penz_furn', 12, 1, 1, 1, 6.3, 6.6); ops.furn('penz_furn', 12, 1, 1, 1, 7.7, 6.6) // tabourets
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.2); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.2)
  // === 4 TABLES (band bas), lane centrale (cols 6-7) libre ===
  tableGroup(2.5, 8.7, { up: true, down: true, items: [54, 26] })
  tableGroup(4.6, 8.7, { up: true, down: true, items: [42, 61] })
  tableGroup(9.4, 8.7, { up: true, down: true, items: [49, 26] })
  tableGroup(11.5, 8.7, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale de seuil
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 0.5, ROWS - 1.4)
  // LUMIERES (ADD) en dernier
  ops.glowT(7.5, 5.5, 165, 0xffba70, 0.14)
  ops.glowT(1.5, 4.7, 42, 0xffcf8a, 0.34); ops.glowT(13.5, 4.7, 42, 0xffcf8a, 0.34)
  ops.glowT(7.5, 3.0, 50, 0xffce7a, 0.22)
}

// TAVERNE v3 — bar CONTRASTE (etagere sombre + comptoir bois fonce) ; lecon : le clair se fond dans le sol
designs.tavern_v3 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.0)   // tapis cluster gauche
  ops.furn('penz_furn', 10, 2, 3, 2, 9.2, 8.0)   // tapis cluster droite
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.2)    // plante coin
  // === BAR contraste ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 2)        // etagere SOMBRE a bouteilles (cols6-8)
  ops.item(6, 6.5, 2.45); ops.item(57, 7.0, 2.45); ops.item(49, 7.6, 2.45); ops.item(56, 8.2, 2.45)
  ops.item(58, 6.6, 3.45); ops.item(57, 7.4, 3.45); ops.item(56, 8.2, 3.45)
  // comptoir = 3 meubles bois FONCE (cols5-9) -> contraste avec le sol
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 4.7); ops.furn('penz_furn', 3, 0, 1, 2, 7, 4.7); ops.furn('penz_furn', 0, 0, 2, 2, 8, 4.7)
  ops.item(54, 5.6, 4.8); ops.item(42, 6.4, 4.8); ops.item(49, 7.6, 4.8); ops.item(61, 8.4, 4.8)
  ops.furn('penz_furn', 12, 1, 1, 1, 5.6, 7.1); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 7.1) // tabourets
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.0); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.0)
  // === 4 TABLES ===
  tableGroup(2.5, 8.6, { up: true, down: true, items: [54, 26] })
  tableGroup(4.6, 8.6, { up: true, down: true, items: [42, 61] })
  tableGroup(9.4, 8.6, { up: true, down: true, items: [49, 26] })
  tableGroup(11.5, 8.6, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 5.5, 170, 0xffba70, 0.13)
  ops.glowT(1.5, 4.5, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.5, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 3.0, 50, 0xffce7a, 0.20)
}

// TAVERNE v4 — comptoir = plan de travail SEAMLESS (kitchen counter) tinte bois ; tables groupees + variees
designs.tavern_v4 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96, CT2 = 0xc08a52 // tint comptoir = bois chaud fonce
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 3, 1.2, 7.3)   // grand tapis cluster gauche (3x3)
  ops.furn('penz_furn', 10, 2, 3, 3, 9.0, 7.3)   // grand tapis cluster droite
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.2)
  // === BAR : etagere sombre + comptoir SEAMLESS (kitchen counter 6x2) tinte bois ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 2)                 // etagere sombre (bouteilles), cols6-8
  ops.item(6, 6.5, 2.45); ops.item(57, 7.0, 2.45); ops.item(49, 7.6, 2.45); ops.item(56, 8.2, 2.45)
  ops.item(58, 6.6, 3.45); ops.item(57, 7.4, 3.45); ops.item(56, 8.2, 3.45)
  ops.furn('penz_furn', 6, 11, 6, 2, 4.5, 4.6, CT2)       // COMPTOIR seamless cols4.5-10.5
  ops.item(54, 5.2, 4.7); ops.item(42, 6.0, 4.7); ops.item(49, 7.6, 4.7); ops.item(61, 9.0, 4.7); ops.item(54, 9.8, 4.7)
  ops.furn('penz_furn', 12, 1, 1, 1, 5.5, 7.0); ops.furn('penz_furn', 12, 1, 1, 1, 7.5, 7.0); ops.furn('penz_furn', 12, 1, 1, 1, 9.5, 7.0)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.0); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.0)
  // === TABLES : 2 grandes ovales (4 places) + 2 rondes (2 places) ===
  // grande table gauche (ovale 2x2) + 4 chaises
  ops.furn('penz_furn', 9, 0, 1, 2, 1.4, 8.4)            // chaise profil gauche
  ops.furn('penz_furn', 8, 0, 1, 2, 2.5, 7.2)            // chaise face (derriere)
  ops.furn('penz_furn', 5, 2, 2, 2, 2.2, 8.2)            // table ovale
  ;[54, 26].forEach((it, i) => ops.item(it, 2.7 + i * 0.7, 8.6))
  ops.furn('penz_furn', 8, 0, 1, 2, 2.5, 9.3)            // chaise face (devant)
  // grande table droite
  ops.furn('penz_furn', 8, 0, 1, 2, 10.5, 7.2)
  ops.furn('penz_furn', 5, 2, 2, 2, 10.2, 8.2)
  ;[49, 61].forEach((it, i) => ops.item(it, 10.7 + i * 0.7, 8.6))
  ops.furn('penz_furn', 8, 0, 1, 2, 10.5, 9.3)
  ops.furn('penz_furn', 9, 0, 1, 2, 12.4, 8.4)           // chaise profil droite
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 5.0, 175, 0xffba70, 0.12)
  ops.glowT(1.5, 4.5, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.5, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 3.0, 52, 0xffce7a, 0.20)
}

// TAVERNE v5 — comptoir bois fonce (commodes) colle sous l'etagere + clutter pose dessus, tables groupees serrees
designs.tavern_v5 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.1)
  ops.furn('penz_furn', 10, 2, 3, 2, 9.2, 8.1)
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.2)
  // === BAR : etagere sombre (cols6-8) + comptoir commodes bois fonce colle dessous (cols5-9) ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 1.9)
  ops.item(6, 6.5, 2.35); ops.item(57, 7.0, 2.35); ops.item(49, 7.6, 2.35); ops.item(56, 8.2, 2.35)
  ops.item(58, 6.6, 3.35); ops.item(57, 7.4, 3.35); ops.item(56, 8.2, 3.35)
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 4.5); ops.furn('penz_furn', 3, 0, 1, 2, 7, 4.5); ops.furn('penz_furn', 0, 0, 2, 2, 8, 4.5)
  ops.item(54, 5.5, 4.5); ops.item(42, 6.3, 4.5); ops.item(49, 7.6, 4.5); ops.item(61, 8.5, 4.5) // poses sur le comptoir
  ops.furn('penz_furn', 12, 1, 1, 1, 5.6, 6.9); ops.furn('penz_furn', 12, 1, 1, 1, 7.0, 6.9); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 6.9)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.0); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.0)
  // === 4 TABLES groupees (rugs sous chaque paire) ===
  tableGroup(2.5, 8.7, { up: true, down: true, items: [54, 26] })
  tableGroup(4.6, 8.7, { up: true, down: true, items: [42, 61] })
  tableGroup(9.4, 8.7, { up: true, down: true, items: [49, 26] })
  tableGroup(11.5, 8.7, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 5.0, 175, 0xffba70, 0.12)
  ops.glowT(1.5, 4.5, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.5, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 2.8, 52, 0xffce7a, 0.20)
}

// groupe TABLE OVALE 2x2 + chaises AUTOUR (face derriere, profils sur les cotes) = groupe naturel, pas "totem"
function ovalGroup(tx, ty, opts) {
  opts = opts || {}
  if (opts.up) ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05)   // chaise face derriere (centree)
  if (opts.left) ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.35) // profil gauche
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                              // table ovale
  ;(opts.items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (opts.items.length - 1) / 2) * 0.6, ty + 0.55))
  if (opts.right) ops.furn('penz_furn', 9, 0, 1, 2, tx + 1.85, ty + 0.35) // profil droite
  if (opts.down) ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty + 1.95)
}

// TAVERNE v7 — salle agrandie 17x13, sol fonce, murs avec ombre, VRAI comptoir + armoire collee au mur, 3 tables ovales, centre degage
designs.tavern_v7 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a // bois FONCE chaleureux
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis sous les tables (avant meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.3); ops.furn('penz_furn', 10, 2, 3, 2, 12.0, 8.3)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5) // RELIEF : ombre du sol contre les murs
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres
  // === BAR : armoire a bouteilles COLLEE au mur (cols centre) + place barman + comptoir SEAMLESS devant ===
  ops.furn('penz_furn', 6, 4, 3, 3, cxm - 1.5, 1.5)                       // armoire sombre (3x3) collee au mur du fond
  ops.item(6, cxm - 1, 1.95); ops.item(57, cxm - 0.5, 1.95); ops.item(49, cxm + 0.1, 1.95); ops.item(56, cxm + 0.7, 1.95)
  ops.item(58, cxm - 0.9, 2.95); ops.item(57, cxm - 0.1, 2.95); ops.item(56, cxm + 0.7, 2.95)
  // (place barman ~ ligne 5 ; PNG ajoute dans le jeu)
  ops.furn('penz_furn', 6, 11, 6, 2, cxm - 3, 5.0, 0xcaa066)             // COMPTOIR seamless (6 large) devant, tinte bois
  ops.item(54, cxm - 2.4, 5.1); ops.item(42, cxm - 1.4, 5.1); ops.item(49, cxm + 0.4, 5.1); ops.item(61, cxm + 1.6, 5.1); ops.item(54, cxm + 2.3, 5.1)
  // tabourets pour BOIRE AU BAR
  for (let i = 0; i < 4; i++) ops.furn('penz_furn', 12, 1, 1, 1, cxm - 2.4 + i * 1.4, 7.4)
  // === LANTERNES (murs lateraux) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.2); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 4.2)
  // === 3 GRANDES TABLES OVALES, centre degage (circulation) ===
  ovalGroup(1.8, 9.0, { up: true, left: true, right: true, items: [54, 26] })   // gauche
  ovalGroup(12.4, 9.0, { up: true, left: true, right: true, items: [49, 61] })  // droite
  ovalGroup(7.0, 10.4, { up: true, left: true, right: true, items: [42, 34] })  // bas-centre (au-dessus de la porte, contournable)
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.2, 210, 0xffba70, 0.11)
  ops.glowT(1.5, 4.7, 44, 0xffcf8a, 0.34); ops.glowT(COLS - 1.5, 4.7, 44, 0xffcf8a, 0.34)
  ops.glowT(cxm, 2.6, 56, 0xffce7a, 0.18)
}

// table ovale + 3 chaises qui REGARDENT la table (haut=face, gauche=profil MIROIR vers droite, droite=profil vers gauche)
function ovalV9(tx, ty, items) {
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05)               // haut : face (regarde vers le bas = la table)
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.35, null, true)  // gauche : profil MIROIR (regarde a droite = la table)
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                            // table ovale
  ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.6, ty + 0.55))
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 1.85, ty + 0.35)              // droite : profil (regarde a gauche = la table)
}

// TAVERNE v9 — BAR PLEINE LARGEUR au fond (mur de bouteilles + barman + comptoir-ligne infranchissable) + chaises face a la table
designs.tavern_v9 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.9); ops.furn('penz_furn', 10, 2, 3, 2, 12.0, 8.9) // tapis tables
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres mur du fond
  // === MUR DE BOUTEILLES (3 etageres sombres collees au mur) ===
  ;[3, 7, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)
    ops.item(6, c + 0.5, 2.05); ops.item(57, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05)
    ops.item(58, c + 0.6, 3.05); ops.item(56, c + 1.5, 3.05)
  })
  // (barman Brewen : pose dans le jeu vers la ligne 4.8, derriere le comptoir)
  // === COMPTOIR PLEINE LARGEUR (ligne) — 2 rangs ; on ne peut PAS passer derriere ===
  const bL = 1, bR = COLS - 1
  for (const row of [5.0, 5.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  for (let c = 2; c < bR - 1; c += 2) ops.item([54, 42, 49, 61, 54, 42][((c / 2) | 0) % 6], c + 0.5, 5.05) // chopes/plats sur le bar
  for (let i = 0; i < 6; i++) ops.furn('penz_furn', 12, 1, 1, 1, 2.5 + i * 2, 6.6) // tabourets (boire au bar)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.0)
  // === 2 GRANDES TABLES OVALES (chaises face a la table) ===
  ovalV9(1.8, 9.4, [54, 26])
  ovalV9(12.4, 9.4, [49, 61])
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

// TAVERNE v8 — comptoir SANS la section evier (tiroirs/placards = lit comme un bar), 3e table en coin (porte+centre degages)
designs.tavern_v8 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.5); ops.furn('penz_furn', 10, 2, 3, 2, 12.0, 8.5) // tapis tables basses
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0)
  // === BAR ===
  ops.furn('penz_furn', 6, 4, 3, 3, cxm - 1.5, 1.5)                       // armoire bouteilles collee au mur
  ops.item(6, cxm - 1, 1.95); ops.item(57, cxm - 0.5, 1.95); ops.item(49, cxm + 0.1, 1.95); ops.item(56, cxm + 0.7, 1.95)
  ops.item(58, cxm - 0.9, 2.95); ops.item(57, cxm - 0.1, 2.95); ops.item(56, cxm + 0.7, 2.95)
  const BAR = process.env.BAR || 'bench'
  if (BAR === 'cab') ops.furn('penz_furn', 8, 11, 5, 2, cxm - 2.5, 5.0, 0xc89a62)        // tiroirs+placards tinte
  else if (BAR === 'cabraw') ops.furn('penz_furn', 8, 11, 5, 2, cxm - 2.5, 5.0)          // tiroirs+placards brut
  else if (BAR === 'bench') { ops.furn('penz_furn', 8, 14, 4, 1, cxm - 2, 5.6); ops.furn('penz_furn', 8, 14, 4, 1, cxm - 2, 6.0) } // banc-bar empile (2 rangs)
  else if (BAR === 'table') ops.furn('penz_furn', 0, 2, 3, 2, cxm - 1.5, 5.0, 0xb0834e)  // longue table tinte fonce
  else if (BAR === 'dress') { ops.furn('penz_furn', 0, 0, 2, 2, cxm - 2.5, 5.0); ops.furn('penz_furn', 0, 0, 2, 2, cxm - 0.5, 5.0); ops.furn('penz_furn', 3, 0, 1, 2, cxm + 1.5, 5.0) } // commodes
  ops.item(54, cxm - 1.9, 5.15); ops.item(42, cxm - 1.0, 5.15); ops.item(49, cxm + 0.6, 5.15); ops.item(61, cxm + 1.7, 5.15)
  for (let i = 0; i < 4; i++) ops.furn('penz_furn', 12, 1, 1, 1, cxm - 2.4 + i * 1.4, 7.4) // tabourets (boire au bar)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 6.2); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 6.2)
  // === 3 TABLES : 2 grandes ovales (bas G/D) + 1 petite ronde en coin (nook) ; centre + porte degages ===
  ovalGroup(1.8, 9.1, { up: true, left: true, right: true, items: [54, 26] })
  ovalGroup(12.4, 9.1, { up: true, left: true, right: true, items: [49, 61] })
  ovalGroup(2.4, 4.9, { up: true, right: true, items: [42] }) // 3e table (coin haut-gauche, contre le mur)
  // plante + tonneau (coins, chaleur)
  ops.furn('penz_furn', 0, 9, 1, 2, COLS - 2.1, 2.2)
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.2, 215, 0xffba70, 0.10)
  ops.glowT(1.5, 6.6, 44, 0xffcf8a, 0.34); ops.glowT(COLS - 1.5, 6.6, 44, 0xffcf8a, 0.34)
  ops.glowT(cxm, 2.6, 58, 0xffce7a, 0.18)
}

// TAVERNE v6 — meme base que v5, bar resserre en haut + bande de tables remontee (plus de chaise dans le mur)
designs.tavern_v6 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.5, 7.7)   // tapis cluster gauche
  ops.furn('penz_furn', 10, 2, 3, 2, 9.0, 7.7)   // tapis cluster droite
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  // === BAR resserre ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 1.7)
  ops.item(6, 6.5, 2.15); ops.item(57, 7.0, 2.15); ops.item(49, 7.6, 2.15); ops.item(56, 8.2, 2.15)
  ops.item(58, 6.6, 3.15); ops.item(57, 7.4, 3.15); ops.item(56, 8.2, 3.15)
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 4.3); ops.furn('penz_furn', 3, 0, 1, 2, 7, 4.3); ops.furn('penz_furn', 0, 0, 2, 2, 8, 4.3)
  ops.item(54, 5.5, 4.35); ops.item(42, 6.3, 4.35); ops.item(49, 7.6, 4.35); ops.item(61, 8.5, 4.35)
  ops.furn('penz_furn', 12, 1, 1, 1, 5.6, 6.4); ops.furn('penz_furn', 12, 1, 1, 1, 7.0, 6.4); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 6.4)
  // plante + tonneau (coins)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.0)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 3.8); ops.furn('penz_furn', 6, 7, 1, 3, 13, 3.8)
  // === 4 TABLES (band remontee gy8.0) ===
  tableGroup(2.6, 8.0, { up: true, down: true, items: [54, 26] })
  tableGroup(4.7, 8.0, { up: true, down: true, items: [42, 61] })
  tableGroup(9.3, 8.0, { up: true, down: true, items: [49, 26] })
  tableGroup(11.4, 8.0, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 4.8, 180, 0xffba70, 0.12)
  ops.glowT(1.5, 4.3, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.3, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 2.6, 52, 0xffce7a, 0.20)
}

designs.debug_shelf = () => {
  ops.floor(92)
  ops.wallRing(0xc89860, 6, 7)
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 1.9) // etagere sombre @ gx6 -> CENTRE attendu
}

designs.debug_iso = () => {
  ops.floor(92)
  ops.wallRing(0xc89860, 6, 7)
  ops.furn('penz_furn', 0, 2, 3, 2, 6, 4.4)   // counter long-table @ gx6 -> doit etre au CENTRE
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.2)   // lampe @ gx1 (gauche)
  ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.2)  // lampe @ gx13 (droite)
}

designs.apoth_A = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270 // sol neutre/froid -> laisse le violet dominer
  const WALL = 0x9a8aa8 // mur froid/violace
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  // palette fioles
  const VIO = 0xb070ff, MAG = 0xe060c0, TEAL = 0x60d0d0, AMB = 0xffb060, GRN = 0x70e090, RED = 0xff6060
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === MUR DE FIOLES : 4 grandes etageres sombres COLLEES cote a cote au mur du fond (cols ~2..13) ===
  // leger chevauchement (pas 3.0) pour fermer les jointures = look maximaliste bourre
  const shelfCols = [2, 4.85, 7.7, 10.55]
  shelfCols.forEach((c) => ops.furn('penz_furn', 6, 4, 3, 3, c, 1.5)) // bibliotheque_sombre 3x3
  // fioles + bocaux sur CHAQUE rayon de CHAQUE etagere (3 rangs visibles : ~1.95 / ~2.85 / ~3.75)
  const rowsY = [1.95, 2.85, 3.75]
  const fioleTints = [VIO, MAG, TEAL, MAG, VIO, AMB, TEAL, VIO, MAG, GRN]
  shelfCols.forEach((c, si) => {
    rowsY.forEach((ry, ri) => {
      // 3 contenants par rayon : 2 fioles tintees + 1 bocal d'ingredient
      const t0 = fioleTints[(si * 3 + ri * 2) % fioleTints.length]
      const t1 = fioleTints[(si * 3 + ri * 2 + 1) % fioleTints.length]
      ops.item(6, c + 0.55, ry, 1, t0)                       // fiole gauche
      ops.item(6, c + 1.5, ry, 1, t1)                        // fiole centre
      ops.item([56, 57, 58, 59][(si + ri) % 4], c + 2.35, ry) // bocal d'ingredient droite
    })
  })

  // === LAMPADAIRES sur les murs lateraux ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 5.6); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 5.6)

  // === PLANTES dans les coins bas (suggere les herbes), bien dans la zone jouable ===
  ops.furn('penz_furn', 0, 9, 1, 2, 1, 8.1); ops.furn('penz_furn', 0, 9, 1, 2, COLS - 2, 8.1)

  // === PETIT COMPTOIR EN L (bas-GAUCHE) : commode 2x2 + 1-2 tuiles bar_long ; Ylva derriere (place ~ligne 6.5) ===
  // tapis ovale violet sous le comptoir
  ops.furn('penz_furn', 8, 3, 2, 1, 1.6, 7.4)               // tapis_ovale_violet
  ops.furn('penz_furn', 0, 0, 2, 2, 1.5, 7.5)               // commode (corps du comptoir)
  ops.furn('penz_furn', 8, 14, 2, 1, 3.5, 8.5)              // bar_long (retour du L, vers la droite)
  // clutter d'alchimie sur le comptoir
  ops.item(24, 2.0, 7.55)                                    // livre ouvert
  ops.item(26, 2.7, 7.45)                                    // bougie allumee
  ops.item(49, 3.4, 7.55, 1, VIO)                            // calice (potion violette servie)
  ops.item(6, 4.3, 8.45, 1, MAG); ops.item(6, 5.0, 8.45, 1, TEAL) // fioles sur le retour du bar

  // === CHAUDRON qui mijote (centre-bas) avec grosse vapeur violette ===
  const cauX = cxm + 0.5, cauY = 7.6
  ops.item(37, cauX, cauY, 2.4, 0x9a70d0)                    // chaudron plein, gros

  // === PORTE + tapis de seuil ovale violet ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : violet alchimiste dominant ===
  ops.glowT(cxm, 5.2, 230, 0x9a70d0, 0.13)                  // ambiance violette globale
  ops.glowT(cauX, cauY - 0.7, 56, 0xb070ff, 0.5)            // VAPEUR du chaudron (violet vif)
  ops.glowT(cauX, cauY - 1.3, 40, 0x70e090, 0.22)           // soupcon de vert qui s'echappe
  ops.glowT(1.5, 6.0, 44, 0xcfa8ff, 0.30); ops.glowT(COLS - 1.5, 6.0, 44, 0xcfa8ff, 0.30) // lampadaires (teinte violacee)
  ops.glowT(cxm, 2.4, 120, 0xb070ff, 0.10)                  // halo sur le mur de fioles
}

designs.apoth_B = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270            // sol neutre/froid (laisse parler le violet)
  const WALL = 0x9a8aa8          // mur pierre froide/violacee
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === FENETRES (mur du fond, ecartees pour laisser la place au mur de fioles entre elles) ===
  ops.furn('penz_doors', 6, 3, 2, 2, 1.5, 0)         // fenetre gauche
  ops.furn('penz_doors', 6, 3, 2, 2, COLS - 3.5, 0)  // fenetre droite

  // === MUR DE FIOLES (2 grandes bibliotheques sombres collees au mur, ENTRE les fenetres) ===
  // violet/magenta DOMINANTS + qq teal/ambre/vert. NB le flacon (frame6) a un liquide ORANGE :
  // MULTIPLY garde le canal rouge -> il faut des teintes a FAIBLE rouge pour vraiment virer au violet.
  const VIO = 0x8048e0, MAG = 0xd040b0, TEAL = 0x40c8c8, AMBR = 0xffb050, VERT = 0x60d080
  const FIOLE = [VIO, MAG, VIO, TEAL, MAG, VIO, AMBR, MAG,
                 VIO, VERT, MAG, VIO, TEAL, VIO, MAG, AMBR]
  const shelfFioles = (gx) => {
    ops.furn('penz_furn', 6, 4, 3, 3, gx, 1.6)        // bibliotheque sombre 3x3 sous le haut de mur
    // rayon haut (y ~2.15) et rayon bas (y ~3.1), 4 fioles serrees par rayon -> mur de fioles dense
    for (let i = 0; i < 4; i++) {
      ops.item(6, gx + 0.45 + i * 0.7, 2.15, 1.0, FIOLE[(gx * 2 + i) % FIOLE.length])
      ops.item(6, gx + 0.45 + i * 0.7, 3.1, 1.0, FIOLE[(gx * 2 + i + 4) % FIOLE.length])
    }
  }
  shelfFioles(4.5)   // etagere gauche-centre
  shelfFioles(7.5)   // etagere droite-centre
  // bocaux d'ingredients sur le rebord SUPERIEUR (au-dessus, sous le haut de mur)
  ops.item(58, 4.95, 1.7, 0.85); ops.item(56, 6.6, 1.7, 0.85)
  ops.item(57, 7.95, 1.7, 0.85); ops.item(59, 9.6, 1.7, 0.85)

  // === COIN D'ETUDE (bas-droite) : etabli = table longue claire 3x2 ===
  ops.furn('penz_furn', 0, 2, 3, 2, 10.5, 7.2)        // etabli (cols 10.5-13.5)
  ops.item(25, 10.9, 7.25, 0.9)                        // livre ferme
  ops.item(24, 11.6, 7.3, 0.9)                         // livre ouvert
  ops.item(0, 12.2, 7.15, 0.85)                        // plume
  ops.item(3, 12.7, 7.2, 0.9)                          // pot a pinceaux violet
  ops.item(26, 11.0, 7.85, 0.9)                        // bougie allumee (chaleur ponctuelle)
  ops.furn('penz_furn', 8, 0, 1, 2, 11.4, 8.6)        // chaise face (place de travail)
  ops.furn('penz_furn', 0, 9, 1, 2, 12.4, 9.5)        // plante en pot (herbes, coin droit, rentree)

  // === PETIT COMPTOIR (bas-gauche) : commode = base du comptoir ; place Ylva DERRIERE (au-dessus) ===
  ops.furn('penz_furn', 0, 0, 2, 2, 1.6, 7.0)         // commode (comptoir) cols 1.6-3.6
  ops.item(49, 2.0, 7.05, 0.9)                         // calice (potion servie)
  ops.item(6, 2.6, 7.05, 0.9, 0x8048e0)               // fiole violette posee
  ops.item(29, 3.2, 7.0, 0.9)                          // urne bordeaux
  // (Ylva se tiendra ~ ligne 6.2, derriere/au-dessus du comptoir, dans le jeu — place laissee libre)

  // === CHAUDRON (coin bas-gauche, pres du comptoir) + urnes bordeaux ===
  ops.item(37, 2.3, 9.5, 2.4, 0x9a70d0)               // gros chaudron alchimique violace
  ops.item(29, 1.0, 9.0, 0.95)                         // urne bordeaux a gauche
  ops.item(29, 3.6, 9.4, 0.9)                          // urne bordeaux a droite
  ops.item(14, 4.1, 10.2, 0.95)                        // petite plante (herbes), degagee du chaudron

  // === LAMPADAIRE d'ambiance (cote droit, pres de l'etude) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 13.4, 3.6)

  // === PORTE + tapis ovale violet de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) EN DERNIER : violet feutre + chaleurs ponctuelles ===
  ops.glowT(7.5, 5.5, 200, 0x9a70d0, 0.12)            // ambiance violette globale
  ops.glowT(2.3, 9.0, 42, 0x9a70d0, 0.42)            // vapeur qui mijote au-dessus du chaudron
  ops.glowT(2.3, 8.8, 26, 0x70e090, 0.18)            // pointe verte (mixture)
  ops.glowT(11.0, 7.7, 30, 0xffcf8a, 0.34)           // bougie de l'etabli (chaude)
  ops.glowT(13.4, 3.9, 34, 0xb070ff, 0.26)           // halo du lampadaire (violet)
  ops.glowT(6.0, 2.5, 60, 0xb070ff, 0.16)            // lueur sur le mur de fioles
}

designs.apoth_C = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  // palette fioles : violet domine + qq accents (teal/ambre/vert/magenta)
  const PURP = 0xb070ff, MAG = 0xe060c0, TEAL = 0x60d0d0, AMBR = 0xffb060, GRN = 0x70e090
  // helper : range de fioles alignees sur un rayon d'etagere (y), de x0 a x1, couleurs cyclees
  const shelfVials = (y, x0, x1, cols) => {
    const n = cols.length
    for (let i = 0; i < n; i++) ops.item(6, x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)), y, 0.85, cols[i])
  }

  ops.floor(FLOOR, 0x817690)                 // sol pierre FROID/violace (laisse parler le violet)
  ops.wallRing(0x9a8aa8, g0, g1)             // murs froids/violaces
  ops.wallShadow(11, 0.55)                    // relief : ombre du sol contre les murs

  // --- TAPIS sous l'atelier (chaudron + table), avant les meubles ---
  ops.furn('penz_furn', 10, 2, 3, 3, cxm - 3.2, 4.5, 0x9a7ab0)  // tapis losanges teinte violet sous l'atelier (chaudron + table)

  // === MUR DE FIOLES : 2 grandes etageres sombres collees au mur du fond ===
  // etagere gauche (cols 2-4) et etagere droite (cols 8-10) ; centre du mur garde 2 fenetres
  ;[2, 8].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.5)            // bibliotheque_sombre 3x3
    shelfVials(2.05, c + 0.4, c + 2.6, [PURP, MAG, TEAL, AMBR])   // rayon haut
    shelfVials(3.05, c + 0.4, c + 2.6, [GRN, PURP, MAG, PURP])    // rayon bas (1 verte = accent)
  })
  // bocaux d'ingredients en haut des etageres (clutter alchimie)
  ops.item(58, 2.5, 1.55); ops.item(57, 4.3, 1.55)       // bocal vert / orange (gauche)
  ops.item(59, 8.5, 1.55); ops.item(56, 10.3, 1.55)      // bocal brun / clair (droite)
  // FENETRES au centre du mur du fond (entre les 2 etageres)
  ops.furn('penz_doors', 6, 3, 2, 2, cxm - 1, 0, 0xb0a0c0)

  // === HERBES SUSPENDUES (suggerees) : plantes en hauteur, rang ~2 pres du mur ===
  ops.item(15, 6.2, 2.2, 1.1, 0x9fd07a)   // plante automne tintee verte (herbe sechee, gauche fenetre)
  ops.item(14, 8.8, 2.2, 1.1)             // petite plante (droite fenetre)
  ops.item(7, 5.2, 2.25)                  // vase a tige (herbe)
  ops.item(7, 9.8, 2.25)

  // === PETIT COMPTOIR sur le COTE DROIT (PAS pleine largeur) — Ylva se tient derriere (place ~1 tuile a droite) ===
  ops.furn('penz_furn', 0, 0, 2, 2, 11.5, 6.6)            // commode_tiroirs = base du comptoir
  ops.item(24, 11.9, 6.65)                                // livre ouvert (registre)
  ops.item(0, 12.5, 6.55)                                 // plume
  ops.item(49, 13.0, 6.7, 1, PURP)                        // calice violet servi
  ops.item(26, 11.7, 6.55)                                // bougie allumee

  // === TABLE D'ALCHIMIE CENTRALE (table_ovale_basse) couverte de fioles tintees + calices ===
  const tx = cxm - 1, ty = 5.6
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)              // table ovale basse (2x2)
  // fioles + calices alignes sur le plateau (y ~ ty+0.15)
  ops.item(6, tx + 0.35, ty + 0.15, 0.95, PURP)
  ops.item(6, tx + 0.75, ty + 0.15, 0.95, MAG)
  ops.item(49, tx + 1.15, ty + 0.2, 0.95, GRN)          // calice vert servi (accent)
  ops.item(6, tx + 1.55, ty + 0.15, 0.95, TEAL)
  ops.item(24, tx + 0.95, ty + 0.55)                    // livre ouvert (recette) devant
  ops.item(3, tx + 0.2, ty + 0.5)                       // pot a pinceaux/plumes (violet)

  // === CHAUDRON juste A COTE de la table (cote gauche), il mijote ===
  const chX = tx - 1.2, chY = 6.1
  ops.item(37, chX, chY, 2.4, 0x9a70d0)                  // gros chaudron tinte violet

  // === LAMPADAIRES d'ambiance (murs lateraux) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.4)
  // plantes en pot dans les coins bas (herbes au sol)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 9.6, 0xa8d090)

  // === PORTE + tapis ovale violet de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)   // tapis ovale violet (col8 row3 2x1)

  // === LUMIERES (ADD) EN DERNIER : violet dominant + accent VERT sous/au-dessus du chaudron ===
  ops.glowT(cxm, 5.4, 200, 0x9a70d0, 0.13)                    // bain violet general
  ops.glowT(chX, chY - 0.55, 46, 0x70e090, 0.42)             // VAPEUR verte qui mijote (au-dessus du chaudron)
  ops.glowT(chX, chY + 0.2, 30, 0x60e070, 0.30)              // lueur verte SOUS le chaudron
  ops.glowT(tx + 0.95, ty + 0.2, 40, 0xb070ff, 0.26)        // halo violet sur la table d'alchimie
  ops.glowT(2.5, 7.6, 40, 0xc6a8ff, 0.28); ops.glowT(COLS - 2.5, 7.6, 40, 0xc6a8ff, 0.28) // lampadaires
  ops.glowT(3.5, 2.4, 40, 0xb88aff, 0.16); ops.glowT(9.5, 2.4, 40, 0xb88aff, 0.16)       // halos sur le mur de fioles
}

designs.apoth_D = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x7e7890          // sol pierre froid/violace (ambiance alchimiste, plus desature)
  const WT = 0x9a8aa8          // mur froid/violace
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2

  // helper : remplit une etagere (bibliotheque_sombre 3x3) de FIOLES colorees alignees sur 2 rayons
  const VIO = [0xb070ff, 0xe060c0, 0x60d0d0, 0xffb060, 0xff6060, 0x70e090]
  const fillShelf = (gx, gy, pal) => {
    ops.furn('penz_furn', 6, 4, 3, 3, gx, gy)
    // rayon haut (~ +0.6) et rayon bas (~ +1.6), 3 fioles par rayon
    for (let i = 0; i < 3; i++) ops.item(6, gx + 0.5 + i, gy + 0.6, 0.9, pal[i % pal.length])
    for (let i = 0; i < 3; i++) ops.item(6, gx + 0.5 + i, gy + 1.6, 0.9, pal[(i + 3) % pal.length])
  }
  // helper : etagere laterale BASSE (bibliotheque_basse 2x2) avec bocaux/fioles
  const sideShelf = (gx, gy, pal) => {
    ops.furn('penz_furn', 3, 2, 2, 2, gx, gy)
    ops.item(56, gx + 0.5, gy + 0.55, 0.85); ops.item(58, gx + 1.4, gy + 0.55, 0.85)
    ops.item(6, gx + 0.5, gy + 1.5, 0.85, pal[0]); ops.item(6, gx + 1.4, gy + 1.5, 0.85, pal[1])
  }

  ops.floor(FLOOR, FT)
  ops.wallRing(WT, g0, g1)
  ops.wallShadow(11, 0.5)

  // === MUR DE FIOLES CENTRAL (signature) collee au mur du fond, encadree par 2 fenetres ===
  fillShelf(cxm - 1.5, 1.5, VIO)                                   // grande etagere a fioles, centree
  ops.furn('penz_doors', 6, 3, 2, 2, cxm - 4.5, 0); ops.furn('penz_doors', 6, 3, 2, 2, cxm + 2.5, 0) // 2 fenetres symetriques

  // === 2 COLONNES D'ETAGERES LATERALES symetriques (bibliotheque) ===
  sideShelf(1, 2.2, [0xb070ff, 0x60d0d0])                          // gauche
  sideShelf(COLS - 3, 2.2, [0xe060c0, 0xffb060])                   // droite
  sideShelf(1, 4.6, [0x70e090, 0xff6060])                          // gauche bas
  sideShelf(COLS - 3, 4.6, [0x60d0d0, 0xb070ff])                   // droite bas

  // === COMPTOIR (PETIT) bas-centre-GAUCHE — 2 commodes ; place Ylva DERRIERE (au-dessus, vers gy6) ===
  ops.furn('penz_furn', 0, 0, 2, 2, 3, 7.4)                        // commode (2x2)
  ops.furn('penz_furn', 3, 0, 1, 2, 5, 7.4)                        // buffet (1x2) -> comptoir 3 large
  ops.item(24, 3.5, 7.45, 0.9); ops.item(49, 4.4, 7.45, 0.9, 0xb070ff); ops.item(26, 5.4, 7.45)  // livre + calice potion + bougie

  // === CHAUDRON qui mijote bas-DROITE ===
  ops.item(37, 11.0, 8.0, 2.4, 0x9a70d0)                           // gros chaudron tinte violet

  // === PLANTES EN POT symetriques (suggestion d'herbes), coins bas, hors des etageres ===
  // (l'item plante = sprite propre/fiable ; le furn plante_pot rendait casse sur cette planche)
  ops.item(15, 1.7, 8.8, 1.6); ops.item(15, COLS - 1.7, 8.8, 1.6)   // plantes touffues (herbes) en bas-G/D
  ops.item(14, 1.7, 7.4, 1.2); ops.item(14, COLS - 1.7, 7.4, 1.2)   // petites pousses au-dessus, herboristerie

  // PORTE + tapis ovale violet de seuil
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERE VIOLETTE uniforme (ADD) en dernier ===
  ops.glowT(cxm, 5.2, 220, 0x9a70d0, 0.15)                         // bain violet d'ambiance
  ops.glowT(cxm, 2.6, 60, 0xb070ff, 0.22)                          // halo sur le mur de fioles
  ops.glowT(11.0, 7.0, 50, 0x80e0a0, 0.38)                         // VAPEUR verte du chaudron (au-dessus)
  ops.glowT(11.0, 7.9, 30, 0x9a70d0, 0.22)                         // lueur violette sous le chaudron
  ops.glowT(2.0, 3.5, 42, 0xb070ff, 0.18); ops.glowT(COLS - 2.0, 3.5, 42, 0xb070ff, 0.18) // etageres laterales
}

// APOTHICAIRE FINAL — base A (mur de fioles plein) peaufinee : reflets violets/teal (verre clair teinte),
// plantes en pot fiables (items 14/15), chaudron pose sur tapis + ingredients autour, coin herboriste bas-droite.
designs.apoth_final = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270   // sol neutre/froid -> laisse le violet dominer
  const WALL = 0x9a8aa8 // mur pierre froide/violacee
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  // fioles CHAUDES = flask frame6 (liquide orange -> reste rouge/ambre meme tinte) ; POPS FROIDS = verre/calice CLAIR teinte (vrai violet/teal/vert/bleu)
  const WARMFLASK = [0xff7050, 0xffb050]                                   // rouge, ambre
  const RICH = [0x8050d0, 0x40c0d0, 0x60d070, 0x5a6ae0, 0xc050c0]          // violet, teal, vert, bleu, magenta
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === MUR DE FIOLES : 4 grandes etageres sombres COLLEES cote a cote au mur du fond ===
  const shelfCols = [2, 4.85, 7.7, 10.55]
  shelfCols.forEach((c) => ops.furn('penz_furn', 6, 4, 3, 3, c, 1.5)) // bibliotheque_sombre 3x3
  const rowsY = [2.05, 2.9, 3.75]
  shelfCols.forEach((c, si) => {
    rowsY.forEach((ry, ri) => {
      const k = si * 3 + ri
      ops.item(6, c + 0.5, ry, 0.95, WARMFLASK[k % WARMFLASK.length])             // fiole chaude (rouge/ambre)
      ops.item(40, c + 1.35, ry, 0.92, RICH[k % RICH.length])                     // verre droit CLAIR teinte FROID = vrai violet/teal/vert/bleu (forme fiole)
      ops.item([56, 57, 58, 59][(si + ri) % 4], c + 2.35, ry, 0.92)              // bocal d'ingredient
    })
  })

  // === LAMPADAIRES murs lateraux ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 5.4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 5.4)

  // === PETIT COMPTOIR EN L (bas-GAUCHE) ; place laissee pour Ylva derriere (~gy 6.4) ===
  ops.furn('penz_furn', 8, 3, 2, 1, 1.6, 7.35)             // tapis ovale violet sous le comptoir
  ops.furn('penz_furn', 0, 0, 2, 2, 1.5, 7.4)             // commode (corps du comptoir)
  ops.furn('penz_furn', 8, 14, 2, 1, 3.5, 8.45)           // bar_long (retour du L vers la droite)
  ops.item(24, 2.0, 7.45)                                  // livre ouvert (registre)
  ops.item(26, 2.7, 7.35)                                  // bougie allumee
  ops.item(48, 3.4, 7.45, 1, 0x8050d0)                   // calice violet servi
  ops.item(40, 4.3, 8.4, 1, 0x40c0d0); ops.item(6, 5.0, 8.4, 1, 0xff7050) // fioles sur le retour

  // === CHAUDRON central pose sur un tapis + ingredients autour (plus seul) ===
  const cauX = cxm, cauY = 7.3
  ops.furn('penz_furn', 8, 3, 2, 1, cauX - 1, cauY + 0.6) // petit tapis ovale violet sous le chaudron
  ops.item(37, cauX, cauY, 2.4, 0x9a70d0)                  // gros chaudron tinte violet
  ops.item(29, cauX - 1.4, cauY + 0.45, 0.95)            // urne bordeaux gauche
  ops.item(29, cauX + 1.4, cauY + 0.45, 0.9)             // urne bordeaux droite

  // === COIN HERBORISTE bas-DROITE (equilibre la salle) : etagere basse + bocaux + fioles ===
  ops.furn('penz_furn', 3, 2, 2, 2, COLS - 3.2, 7.2)      // bibliotheque_basse 2x2 (ingredients)
  ops.item(58, COLS - 2.7, 7.45, 0.9); ops.item(56, COLS - 1.8, 7.45, 0.9)
  ops.item(6, COLS - 2.7, 8.35, 0.9, 0x60d070); ops.item(40, COLS - 1.8, 8.35, 0.9, 0x8050d0)

  // === HERBES en pot (items fiables 14/15) dans les coins bas ===
  ops.item(15, 1.5, 9.7, 1.5)                             // herbe touffue bas-gauche
  ops.item(14, COLS - 1.5, 9.6, 1.3)                      // pousse bas-droite

  // === PORTE + tapis ovale violet de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : violet alchimiste ===
  ops.glowT(cxm, 5.2, 235, 0x9a70d0, 0.13)                // bain violet global
  ops.glowT(cauX, cauY - 0.7, 58, 0xb070ff, 0.5)         // vapeur du chaudron (violet vif)
  ops.glowT(cauX, cauY - 1.3, 40, 0x70e090, 0.22)       // soupcon de vert qui s'echappe
  ops.glowT(1.5, 6.0, 44, 0xcfa8ff, 0.30); ops.glowT(COLS - 1.5, 6.0, 44, 0xcfa8ff, 0.30) // lampadaires
  ops.glowT(cxm, 2.4, 130, 0xb070ff, 0.12)              // halo sur le mur de fioles
}

// APOTHICAIRE v2 — modele TAVERNE : Ylva CENTREE derriere un GRAND comptoir pleine largeur,
// mur de fioles EXACTEMENT jointif (pas d'overlap = plus de meuble casse), chaudron deplace en coin, centre degage.
designs.apoth_v2 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270, WALL = 0x9a8aa8
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  const WARMFLASK = [0xff7050, 0xffb050]
  const RICH = [0x8050d0, 0x40c0d0, 0x60d070, 0x5a6ae0, 0xc050c0]
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)
  // tapis central (habille le milieu a la place du chaudron ; marchable)
  ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, 7.9)
  // === MUR DE FIOLES : 4 etageres EXACTEMENT adjacentes (espacees de 3 = bords jointifs, AUCUN overlap) ===
  const shelfCols = [1.5, 4.5, 7.5, 10.5]
  shelfCols.forEach((c) => ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6))
  shelfCols.forEach((c, si) => [2.25, 3.2].forEach((ry, ri) => {
    const k = si * 2 + ri
    ops.item(6, c + 0.5, ry, 0.9, WARMFLASK[k % WARMFLASK.length])
    ops.item(40, c + 1.4, ry, 0.88, RICH[k % RICH.length])
    ops.item([56, 57, 58, 59][(si + ri) % 4], c + 2.35, ry, 0.88)
  }))
  // (YLVA centree ~ ligne 5.1, posee dans le jeu)
  // === GRAND COMPTOIR PLEINE LARGEUR (2 rangs) — infranchissable, on ne passe pas derriere ===
  const bL = 1, bR = COLS - 1
  for (const row of [5.6, 6.0]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  // clutter d'alchimie SUR le comptoir (registre, bougie, fioles, mortier/urne)
  ops.item(24, cxm - 2.6, 5.65); ops.item(26, cxm - 1.8, 5.55)
  ops.item(6, cxm + 0.4, 5.6, 0.9, 0xff7050); ops.item(40, cxm + 1.1, 5.6, 0.9, 0x8050d0); ops.item(40, cxm + 1.8, 5.6, 0.9, 0x40c0d0)
  ops.item(29, cxm + 2.7, 5.6, 0.95)
  ops.item(56, cxm + 3.5, 5.6, 0.9); ops.item(6, cxm + 4.3, 5.6, 0.9, 0x60d070) // bocal + fiole (droite du comptoir)
  // === COIN PREPARATION (bas-GAUCHE) : cabinet + tapis dessous + MOINS d'objets (mortier + 1 fiole) ===
  ops.furn('penz_furn', 8, 3, 2, 1, 1.7, 9.55)           // tapis sous le cabinet
  ops.furn('penz_furn', 0, 0, 2, 2, 1.7, 7.9)            // commode = cabinet a ingredients
  ops.item(29, 2.4, 7.95, 0.9)                            // mortier (urne)
  ops.item(6, 3.2, 7.95, 0.85, 0x8050d0)                 // fiole violette
  // === COIN HERBORISTE (bas-DROITE) : tapis dessous + etagere basse + bocaux/fioles ===
  ops.furn('penz_furn', 8, 3, 2, 1, COLS - 3.4, 9.8)     // tapis sous l'etagere
  ops.furn('penz_furn', 3, 2, 2, 2, COLS - 3.4, 8.1)
  ops.item(58, COLS - 2.9, 8.35, 0.9); ops.item(56, COLS - 2.0, 8.35, 0.9)
  ops.item(6, COLS - 2.9, 9.25, 0.9, 0x60d070); ops.item(40, COLS - 2.0, 9.25, 0.9, 0x8050d0)
  // === HERBES en pot (coins bas) ===
  ops.item(15, 1.5, 10.1, 1.4); ops.item(14, COLS - 1.5, 10.1, 1.3)
  // === PORTE + tapis de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // === LUMIERES violet (RENFORCEES) ===
  ops.glowT(cxm, 6.2, 250, 0x9a70d0, 0.20)                 // bain violet general (plus fort)
  ops.glowT(cxm, 8.7, 90, 0xb070ff, 0.18)                  // lueur violette au sol du centre
  ops.glowT(2.6, 8.0, 44, 0xb070ff, 0.30)                  // halo violet sur le cabinet (gauche)
  ops.glowT(COLS - 2.6, 8.6, 44, 0xb070ff, 0.28)           // halo violet sur l'etagere herboriste (droite)
  ops.glowT(2.5, 6.1, 42, 0xcfa8ff, 0.30); ops.glowT(COLS - 2.5, 6.1, 42, 0xcfa8ff, 0.30)         // lueurs aux bouts du comptoir
  ops.glowT(cxm, 2.6, 140, 0xb070ff, 0.22)                // halo violet sur le mur de fioles
}

// table ovale + 4 chaises qui REGARDENT toutes la table (haut=FACE, bas=DOS, gauche=PROFIL miroir, droite=PROFIL)
// dessin : chaise HAUT avant la table (derriere), chaise BAS apres la table (devant)
function ovalSeatA(tx, ty, items) {
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 0.5, null, false)   // HAUT : FACE (regarde vers le bas = table) — derriere
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.75, ty + 0.3, null, true)   // GAUCHE : PROFIL miroir (regarde a droite = table)
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 1.75, ty + 0.3, null, false)  // DROITE : PROFIL (regarde a gauche = table)
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                            // TABLE ovale 2x2
  ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.55, ty + 0.85))
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.5, ty + 1.1, null, false)   // BAS : DOS (regarde vers le haut = table) — devant
}

// TAVERNE tav_seat_A — base tavern_v9 (bar pleine largeur + tapis + lanternes + lumieres + porte) ;
// SEUL CHANGEMENT : 2 tables ovales a 4 chaises (haut=FACE bas=DOS gauche=PROFIL flip droite=PROFIL),
// tables RENTREES vers le centre (couloir >=1 tuile tout autour, tour de table possible), place pour s'asseoir.
designs.tav_seat_A = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis sous les 2 tables (rentrees vers le centre)
  ops.furn('penz_furn', 10, 2, 3, 2, 2.5, 8.6); ops.furn('penz_furn', 10, 2, 3, 2, 11.6, 8.6)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres mur du fond
  // === MUR DE BOUTEILLES (3 etageres sombres collees au mur) ===
  ;[3, 7, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)
    ops.item(6, c + 0.5, 2.05); ops.item(57, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05)
    ops.item(58, c + 0.6, 3.05); ops.item(56, c + 1.5, 3.05)
  })
  // === COMPTOIR PLEINE LARGEUR (ligne) — 2 rangs ; on ne peut PAS passer derriere ===
  const bL = 1, bR = COLS - 1
  for (const row of [5.0, 5.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  for (let c = 2; c < bR - 1; c += 2) ops.item([54, 42, 49, 61, 54, 42][((c / 2) | 0) % 6], c + 0.5, 5.05) // chopes/plats sur le bar
  for (let i = 0; i < 6; i++) ops.furn('penz_furn', 12, 1, 1, 1, 2.5 + i * 2, 6.6) // tabourets (boire au bar)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.0)
  // === 2 GRANDES TABLES OVALES A 4 CHAISES (rentrees vers le centre) ===
  ovalSeatA(3.3, 8.1, [54, 26])
  ovalSeatA(11.7, 8.1, [49, 61])
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

// TAVERNE tav_seat_B — 2 grandes tables ovales AEREES (3 chaises chacune : haut FACE, gauche PROFIL flip, droite PROFIL),
// grand espacement, lanes de circulation larges, tables bien decollees des murs/comptoir. Priorite au CONFORT du tour de table.
designs.tav_seat_B = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis sous les 2 tables (avant meubles) — recentres sous chaque table aeree
  ops.furn('penz_furn', 10, 2, 3, 2, 3.0, 8.0); ops.furn('penz_furn', 10, 2, 3, 2, 10.0, 8.0)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres mur du fond
  // === MUR DE BOUTEILLES (3 etageres sombres collees au mur) ===
  ;[3, 7, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)
    ops.item(6, c + 0.5, 2.05); ops.item(57, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05)
    ops.item(58, c + 0.6, 3.05); ops.item(56, c + 1.5, 3.05)
  })
  // (barman Brewen : pose dans le jeu vers la ligne 4.8, derriere le comptoir)
  // === COMPTOIR PLEINE LARGEUR (ligne) — 2 rangs ; on ne peut PAS passer derriere ===
  const bL = 1, bR = COLS - 1
  for (const row of [5.0, 5.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  for (let c = 2; c < bR - 1; c += 2) ops.item([54, 42, 49, 61, 54, 42][((c / 2) | 0) % 6], c + 0.5, 5.05) // chopes/plats sur le bar
  for (let i = 0; i < 6; i++) ops.furn('penz_furn', 12, 1, 1, 1, 2.5 + i * 2, 6.6) // tabourets (boire au bar)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.0)
  // === 2 GRANDES TABLES OVALES AEREES (3 chaises : haut FACE, gauche PROFIL flip, droite PROFIL) ===
  // table 2x2 @ (tx,ty). Chaises decollees ~0.5 tuile (place pour s'asseoir) ; couloir >=1 tuile autour (tour de table).
  const ovalB = (tx, ty, items) => {
    ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.7)               // HAUT : chaise FACE (regarde vers le bas = la table) ~0.3 tuck
    ops.furn('penz_furn', 9, 0, 1, 2, tx - 1.05, ty + 0.15, null, true) // GAUCHE : profil MIROIR (regarde a droite = la table)
    ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                           // table ovale 2x2
    ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.6, ty + 0.55))
    ops.furn('penz_furn', 9, 0, 1, 2, tx + 2.05, ty + 0.15)            // DROITE : profil (regarde a gauche = la table)
  }
  ovalB(3.5, 8.5, [54, 26])   // table gauche (centre col ~4.5) — decollee du mur/lampe
  ovalB(10.5, 8.5, [49, 61])  // table droite (centre col ~11.5) — symetrique
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

designs.tav_seat_C = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 3.0, 8.9); ops.furn('penz_furn', 10, 2, 3, 2, 11.0, 8.9) // tapis sous les tables (recentres)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres mur du fond
  // === MUR DE BOUTEILLES (3 etageres sombres collees au mur) ===
  ;[3, 7, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)
    ops.item(6, c + 0.5, 2.05); ops.item(57, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05)
    ops.item(58, c + 0.6, 3.05); ops.item(56, c + 1.5, 3.05)
  })
  // === COMPTOIR PLEINE LARGEUR (ligne) — 2 rangs ; on ne peut PAS passer derriere ===
  const bL = 1, bR = COLS - 1
  for (const row of [5.0, 5.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  for (let c = 2; c < bR - 1; c += 2) ops.item([54, 42, 49, 61, 54, 42][((c / 2) | 0) % 6], c + 0.5, 5.05) // chopes/plats sur le bar
  for (let i = 0; i < 6; i++) ops.furn('penz_furn', 12, 1, 1, 1, 2.5 + i * 2, 6.6) // tabourets (boire au bar)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.0)
  // === 2 GRANDES TABLES OVALES — banquette HAUT (FACE) + BAS (DOS) seulement ===
  // helper LOCAL : table 2x2 a (tx,ty) ; chaise FACE au-dessus (regarde le bas = la table),
  // chaise DOS en-dessous (regarde le haut = la table). ~1/2 tuile pour s'asseoir, tour complet libre.
  const seatTopBot = (tx, ty, items) => {
    ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 0.95)               // HAUT : chaise FACE (assise vers le bas), tuckee sous le plateau
    ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                            // table ovale 2x2
    ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.6, ty + 0.55))
    ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.5, ty + 0.95)              // BAS : chaise DOS (assise vers le haut), tuckee + couloir sous la table
  }
  seatTopBot(3.5, 8.5, [54, 26])    // table gauche (centre col ~4.5)
  seatTopBot(11.5, 8.5, [49, 61])   // table droite (centre col ~12.5)
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

const which = process.argv[2] || 'tavern_current'
const out = process.argv[3] || '_room.png'
const S = process.argv[4] != null ? +process.argv[4] : 4
if (!designs[which]) { console.error('design inconnu:', which, 'dispo:', Object.keys(designs)); process.exit(1) }
designs[which]()

if (process.env.SCAN) { // R par colonne (centre) sur quelques rangees
  for (const ry of [72, 80, 100]) { const r = []; for (let c = 0; c < COLS; c++) r.push(Math.round(cv[(ry * W + c * 16 + 8) * 4])); console.error('SCAN R row', ry, ':', r.join(' ')) }
}
if (process.env.MARK) { // marqueur ROUGE direct dans cv aux cols 6-8, rows 40-56
  for (let y = 40; y < 56; y++) for (let x = 6 * 16; x < 9 * 16; x++) { const j = (y * W + x) * 4; cv[j] = 255; cv[j + 1] = 0; cv[j + 2] = 0; cv[j + 3] = 255 }
}
// upscale x S -> RGBA8
const oW = W * S, oH = H * S, o = Buffer.alloc(oW * oH * 4)
for (let y = 0; y < oH; y++) for (let x = 0; x < oW; x++) {
  const sx = (x / S) | 0, sy = (y / S) | 0, j = (sy * W + sx) * 4, k = (y * oW + x) * 4
  o[k] = Math.max(0, Math.min(255, cv[j])); o[k + 1] = Math.max(0, Math.min(255, cv[j + 1])); o[k + 2] = Math.max(0, Math.min(255, cv[j + 2])); o[k + 3] = 255
  if (process.env.GRID) { // repere de colonnes (lignes fines tous les TILE, marquee au centre col7)
    if (sx % 16 === 0) { const cl = ((sx / 16) === 7) ? [0, 255, 255] : [60, 200, 255]; const al = ((sx / 16) === 7) ? 0.55 : 0.22; o[k] = o[k] * (1 - al) + cl[0] * al; o[k + 1] = o[k + 1] * (1 - al) + cl[1] * al; o[k + 2] = o[k + 2] * (1 - al) + cl[2] * al }
  }
}
fs.writeFileSync(out, encode(oW, oH, o))
console.error(`OK ${which} -> ${out} (${oW}x${oH})`)
