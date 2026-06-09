// Aperçu GRILLÉ d'un tileset : upscale + lignes par tuile (épaisses tous les 5) pour LIRE les indices.
// Usage : node scripts/tile_grid.cjs <src.png> <out.png> [tile=16] [scale=10]
const fs = require('fs'), zlib = require('zlib')
function decode(p){const b=fs.readFileSync(p);let o=8,W,H,ct,bd;const idat=[];while(o<b.length){const len=b.readUInt32BE(o);const t=b.toString('ascii',o+4,o+8);const d=b.slice(o+8,o+8+len);if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);bd=d[8];ct=d[9]}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;o+=12+len}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:ct===0?1:4;const bpp=ch*(bd/8),stride=W*bpp;const px=Buffer.alloc(H*stride);const pth=(a,b2,c)=>{const q=a+b2-c,A=Math.abs(q-a),B=Math.abs(q-b2),C=Math.abs(q-c);return A<=B&&A<=C?a:B<=C?b2:c};let pos=0;for(let y=0;y<H;y++){const f=raw[pos++];for(let x=0;x<stride;x++){const v=raw[pos++];const L=x>=bpp?px[y*stride+x-bpp]:0;const U=y>0?px[(y-1)*stride+x]:0;const UL=(x>=bpp&&y>0)?px[(y-1)*stride+x-bpp]:0;let r;if(f===0)r=v;else if(f===1)r=v+L;else if(f===2)r=v+U;else if(f===3)r=v+((L+U)>>1);else r=v+pth(L,U,UL);px[y*stride+x]=r&255}}return{W,H,ch,bpp,stride,px}}
function sample(img,x,y){if(x<0||y<0||x>=img.W||y>=img.H)return[0,0,0,0];const i=y*img.stride+x*img.bpp;if(img.ch===4)return[img.px[i],img.px[i+1],img.px[i+2],img.px[i+3]];if(img.ch===3)return[img.px[i],img.px[i+1],img.px[i+2],255];return[img.px[i],img.px[i],img.px[i],255]}
const CT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})()
const crc=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=CT[(c^b[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
const chunk=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const t=Buffer.from(ty);const cr=Buffer.alloc(4);cr.writeUInt32BE(crc(Buffer.concat([t,d])));return Buffer.concat([l,t,d,cr])}
function encode(W,H,rgba){const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const raw=Buffer.alloc(H*(1+W*4));let p=0;for(let y=0;y<H;y++){raw[p++]=0;for(let x=0;x<W*4;x++)raw[p++]=rgba[y*W*4+x]}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}

// mini-police 3x5 pour les chiffres (et 'x')
const GLYPH={
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],
 '3':['111','001','111','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
 '6':['111','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],
 '9':['111','101','111','001','111'],',':['000','000','000','010','100']}
function drawText(o,W,H,str,px,py,col){let cx=px;for(const ch of str){const g=GLYPH[ch];if(!g){cx+=4;continue}for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++){if(g[yy][xx]==='1'){const X=cx+xx,Y=py+yy;if(X>=0&&Y>=0&&X<W&&Y<H){const j=(Y*W+X)*4;o[j]=col[0];o[j+1]=col[1];o[j+2]=col[2];o[j+3]=255}}}cx+=4}}

const src=process.argv[2], out=process.argv[3], TILE=+(process.argv[4]||16), S=+(process.argv[5]||10)
const full=decode(src)
const fullCols=Math.floor(full.W/TILE)
// crop optionnel : env CROP="c0,r0,cw,rh" (tuiles) -> on ne grille qu'une sous-région, mais les frame# restent absolus
let C0=0,R0=0,cropCols=Math.floor(full.W/TILE),cropRows=Math.floor(full.H/TILE)
if(process.env.CROP){const[a,b,c,d]=process.env.CROP.split(',').map(Number);C0=a;R0=b;cropCols=c;cropRows=d}
const img={W:cropCols*TILE,H:cropRows*TILE,ch:full.ch,bpp:full.bpp,stride:full.stride,
 px:null,_off:{x:C0*TILE,y:R0*TILE}}
// wrapper sample décalé
const origSample=sample
const sampleC=(im,x,y)=>origSample(full,x+C0*TILE,y+R0*TILE)
const cols=cropCols, rows=cropRows
const W=img.W*S, H=img.H*S
const o=Buffer.alloc(W*H*4)
// fond damier sombre pour voir les zones transparentes
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const j=(y*W+x)*4;const chk=((Math.floor(x/(S*2))+Math.floor(y/(S*2)))&1)?0x22:0x18;o[j]=chk;o[j+1]=chk;o[j+2]=chk+4;o[j+3]=255}
// blit upscale
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const s=sampleC(img,Math.floor(x/S),Math.floor(y/S));const a=s[3]/255;if(a<=0)continue;const j=(y*W+x)*4;o[j]=s[0]*a+o[j]*(1-a);o[j+1]=s[1]*a+o[j+1]*(1-a);o[j+2]=s[2]*a+o[j+2]*(1-a);o[j+3]=255}
// lignes de grille
function vline(cx,col){for(let y=0;y<H;y++){const j=(y*W+Math.min(cx,W-1))*4;o[j]=col[0];o[j+1]=col[1];o[j+2]=col[2];o[j+3]=255}}
function hline(cy,col){for(let x=0;x<W;x++){const j=(Math.min(cy,H-1)*W+x)*4;o[j]=col[0];o[j+1]=col[1];o[j+2]=col[2];o[j+3]=255}}
for(let c=0;c<=cols;c++){const thick=(c%5===0);const col=thick?[255,60,60]:[90,90,120];const px=c*TILE*S;vline(px,col);if(thick){vline(px+1,col);vline(px-1>=0?px-1:0,col)}}
for(let r=0;r<=rows;r++){const thick=(r%5===0);const col=thick?[255,60,60]:[90,90,120];const py=r*TILE*S;hline(py,col);if(thick){hline(py+1,col);hline(py-1>=0?py-1:0,col)}}
// numéro de frame (row*cols+col) en haut-gauche de chaque tuile, + (col,row) en dessous
function drawBig(str,px,py,col,sc){let cx=px;for(const ch of str){const g=GLYPH[ch];if(!g){cx+=4*sc;continue}for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++){if(g[yy][xx]==='1')for(let a=0;a<sc;a++)for(let b=0;b<sc;b++){const X=cx+xx*sc+a,Y=py+yy*sc+b;if(X>=0&&Y>=0&&X<W&&Y<H){const j=(Y*W+X)*4;o[j]=col[0];o[j+1]=col[1];o[j+2]=col[2];o[j+3]=255}}}cx+=4*sc}}
const sc=Math.max(1,Math.floor(S/5))
for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const idx=(r+R0)*fullCols+(c+C0);const bx=c*TILE*S+2,by=r*TILE*S+2;
 // fond noir derrière le texte pour lisibilité
 const tw=String(idx).length*4*sc, th=5*sc;
 for(let yy=-1;yy<=th;yy++)for(let xx=-1;xx<=tw;xx++){const X=bx+xx,Y=by+yy;if(X>=0&&Y>=0&&X<W&&Y<H){const j=(X+Y*W)*4;o[j]=0;o[j+1]=0;o[j+2]=0;o[j+3]=255}}
 drawBig(String(idx),bx,by,[255,230,80],sc)
 drawText(o,W,H,(c+C0)+','+(r+R0),bx,by+th+2,[120,200,255])}
fs.writeFileSync(out,encode(W,H,o))
console.error(`OK ${out}  ${cols}x${rows} tuiles (TILE=${TILE}), scale=${S}, jaune=frame#, bleu=col,row`)
