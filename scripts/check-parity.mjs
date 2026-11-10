import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const candidates=['build/Release/tinyik_parity.exe','build/tinyik_parity','build/tinyik_parity.exe'];
const cpp=candidates.find(existsSync);
if(!cpp) throw new Error('Build the C++ examples first.');
const numbers=text=>String(text).trim().split(/\s+/).map(Number);
const a=numbers(execFileSync(cpp));
const b=numbers(execFileSync('cargo',['run','--quiet','--locked','--example','parity']));
if(a.length!==b.length||!a.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b[i])&&Math.abs(v-b[i])<1e-8))
  throw new Error('C++ / Rust parity failed');
console.log(`C++ / Rust parity passed: ${a.length/3} joint positions.`);
