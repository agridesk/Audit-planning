import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const a=r5.indexOf('function planningHtml(auditId,identity){'),b=r5.indexOf('\nasync function handlePlanning(req,res,u)',a);
assert(a>0&&b>a);
const sandbox={clean:v=>String(v??'').trim()};vm.createContext(sandbox);vm.runInContext(r5.slice(a,b),sandbox);
for(const role of ['Manager','Auditor']){
 const html=sandbox.planningHtml('INTERNAL-AUDIT-UID',{role,email:'test@example.com'});
 const markup=html.slice(0,html.indexOf('</main>'));
 assert(!markup.includes('id="auditId"'));
 assert(!markup.includes('INTERNAL-AUDIT-UID'));
 assert(markup.includes('class="backToGrid" id="backButton"'));
 assert(markup.includes('← Back to grid'));
 assert(!html.includes("txt('#auditId',a.auditId)"));
 assert(!html.includes("s.company||s.auditId"));
 assert(!html.includes("p.company||p.auditId"));
 assert(!html.includes("join(', ')||r.auditId"));
 const script=html.match(/<script>([\s\S]*)<\/script><\/body><\/html>$/)?.[1];
 assert(script);new vm.Script(script);
 assert(script.includes('const auditId="INTERNAL-AUDIT-UID"'),'Canonical identity remains internal');
}
const rotation=readFileSync(new URL('./rotation-manager-20.html',import.meta.url),'utf8');
assert(rotation.indexOf('id="rotationBack"')<rotation.indexOf('id="rotationTitle"'));
console.log('PASS Toolkit UID-free presentation, internal identity and uniform top back control');
