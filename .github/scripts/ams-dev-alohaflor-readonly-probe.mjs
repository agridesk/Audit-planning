/** Read-only: lists DEV Firestore docs mentioning Alohaflor. Never writes. */
import {execFileSync} from 'node:child_process';
const project='audit-management-system-dev';
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',timeout:30000}).trim();
const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
const H={authorization:'Bearer '+token};
const dec=v=>v==null?null:'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?v.doubleValue:'booleanValue'in v?v.booleanValue:'timestampValue'in v?v.timestampValue:'nullValue'in v?null:'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,dec(x)])):'arrayValue'in v?(v.arrayValue.values||[]).map(dec):'?';
const r0=await fetch(base+':listCollectionIds',{method:'POST',headers:{...H,'content-type':'application/json'},body:JSON.stringify({pageSize:300})});
if(!r0.ok)throw Error('LIST_COLLECTIONS_'+r0.status);
const cols=((await r0.json()).collectionIds||[]).filter(c=>/audit|planning|visit|avail|authority/i.test(c)&&!/gate|claim/i.test(c));
console.log('COLLECTIONS',JSON.stringify(cols));
const needle=/alohaflor/i;
for(const c of cols){let tok='',pages=0,hits=0,total=0;
 do{const u=new URL(base+'/'+c);u.searchParams.set('pageSize','300');if(tok)u.searchParams.set('pageToken',tok);
  const r=await fetch(u,{headers:H});if(!r.ok){console.log('READ_FAIL',c,r.status);break;}
  const j=await r.json();for(const d of j.documents||[]){total++;const s=JSON.stringify(d);if(!needle.test(s))continue;hits++;
   const id=d.name.split('/').pop();const f=dec({mapValue:{fields:d.fields||{}}});
   const out=JSON.stringify({collection:c,id,updateTime:d.updateTime,fields:f});console.log('HIT',out.length>6000?out.slice(0,6000)+'…':out);}
  tok=j.nextPageToken||'';pages++;}while(tok&&pages<40);
 console.log('SCANNED',c,'docs='+total,'hits='+hits);}
console.log('READ_ONLY_DONE_NO_WRITES');
