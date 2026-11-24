'use strict';

// Optional tracker-music demo. Everything it needs lives in web/dance/; delete
// that folder and the `dance` lines in app.js and index.html to remove it.

const NECK_ROOT = 12, HEAD = 16; // Joint indices in the 17-joint pose.

// One nod per beat (four rows), timed by the row clock reported from the audio thread.
window.giraffeDanceMotion = function (clock, time) {
  if (!clock) return null;
  const rowDuration = clock.speed*2.5/clock.bpm; // A ProTracker tick lasts 2.5/BPM seconds.
  const elapsed = time-clock.audioTime;
  if (elapsed > Math.max(1,rowDuration*3)) return null; // Stale clock: stop dancing.
  // audioTime is when the row was rendered; time is what is audible now, so the
  // elapsed time may be negative while output latency is still playing earlier rows.
  const beats = (clock.row+elapsed/rowDuration)/4;
  const phase = beats-Math.floor(beats);
  const stroke = phase<0.4 ? 0.5+0.5*Math.cos(Math.PI*phase/0.4)
    : phase>0.5 ? 0.5-0.5*Math.cos(Math.PI*(phase-0.5)/0.5) : 0;
  return {neck:stroke*0.27, bounce:stroke*0.09, lean:0.025*Math.sin(Math.PI*beats)};
};

window.createGiraffeDance = function () {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const section = document.createElement('section');
  section.className = 'controls';
  section.style.paddingTop = '0';
  section.setAttribute('aria-label','Dance to tracker music');
  section.innerHTML = '<button type="button">Play tracker demo</button>'
    +'<button type="button">Choose module</button>'
    +'<input type="file" accept=".mod,.xm,.s3m,.it,.mptm" hidden>'
    +'<p role="status" style="flex-basis:100%;margin:0;font-size:12px;color:#64756a">'
    +'Tracker modules (MOD, XM, S3M, IT) make the giraffe dance. Audio stays in your browser.</p>';
  document.querySelector('footer').before(section);
  const [demo,pick] = section.querySelectorAll('button');
  const file = section.querySelector('input');
  const status = section.querySelector('p');

  let context, node, nodeReady, clock = null, playing = false, id = 0;
  let envelope = 0, held = null, last = performance.now()/1000;

  function engine() {
    context ??= new AudioContext();
    nodeReady ??= (async () => {
      await context.audioWorklet.addModule('dance/worklet.js');
      const created = new AudioWorkletNode(context,'giraffe-tracker',{numberOfInputs:0,outputChannelCount:[2]});
      await new Promise((resolve,reject) => {
        created.port.onmessage = ({data}) => data.type==='ready' ? resolve() : reject(new Error(data.message));
        created.onprocessorerror = () => reject(new Error('The tracker engine stopped.'));
      });
      created.port.onmessage = ({data}) => {
        if (data.id!==id) return;
        if (data.type==='row') clock = data;
        if (data.type==='ended') stop('Finished. Play the demo or choose another module.');
        if (data.type==='error') stop('Could not play the module. '+data.message);
      };
      created.connect(context.destination);
      return node = created;
    })().catch(error => { nodeReady = null; throw error; });
    return Promise.all([nodeReady,context.resume()]);
  }

  function stop(message) {
    id++;
    playing = false;
    clock = null;
    node?.port.postMessage({type:'stop'});
    demo.textContent = 'Play tracker demo';
    status.textContent = message;
  }

  async function play(bytes,name) {
    stop('Loading '+name+'...');
    const request = id;
    demo.disabled = pick.disabled = true;
    try {
      const [[loaded],buffer] = await Promise.all([engine(),bytes]);
      if (request!==id) return;
      loaded.port.postMessage({type:'play',id,buffer},[buffer]);
      playing = true;
      demo.textContent = 'Stop music';
      status.textContent = name+(reducedMotion ? ' · Reduced motion is on, so the giraffe stays still.' : ' · Dancing to the tracker rows.');
    } catch (error) {
      if (request===id) stop('Could not play '+name+'. '+error.message);
    } finally { demo.disabled = pick.disabled = false; }
  }

  demo.addEventListener('click',() => {
    if (playing) { stop('Stopped.'); return; }
    play(fetch('dance/little-groove.mod').then(r => {
      if (!r.ok) throw new Error('Demo unavailable.');
      return r.arrayBuffer();
    }),'Little groove');
  });
  pick.addEventListener('click',() => file.click());
  file.addEventListener('change',() => {
    const selected = file.files[0];
    file.value = ''; // Allow choosing the same module again.
    if (selected) play(selected.arrayBuffer(),selected.name);
  });
  window.addEventListener('pagehide',() => { stop(''); void context?.close(); });

  return {
    // Returns null when idle, otherwise lean/bounce offsets and a neck pitch.
    sample() {
      const now = performance.now()/1000, dt = Math.min(now-last,0.25);
      last = now;
      const time = context ? (context.getOutputTimestamp?.().contextTime || context.currentTime-context.baseLatency) : 0;
      const motion = playing && !reducedMotion ? giraffeDanceMotion(clock,time) : null;
      // Fade in and out so starting, stopping or a stale clock never snaps the pose.
      if (motion) held = motion;
      envelope += ((motion ? 1 : 0)-envelope)*(1-Math.exp(-dt*8));
      if (envelope<0.001 || !held) { envelope = 0; return null; }
      return {neck:held.neck*envelope, bounce:held.bounce*envelope, lean:held.lean*envelope};
    },
    // Rigidly pitch the solved neck about its root; link lengths stay unchanged.
    bendNeck(pose,angle) {
      const x0 = pose[NECK_ROOT*3], y0 = pose[NECK_ROOT*3+1];
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      for (let i=NECK_ROOT+1;i<=HEAD;i++) {
        const x = pose[i*3]-x0, y = pose[i*3+1]-y0;
        pose[i*3] = x0+x*cosine+y*sine;
        pose[i*3+1] = y0-x*sine+y*cosine;
      }
    }
  };
};
