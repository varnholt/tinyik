import {writeFile} from 'node:fs/promises';

// A small original four-channel ProTracker tune, including a tempo change.
const samples=[new Int8Array(4096),new Int8Array(2048),new Int8Array(512),new Int8Array(64)];
let noise=12345, phase=0;
for(let i=0;i<4096;i++) {
  const t=i/8287;
  phase+=2*Math.PI*(45+110*Math.exp(-t*40))/8287;
  samples[0][i]=Math.round(Math.sin(phase)*120*Math.exp(-t*15));
}
for(let i=0;i<2048;i++) {
  noise=(Math.imul(noise,1664525)+1013904223)|0;
  const t=i/8287, random=noise/2147483648;
  samples[1][i]=Math.round((random*0.8+Math.sin(t*2*Math.PI*180)*0.2)*110*Math.exp(-t*24));
  if(i<512)samples[2][i]=Math.round(random*85*Math.exp(-t*90));
}
for(let i=0;i<64;i++)samples[3][i]=Math.round(Math.sin(i/64*Math.PI*2)*75+Math.sin(i/64*Math.PI*6)*18);
const data=Buffer.alloc(1084+4*1024+samples.reduce((n,s)=>n+s.length,0));
data.write('Little groove',0,'ascii');
for(let i=0;i<4;i++) {
  const at=20+i*30;
  data.write(['Kick','Snare','Hat','Bass'][i],at,'ascii');
  data.writeUInt16BE(samples[i].length/2,at+22);
  data[at+25]=[52,40,24,28][i];
  data.writeUInt16BE(i===3 ? 32 : 1,at+28);
}
data[950]=4;
for(let i=0;i<4;i++)data[952+i]=i;
data.write('M.K.',1080,'ascii');
function note(pattern,row,channel,sample,period,effect=0,value=0) {
  const at=1084+pattern*1024+(row*4+channel)*4;
  data[at]=(sample&0xf0)|(period>>8);
  data[at+1]=period&255;
  data[at+2]=(sample&15)<<4|effect;
  data[at+3]=value;
}
const roots=[856,678,762,570];
for(let p=0;p<4;p++)for(let row=0;row<64;row++) {
  if(row%8===0 || row%16===14)note(p,row,0,1,428);
  if(row%8===4)note(p,row,1,2,428);
  if(row%2===0)note(p,row,2,3,428);
  if(row%4===0)note(p,row,3,4,roots[(Math.floor(row/16)+p)%4],0,0x37);
  if(row===0)note(p,row,0,1,428,15,p===2 ? 150 : 125);
}
let offset=1084+4*1024;
for(const sample of samples){data.set(new Uint8Array(sample.buffer),offset);offset+=sample.length;}
await writeFile('web/dance/little-groove.mod',data);
console.log('Wrote the dance demo.');
