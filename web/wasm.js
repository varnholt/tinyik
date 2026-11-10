'use strict';
// Both native implementations export the same small WASM interface.
// There is no JavaScript copy of either IK solver.
window.loadTinyIK = async function (core) {
  const response=await fetch(`tinyik-${core}.wasm`);
  if(!response.ok) throw new Error(`Cannot load ${core} core. Build WASM and serve web/ over HTTP.`);
  const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{
    env:{emscripten_notify_memory_growth(){}},
    wasi_snapshot_preview1:{proc_exit(code){throw new Error(`WASM exit ${code}`);}}
  });
  const api=instance.exports;
  api._initialize?.();
  return {
    makePose(lean,press) {
      if(api.pose(lean,press)!==1) throw new Error('Invalid pose input');
      // Borrowed view: consume before another call or memory growth.
      return new Float32Array(api.memory.buffer,api.joints_ptr(),51);
    }
  };
};
