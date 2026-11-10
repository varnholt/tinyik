import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
const root=resolve('web');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.frag':'text/plain','.vert':'text/plain','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\')) throw Error('path');
    res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const site=`http://127.0.0.1:${server.address().port}`;
const port=Number(process.env.CDP_PORT||9241);
let chrome;
if(!process.env.CDP_PORT) {
  await mkdir('build/browser-profile',{recursive:true});
  const executable=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
  chrome=spawn(executable,['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve('build/browser-profile')}`],{stdio:'ignore',windowsHide:true});
}
let socket;
try {
  let tab;
  for(let i=0;i<100;i++) {
    try {tab=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(site)}`,{method:'PUT'})).json();break;}
    catch {await pause(100);}
  }
  assert.ok(tab,'Chrome debugging endpoint did not start');
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let next=0;const pending=new Map();const errors=[];
  socket.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown') errors.push(m.params);
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  };
  async function waitFor(expression) {
    for(let i=0;i<100;i++){if(await run(expression))return;await pause(100);}
    throw Error('Timeout: '+expression);
  }
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=WebGL2RenderingContext.prototype.uniform3fv;WebGL2RenderingContext.prototype.uniform3fv=function(location,data){if(data.length===51)window.testJoints=Array.from(data);return original.apply(this,arguments);};`});
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:840,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:site});
  await waitFor('window.testJoints?.length===51 || document.querySelector("#error")?.hidden===false');
  assert.equal(await run('document.querySelector("#error").textContent'),'');
  await mkdir('build/screenshots',{recursive:true});
  const capture=async name=>{
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(`build/screenshots/${name}.png`,Buffer.from(shot.data,'base64'));
  };
  await capture('giraffe');
  const before=await run('window.testJoints');
  await run(`document.querySelector('#lean').value='0.6';document.querySelector('#lean').dispatchEvent(new Event('input'));`);
  await waitFor(`Math.abs(window.testJoints[48]-${before[48]})>0.1`);
  await run(`document.querySelector('#press').click();document.querySelector('#strings').click();`);
  await waitFor(`window.testJoints[49]<${before[49]}-0.4`);
  await capture('pressed');
  await run(`document.querySelector('#press').click();`);
  await waitFor(`window.testJoints[49]>${before[49]}-0.2`);
  if(!process.argv.includes('--rust-only')) {
    await run(`document.querySelector('#core').value='cpp';document.querySelector('#core').dispatchEvent(new Event('change'));`);
    await waitFor(`!document.querySelector('#core').disabled`);
    assert.equal(await run('document.querySelector("#error").hidden'),true);
    await capture('cpp');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await pause(200);
  assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));
  await capture('mobile');
  assert.equal(await run(`document.querySelector('canvas').getContext('webgl2').getError()`),0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('Browser shaders, compiled WASM pose changes, press/release, core selection and mobile layout passed.');
} finally {socket?.close();chrome?.kill();server.closeAllConnections();server.close();}
