import loadOpenMPT from './vendor/libopenmpt.worklet.js';
const engine = loadOpenMPT();

class TrackerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = 0;
    this.paused = false;
    this.lastRow = '';
    engine.then(api=>{
      this.api=api;
      this.left=api._malloc(128*4);
      this.right=api._malloc(128*4);
      this.port.postMessage({type:'ready'});
    }).catch(error=>this.port.postMessage({type:'error',message:error.message}));
    this.port.onmessage = ({data}) => {
      try {
        if (data.type==='stop') this.stop();
        if (data.type==='pause') this.paused=data.value;
        if (data.type==='play') {
          this.stop();
          this.playbackId=data.id;
          const bytes = new Uint8Array(data.buffer);
          const ptr = this.api._malloc(bytes.length);
          try {
            this.api.HEAPU8.set(bytes,ptr);
            this.module=this.api._openmpt_module_create_from_memory(ptr,bytes.length,0,0,0);
          } finally { this.api._free(ptr); }
          if (!this.module) throw new Error('Unrecognized or damaged tracker module.');
          this.api._openmpt_module_set_repeat_count(this.module,0);
          this.paused=false;
          this.lastRow='';
          this.port.postMessage({type:'playing',id:this.playbackId});
        }
      } catch(error) { this.stop(); this.port.postMessage({type:'error',id:data.id,message:error.message}); }
    };
  }
  stop() {
    if (this.module) this.api._openmpt_module_destroy(this.module);
    this.module=0;
    this.lastRow='';
  }
  process(inputs,outputs) {
    if (!this.module || this.paused) return true;
    const api=this.api, module=this.module;
    const frames=api._openmpt_module_read_float_stereo(module,sampleRate,128,this.left,this.right);
    if (!frames) { this.stop(); this.port.postMessage({type:'ended',id:this.playbackId}); return true; }
    outputs[0][0].set(api.HEAPF32.subarray(this.left/4,this.left/4+frames));
    outputs[0][1].set(api.HEAPF32.subarray(this.right/4,this.right/4+frames));
    const order=api._openmpt_module_get_current_order(module);
    const pattern=api._openmpt_module_get_current_pattern(module);
    const row=api._openmpt_module_get_current_row(module);
    const key=order+':'+pattern+':'+row;
    if (key!==this.lastRow) {
      this.lastRow=key;
      this.port.postMessage({type:'row',id:this.playbackId,order,pattern,row,audioTime:currentTime,
        bpm:api._openmpt_module_get_current_tempo(module),speed:api._openmpt_module_get_current_speed(module)});
    }
    return true;
  }
}
registerProcessor('giraffe-tracker',TrackerProcessor);
