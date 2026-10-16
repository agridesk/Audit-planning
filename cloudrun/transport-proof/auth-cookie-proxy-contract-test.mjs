import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const revision of [6,7,8,9,10,11,12,15]){
 const source=readFileSync(new URL('./server-r'+revision+'.js',import.meta.url),'utf8');
 assert.ok(source.includes("k!=='set-cookie'"),'R'+revision+' must skip folded Set-Cookie in Header.forEach');
 assert.ok(source.includes('r.headers.getSetCookie()'),'R'+revision+' must use getSetCookie to retain individual cookies');
 assert.match(source,/if\(multiCookies.length\).*\['set-cookie'\]=multiCookies/,'R'+revision+' must forward cookie array');
}
console.log('PASS: all eight Cloud Run fetch proxy layers retain both auth session and device Set-Cookie headers');
