import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const start=source.indexOf('function planningHtml(auditId){');
const end=source.indexOf('\nasync function handlePlanning(req,res,u)',start);
if(start<0||end<0)throw new Error('planningHtml function not found');

const fnSource=source.slice(start,end);
const sandbox={clean:v=>String(v==null?'':v).trim()};
vm.createContext(sandbox);
vm.runInContext(fnSource,sandbox,{filename:'planningHtml-extracted.js'});
const html=sandbox.planningHtml('AUD_TEST');
const match=html.match(/<script>([\s\S]*)<\/script><\/body><\/html>$/);
if(!match)throw new Error('generated planning client script not found');
new vm.Script(match[1],{filename:'generated-planning-client.js'});
console.log('generated-planning-client-syntax-test passed');
