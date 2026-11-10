'use strict';

// The host has three jobs: read controls, calculate joints, draw one triangle.
(async function main() {
  const canvas = document.getElementById('scene');
  const error = document.getElementById('error');
  function fail(message) { error.textContent = message; error.hidden = false; }
  const gl = canvas.getContext('webgl2',{antialias:false,alpha:false});
  if (!gl) { fail('This preview requires WebGL 2 / OpenGL ES 3.0.'); return; }

  try {
    const coreControl = document.getElementById('core');
    const initialCore = new URLSearchParams(location.search).get('core')==='cpp' ? 'cpp' : 'rust';
    coreControl.value = initialCore;
    let solver = await loadTinyIK(initialCore);
    // build.py embeds these sources for the double-clickable standalone preview.
    async function source(name) {
      if (window.GIRAFFE_SHADERS) return window.GIRAFFE_SHADERS[name];
      const response = await fetch('shaders/'+name);
      if (!response.ok) throw new Error('Cannot load shader: '+name);
      return response.text();
    }
    function compile(type,source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const sources = await Promise.all([source('fullscreen.vert'),source('giraffe.frag')]);
    const program = gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,sources[0]));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,sources[1]));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    const uniform = name => gl.getUniformLocation(program,name);
    const locations = {resolution:uniform('uResolution'),orbit:uniform('uOrbit'),
      joints:uniform('uJoints[0]'),press:uniform('uPress'),strings:uniform('uStrings')};

    const lean = document.getElementById('lean');
    const press = document.getElementById('press');
    const strings = document.getElementById('strings');
    let pressed = false;
    let amount = 0;
    let velocity = 0;
    let yaw = 0.74;
    let elevation = 0.08;
    let drag = null;
    let dirty = true;
    coreControl.addEventListener('change',async () => {
      coreControl.disabled = true;
      try { solver=await loadTinyIK(coreControl.value); error.hidden=true; dirty=true; }
      catch(e) { fail(e.message); }
      finally { coreControl.disabled=false; }
    });
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function setPressed(value) {
      pressed = value;
      press.setAttribute('aria-pressed',String(value));
      press.textContent = value ? 'Release base' : 'Press base';
      dirty = true;
    }
    // A toggle works equally well with mouse, touch, Space, and Enter.
    press.addEventListener('click',() => setPressed(!pressed));
    lean.addEventListener('input',() => {
      document.getElementById('lean-value').value = Math.round(Number(lean.value)*100)+'%';
      dirty = true;
    });
    strings.addEventListener('change',() => { dirty = true; });
    canvas.addEventListener('pointerdown',e => {
      drag = [e.clientX,e.clientY];
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e => {
      if (!drag) return;
      yaw -= (e.clientX-drag[0])*0.008;
      elevation = Math.max(-0.10,Math.min(0.65,elevation+(e.clientY-drag[1])*0.005));
      drag = [e.clientX,e.clientY];
      dirty = true;
    });
    canvas.addEventListener('pointerup',() => { drag = null; });
    canvas.addEventListener('pointercancel',() => { drag = null; });
    canvas.addEventListener('lostpointercapture',() => { drag = null; });
    new ResizeObserver(() => { dirty = true; }).observe(canvas);
    canvas.addEventListener('webglcontextlost',e => {
      e.preventDefault(); fail('The graphics context was lost. Reload to restart the preview.');
    });

    let previous = 0;
    function frame(now) {
      const dt = Math.min((now-previous)/1000,1.0);
      previous = now;
      const target = pressed ? 1 : 0;
      const moving = Math.abs(target-amount)>0.0001 || Math.abs(velocity)>0.0001;
      if (moving) {
        // Exact damped-spring solution: the return speed does not depend on FPS.
        if (reducedMotion) { amount=target; velocity=0; }
        else {
          const displacement=amount-target;
          const frequency=Math.sqrt(95-7*7);
          const decay=Math.exp(-7*dt);
          const cosine=Math.cos(frequency*dt), sine=Math.sin(frequency*dt);
          amount=target+decay*(displacement*cosine+(velocity+7*displacement)/frequency*sine);
          velocity=decay*(velocity*cosine-(7*velocity+95*displacement)/frequency*sine);
        }
        dirty = true;
      }
      if (dirty) {
        // A modest render resolution keeps ray marching comfortable on laptops.
        const scale = Math.min(window.devicePixelRatio || 1,1.25,1100/canvas.clientWidth);
        const width = Math.max(1,Math.round(canvas.clientWidth*scale));
        const height = Math.max(1,Math.round(canvas.clientHeight*scale));
        if (canvas.width!==width || canvas.height!==height) { canvas.width=width; canvas.height=height; }
        gl.viewport(0,0,width,height);
        gl.uniform2f(locations.resolution,width,height);
        gl.uniform2f(locations.orbit,yaw,elevation);
        const pose = solver.makePose(Number(lean.value),amount);
        gl.uniform3fv(locations.joints,pose);
        gl.uniform1f(locations.press,Math.max(0,Math.min(1,amount)));
        gl.uniform1i(locations.strings,strings.checked ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES,0,3);
        dirty = false;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (e) { fail(e.message); console.error(e); }
})();
