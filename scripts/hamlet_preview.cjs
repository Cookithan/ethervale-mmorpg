// Aperçu hors-jeu du HAMEAU ABANDONNÉ : compose les PNG extraits aux MÊMES offsets que GameScene.spawnAbandonedHamlet
// (origine bas-centre, tri par baseY). Anti placement-à-l'aveugle. -> Brief/_hamlet.png
const fs=require('fs'), zlib=require('zlib')
function decode(p){const b=fs.readFileSync(p);let o=8,W,H,ct,bd;const idat=[];while(o<b.length){const len=b.readUInt32BE(o);const t=b.toString('ascii',o+4,o+8);const d=b.slice(o+8,o+8+len);if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);bd=d[8];ct=d[9]}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;o+=12+len}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:ct===0?1:4;const bpp=ch*(bd/8),stride=W*bpp;const px=Buffer.alloc(H*stride);const pth=(a,b2,c)=>{const q=a+b2-c,A=Math.abs(q-a),B=Math.abs(q-b2),C=Math.abs(q-c);return A<=B&&A<=C?a:B<=C?b2:c};let pos=0;for(let y=0;y<H;y++){const f=raw[pos++];for(let x=0;x<stride;x++){const v=raw[pos++];const L=x>=bpp?px[y*stride+x-bpp]:0;const U=y>0?px[(y-1)*stride+x]:0;const UL=(x>=bpp&&y>0)?px[(y-1)*stride+x-bpp]:0;let r;if(f===0)r=v;else if(f===1)r=v+L;else if(f===2)r=v+U;else if(f===3)r=v+((L+U)>>1);else r=v+pth(L,U,UL);px[y*stride+x]=r&255}}return{W,H,ch,bpp,stride,px}}
function sample(img,x,y){if(x<0||y<0||x>=img.W||y>=img.H)return[0,0,0,0];const i=y*img.stride+x*img.bpp;if(img.ch===4)return[img.px[i],img.px[i+1],img.px[i+2],img.px[i+3]];return[img.px[i],img.px[i+1],img.px[i+2],255]}
const CT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})()
const crc=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=CT[(c^b[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
const chunk=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const t=Buffer.from(ty);const cr=Buffer.alloc(4);cr.writeUInt32BE(crc(Buffer.concat([t,d])));return Buffer.concat([l,t,d,cr])}
function encode(W,H,rgba){const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const raw=Buffer.alloc(H*(1+W*4));let p=0;for(let y=0;y<H;y++){raw[p++]=0;for(let x=0;x<W*4;x++)raw[p++]=rgba[y*W*4+x]}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}

const A='public/assets/deco/aband/'
const cache={}
const tex=n=>cache[n]||(cache[n]=decode(A+n+'.png'))
const TILE=16, S=2
// centre hameau au milieu du canvas
const HTX=15, HTY=14, COLS=32, ROWS=30
const W=COLS*TILE*S, H=ROWS*TILE*S
const o=Buffer.alloc(W*H*4)
// fond forêt + clairière assombrie
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const j=(y*W+x)*4;o[j]=0x38;o[j+1]=0x74;o[j+2]=0x34;o[j+3]=255}
const ccx=(HTX+0.5)*TILE*S, ccy=(HTY+0.5)*TILE*S, R=9*TILE*S
for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(Math.hypot(x-ccx,y-ccy)<R){const j=(y*W+x)*4;o[j]=0x35*0.7+o[j]*0.3;o[j+1]=0x40*0.7+o[j+1]*0.3;o[j+2]=0x2c*0.7+o[j+2]*0.3}}
function blit(name,tx,ty,wT,hT,tint){const im=tex(name);const baseY=(ty+hT)*TILE,cxp=(tx+wT/2)*TILE;
 const dx0=Math.round(cxp*S-im.W*S/2), dy0=Math.round(baseY*S-im.H*S)
 for(let y=0;y<im.H*S;y++)for(let x=0;x<im.W*S;x++){const s=sample(im,Math.floor(x/S),Math.floor(y/S));let a=s[3]/255;if(a<=0)continue;const X=dx0+x,Y=dy0+y;if(X<0||Y<0||X>=W||Y>=H)continue;let r=s[0],g=s[1],b=s[2];if(tint){r=r*((tint>>16&255)/255);g=g*((tint>>8&255)/255);b=b*((tint&255)/255)}const j=(Y*W+X)*4;o[j]=r*a+o[j]*(1-a);o[j+1]=g*a+o[j+1]*(1-a);o[j+2]=b*a+o[j+2]*(1-a)}}
const T=0xcfd2c6
// liste = miroir de spawnAbandonedHamlet (dx,dy = offset tuile depuis HTX,HTY), name, wT, hT  -> trié par baseY
const items=[]
const add=(dx,dy,n,w,h,ti)=>items.push({tx:HTX+dx,ty:HTY+dy,n,w,h,ti:ti==null?T:ti})
// arbres-anneau d'abord (fond)
for(let a=0;a<12;a++){const tx=Math.round(HTX+Math.cos(a/12*Math.PI*2)*8),ty=Math.round(HTY+Math.sin(a/12*Math.PI*2)*8);add(tx-HTX-1,ty-HTY-2,a%2?'tree_a':'tree_b',4,3)}
add(-1,-4,'manor',4,5); add(3,-1,'house_big',4,3); add(-5,0,'house_win',2,3); add(1,3,'house_door',2,3); add(-4,3,'cabin',3,2); add(5,-5,'tower',3,6)
add(0,0,'idol',2,3); add(-2,-1,'stones',3,3); add(2,1,'stump',3,4)
for(let i=0;i<3;i++)add(-3+i*2,5,'fence',3,2)
for(const[dx,dy]of[[-3,-3],[4,2],[-1,4],[3,-3],[-5,3]])add(dx,dy,'logs',3,1)
for(const[dx,dy]of[[-2,2],[2,-2],[-4,-2],[5,1],[0,3],[-1,-3]])add(dx,dy,'bush',3,2)
add(-7,-6,'cave_green',4,3,0xbfc4ba); add(8,6,'cave_orange',3,3,0xbfc4ba)
items.sort((a,b)=>((a.ty+a.h)-(b.ty+b.h)))
for(const it of items)blit(it.n,it.tx,it.ty,it.w,it.h,it.ti)
fs.writeFileSync('Brief/_hamlet.png',encode(W,H,o))
console.error('Brief/_hamlet.png',W+'x'+H)
