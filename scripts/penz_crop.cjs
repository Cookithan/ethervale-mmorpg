// Outil jetable : décode un PNG, recadre (sy,sh) et zoome (x S) avec une GRILLE de tuiles 16px
// pour repérer visuellement les rects de tuiles. Usage : node scripts/penz_crop.js <file> [sy] [sh] [scale] [out]
const fs = require('fs')
const zlib = require('zlib')

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
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 4
  const bpp = ch * (bd / 8), stride = W * bpp
  const px = Buffer.alloc(H * stride)
  const pth = (a, b2, c) => { const p = a + b2 - c, A = Math.abs(p - a), B = Math.abs(p - b2), C = Math.abs(p - c); return A <= B && A <= C ? a : B <= C ? b2 : c }
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
const CT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]) }
function encode(W, H, rgba) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6
  const raw = Buffer.alloc(H * (1 + W * 4)); let p = 0
  for (let y = 0; y < H; y++) { raw[p++] = 0; for (let x = 0; x < W * 4; x++) raw[p++] = rgba[y * W * 4 + x] }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const [, , file, sy0, sh0, scale0, out0] = process.argv
const d = decode(file)
const sy = sy0 != null ? +sy0 : 0
const sh = sh0 != null ? +sh0 : d.H
const S = scale0 != null ? +scale0 : 4
const out = out0 || '_crop.png'
const oW = d.W * S, oH = sh * S
const o = Buffer.alloc(oW * oH * 4)
for (let y = 0; y < oH; y++) {
  for (let x = 0; x < oW; x++) {
    const sx = (x / S) | 0, yy = sy + ((y / S) | 0)
    const i = yy * d.stride + sx * d.bpp, j = (y * oW + x) * 4
    o[j] = d.px[i]; o[j + 1] = d.px[i + 1]; o[j + 2] = d.px[i + 2]; o[j + 3] = d.ch === 4 ? d.px[i + 3] : 255
    if (sx % 16 === 0 || yy % 16 === 0) { o[j] = 0; o[j + 1] = 230; o[j + 2] = 230; o[j + 3] = 200 } // grille cyan = bords de tuiles
  }
}
fs.writeFileSync(out, encode(oW, oH, o))
console.log(`${file}: ${d.W}x${d.H} = ${d.W / 16}col x ${d.H / 16}rang (tuiles 16px). Recadre y[${sy}..${sy + sh}] x${S} -> ${out}`)
