import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const cores=process.argv.includes('--rust-only') ? ['rust'] : ['rust','cpp'];
const apis=[];
for(const core of cores) {
  const {instance}=await WebAssembly.instantiate(await readFile(`web/tinyik-${core}.wasm`),{
    env:{emscripten_notify_memory_growth(){}},wasi_snapshot_preview1:{proc_exit(code){throw Error(`exit ${code}`);}}
  });
  const api=instance.exports;
  api._initialize?.();
  apis.push(api);
  for(let l=-10;l<=10;l++) for(let p=0;p<=10;p++) {
    assert.equal(api.pose(l/10,p/10),1);
    const data=new Float32Array(api.memory.buffer,api.joints_ptr(),51);
    assert.ok(data.every(Number.isFinite));
    const dist=(a,b)=>Math.hypot(...[0,1,2].map(i=>data[a*3+i]-data[b*3+i]));
    for(let leg=0;leg<4;leg++) {
      assert.ok(Math.abs(dist(leg*3,leg*3+1)-0.695)<1e-6);
      assert.ok(Math.abs(dist(leg*3+1,leg*3+2)-0.695)<1e-6);
      assert.ok(Math.abs(data[leg*9+1]-0.84)<1e-6);
    }
    for(let i=12;i<16;i++) assert.ok(Math.abs(dist(i,i+1)-0.52)<1e-6);
  }
  const before=[...new Float32Array(api.memory.buffer,api.joints_ptr(),51)];
  assert.equal(api.pose(NaN,0),0);
  assert.deepEqual([...new Float32Array(api.memory.buffer,api.joints_ptr(),51)],before);
  console.log(`${core} WASM: 231 poses, lengths, fixed feet and invalid input passed.`);
}
if(apis.length===2) for(const l of [-1,-0.25,0,0.25,1]) for(const p of [0,0.5,1]) {
  const buffers=apis.map(api=>{api.pose(l,p);return [...new Float32Array(api.memory.buffer,api.joints_ptr(),51)];});
  assert.ok(buffers[0].every((v,i)=>Math.abs(v-buffers[1][i])<2e-6),'WASM core parity');
}
