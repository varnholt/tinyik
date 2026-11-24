import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Tests the optional web/dance demo: beat timing from the tracker row clock.
const scope={window:{}};
vm.runInNewContext(await readFile(new URL('../web/dance/dance.js',import.meta.url),'utf8'),scope);
const motion=scope.window.giraffeDanceMotion;

for(const fps of [15,60,144]) {
  const necks=[];
  for(let frame=0;frame<fps*65;frame++) {
    const time=frame/fps;
    const bpm=time<30 ? 125 : 150;
    const rowDuration=6*2.5/bpm;
    const start=time<30 ? 0 : 30;
    const row=Math.floor((time-start)/rowDuration);
    const move=motion({row:row%64,speed:6,bpm,audioTime:start+row*rowDuration},time);
    assert.ok(Object.values(move).every(Number.isFinite));
    necks.push(move.neck);
  }
  // A minute of playback keeps moving through a tempo change.
  for(let second=1;second<64;second++) {
    const window=necks.slice(second*fps,(second+1)*fps);
    assert.ok(Math.max(...window)-Math.min(...window)>0.1,`moving at ${second}s, ${fps} FPS`);
  }
  // Peaks land on the beats of each tempo.
  for(let frame=fps;frame<necks.length-1;frame++) {
    const time=frame/fps;
    if(time>29 && time<31 || necks[frame]<necks[frame-1] || necks[frame]<necks[frame+1] || necks[frame]<0.2)continue;
    const period=60/(time<30 ? 125 : 150), relative=time-(time<30 ? 0 : 30);
    assert.ok(Math.abs(relative-Math.round(relative/period)*period)<0.05+1/fps,`peak on the beat at ${time.toFixed(2)}s`);
  }
}
assert.equal(motion(null,10),null);
assert.equal(motion({row:20,speed:6,bpm:125,audioTime:1},20),null,'a stale clock stops the dance');
for(const bpm of [100,125,150,180]) {
  const duration=6*2.5/bpm;
  const before=motion({row:3,speed:6,bpm,audioTime:duration*3},duration*4-1e-6);
  const after=motion({row:4,speed:6,bpm,audioTime:duration*4},duration*4);
  for(const key of ['neck','bounce','lean'])assert.ok(Math.abs(before[key]-after[key])<0.001,`row change keeps ${key} continuous`);
}
console.log('Dance beat timing, tempo changes, continuity and stale clocks passed.');
