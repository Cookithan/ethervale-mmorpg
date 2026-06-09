// Extrait des structures (rect px) d'un tileset -> PNG autonomes TRIMÉS (alpha). + un montage de contrôle.
// Édite BOXES puis : node scripts/extract_props.cjs
const fs=require('fs'), zlib=require('zlib'), path=require('path')
function decode(p){const b=fs.readFileSync(p);let o=8,W,H,ct,bd;const idat=[];while(o<b.length){const len=b.readUInt32BE(o);const t=b.toString('ascii',o+4,o+8);const d=b.slice(o+8,o+8+len);if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);bd=d[8];ct=d[9]}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;o+=12+len}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:ct===0?1:4;const bpp=ch*(bd/8),stride=W*bpp;const px=Buffer.alloc(H*stride);const pth=(a,b2,c)=>{const q=a+b2-c,A=Math.abs(q-a),B=Math.abs(q-b2),C=Math.abs(q-c);return A<=B&&A<=C?a:B<=C?b2:c};let pos=0;for(let y=0;y<H;y++){const f=raw[pos++];for(let x=0;x<stride;x++){const v=raw[pos++];const L=x>=bpp?px[y*stride+x-bpp]:0;const U=y>0?px[(y-1)*stride+x]:0;const UL=(x>=bpp&&y>0)?px[(y-1)*stride+x-bpp]:0;let r;if(f===0)r=v;else if(f===1)r=v+L;else if(f===2)r=v+U;else if(f===3)r=v+((L+U)>>1);else r=v+pth(L,U,UL);px[y*stride+x]=r&255}}return{W,H,ch,bpp,stride,px}}
function sample(img,x,y){if(x<0||y<0||x>=img.W||y>=img.H)return[0,0,0,0];const i=y*img.stride+x*img.bpp;if(img.ch===4)return[img.px[i],img.px[i+1],img.px[i+2],img.px[i+3]];if(img.ch===3)return[img.px[i],img.px[i+1],img.px[i+2],255];return[img.px[i],img.px[i],img.px[i],255]}
const CT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})()
const crc=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=CT[(c^b[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
const chunk=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const t=Buffer.from(ty);const cr=Buffer.alloc(4);cr.writeUInt32BE(crc(Buffer.concat([t,d])));return Buffer.concat([l,t,d,cr])}
function encode(W,H,rgba){const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const raw=Buffer.alloc(H*(1+W*4));let p=0;for(let y=0;y<H;y++){raw[p++]=0;for(let x=0;x<W*4;x++)raw[p++]=rgba[y*W*4+x]}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}

const SRC='Full_Asset/Ninja Adventure - Asset Pack/Backgrounds/Tilesets/TilesetVillageAbandoned.png'
const OUT='public/assets/deco/aband/'
const img=decode(SRC)
// name, x, y, w, h (px). T=16.
const T=16
const BOXES=[
 {n:'cave_green',  c:0, r:0, w:4, h:3},
 {n:'cave_orange', c:4, r:0, w:3, h:3},
 {n:'house_win',   c:11,r:0, w:2, h:3},
 {n:'house_door',  c:11,r:3, w:2, h:3},
 {n:'tower',       c:13,r:0, w:3, h:6},
 {n:'cabin',       c:16,r:0, w:3, h:2},
 {n:'manor',       c:11,r:6, w:4, h:5},
 {n:'house_big',   c:16,r:7, w:4, h:3},
 {n:'idol',        c:0, r:3, w:2, h:3},
 {n:'stones',      c:1, r:3, w:3, h:3},
 {n:'tree_a',      c:0, r:6, w:4, h:3},
 {n:'tree_b',      c:0, r:9, w:4, h:3},
 {n:'stump',       c:7, r:8, w:3, h:4},
 {n:'log_v',       c:5, r:6, w:1, h:6},
 {n:'bush',        c:6, r:3, w:3, h:2},
 {n:'fence',       c:7, r:0, w:3, h:2},
 {n:'logs',        c:16,r:6, w:3, h:1},
]
function crop(box){const x=box.c*T,y=box.r*T,w=box.w*T,h=box.h*T;
 // trim alpha
 let minx=w,miny=h,maxx=-1,maxy=-1
 for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const s=sample(img,x+xx,y+yy);if(s[3]>8){if(xx<minx)minx=xx;if(xx>maxx)maxx=xx;if(yy<miny)miny=yy;if(yy>maxy)maxy=yy}}
 if(maxx<0)return{W:1,H:1,buf:Buffer.alloc(4)}
 const ow=maxx-minx+1, oh=maxy-miny+1, buf=Buffer.alloc(ow*oh*4)
 for(let yy=0;yy<oh;yy++)for(let xx=0;xx<ow;xx++){const s=sample(img,x+minx+xx,y+miny+yy);const j=(yy*ow+xx)*4;buf[j]=s[0];buf[j+1]=s[1];buf[j+2]=s[2];buf[j+3]=s[3]}
 return{W:ow,H:oh,buf}
}
fs.mkdirSync(OUT,{recursive:true})
const crops=[]
for(const b of BOXES){const c=crop(b);fs.writeFileSync(OUT+b.n+'.png',encode(c.W,c.H,c.buf));crops.push({n:b.n,c});console.error('  '+b.n+'  '+c.W+'x'+c.H)}
// montage de contrôle (zoom 3, fond damier) en grille
const S=3, PAD=10, perRow=6
let colW=0,rowH=0;crops.forEach(o=>{colW=Math.max(colW,o.c.W*S);rowH=Math.max(rowH,o.c.H*S)})
const cellW=colW+PAD*2, cellH=rowH+PAD*2+18
const rowsN=Math.ceil(crops.length/perRow)
const MW=cellW*perRow, MH=cellH*rowsN
const mo=Buffer.alloc(MW*MH*4)
for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const j=(y*MW+x)*4;const chk=((Math.floor(x/8)+Math.floor(y/8))&1)?0x2a:0x1e;mo[j]=chk;mo[j+1]=chk;mo[j+2]=chk+6;mo[j+3]=255}
crops.forEach((o,i)=>{const cx=(i%perRow)*cellW+PAD, cy=Math.floor(i/perRow)*cellH+PAD+16;
 for(let y=0;y<o.c.H*S;y++)for(let x=0;x<o.c.W*S;x++){const s=sample({W:o.c.W,H:o.c.H,ch:4,bpp:4,stride:o.c.W*4,px:o.c.buf},Math.floor(x/S),Math.floor(y/S));const a=s[3]/255;if(a<=0)continue;const X=cx+x,Y=cy+y;if(X>=MW||Y>=MH)continue;const j=(Y*MW+X)*4;mo[j]=s[0]*a+mo[j]*(1-a);mo[j+1]=s[1]*a+mo[j+1]*(1-a);mo[j+2]=s[2]*a+mo[j+2]*(1-a);mo[j+3]=255}})
fs.writeFileSync('Brief/_aband_montage.png',encode(MW,MH,mo))
console.error('montage -> Brief/_aband_montage.png')
