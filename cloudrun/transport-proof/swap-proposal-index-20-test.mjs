import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSwapProposalIndex} from './swap-proposal-index-20.mjs';
const cloud=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
assert.match(docker,/COPY swap-proposal-index-20\.mjs/);
assert.match(cloud,/AMS_SWAP20_PROPOSAL_INDEX_ENABLED==='true'/);
assert.match(cloud,/swap20Index\.begin\(op\)/);
assert.match(cloud,/swap20Index\.finish\(op,result\._mirrorEvent\)/);
assert.match(cloud,/SWAP_INDEX_CANONICAL_EVENT_MISSING/);
const storage=new Map();let rev=0;
function pathOf(url){return new URL(url).pathname.split('/').pop();}
const fetchImpl=async(url,opts)=>{
 const method=opts.method||'GET',id=pathOf(url);
 if(method==='GET'&&id==='ams_swap20_dev_index'){
  return {ok:true,status:200,json:async()=>({documents:[...storage.entries()].map(([name,d])=>({name:'documents/ams_swap20_dev_index/'+name,fields:{payload:{stringValue:JSON.stringify(d.data)}},updateTime:d.time}))})};
 }
 const old=storage.get(id);
 if(method==='GET')return old?{ok:true,status:200,json:async()=>({fields:{payload:{stringValue:JSON.stringify(old.data)}},updateTime:old.time})}:{ok:false,status:404};
 if(method==='PATCH'){
  const query=new URL(url).searchParams;
  if(query.has('currentDocument.exists')&&old)return {ok:false,status:412};
  if(query.has('currentDocument.updateTime')&&old?.time!==query.get('currentDocument.updateTime'))return {ok:false,status:412};
  const data=JSON.parse(JSON.parse(opts.body).fields.payload.stringValue),time='rev-'+(++rev);
  storage.set(id,{data,time});
  return {ok:true,status:200,json:async()=>({updateTime:time})};
 }
 throw Error('unexpected '+method);
};
const index=createSwapProposalIndex({project:'audit-management-system-dev',getToken:async()=> 'test',fetchImpl});
const mgr={role:'manager',email:'manager@example.test',auditorId:'manager-uid'};
const aud={role:'auditor',email:'auditor@example.test',auditorId:'auditor-uid'};
const other={role:'auditor',email:'other@example.test',auditorId:'other-uid'};
const base={operationId:'SWAP20_12345678',auditA:'A',auditB:'B',
 status:'AWAITING_ACKNOWLEDGEMENT',createdAt:'2026-10-22T10:00:00Z',createdBy:'manager@example.test',
 blocksA:[{date:'2026-10-24',start:'09:00',end:'11:00'}],
 blocksB:[{date:'2026-10-25',start:'09:00',end:'11:00'}],
 requiredAuditorUids:['auditor-uid'],acknowledgedAuditorUids:[],
 internalReason:'private manager reason',ecasComment:'auditor-visible note',dateChanged:true};
assert.equal(await index.read(mgr),null);
assert.equal(await index.begin(base.operationId),false);
assert.equal(await index.bootstrap([base]),true);
assert.equal(await index.bootstrap([]),false);
assert.equal((await index.read(mgr)).items[0].status,'AWAITING_ACKNOWLEDGEMENT');
const ai=await index.read(aud);
assert.equal(ai.items.length,1);
assert.equal(ai.attentionCount,1);
assert.equal(ai.items[0].ecasComment,base.ecasComment);
assert.equal('internalReason' in ai.items[0],false);
assert.equal((await index.read(other)).items.length,0);
assert.equal(await index.begin(base.operationId),true);
assert.equal(await index.read(mgr),null,'never read an in-flight mutation');
assert.equal(await index.begin(base.operationId),false,'parallel writes blocked');
await index.finish(base.operationId,{...base,status:'CONFIRMED',acknowledgedAuditorUids:['auditor-uid']});
assert.equal((await index.read(mgr)).items[0].status,'CONFIRMED');
await index.reconcile([{...base,status:'CONFIRMED',acknowledgedAuditorUids:['auditor-uid']}]);
assert.equal((await index.read(mgr)).attentionCount,1);
assert.equal((await index.read(aud)).items.length,0);
assert.equal(await index.begin(base.operationId),true);
await index.abort(base.operationId);
assert.equal(await index.read(mgr),null);
await index.reconcile([{...base,status:'CONFIRMED',acknowledgedAuditorUids:['auditor-uid']}]);
assert.equal((await index.read(mgr)).items.length,1);
assert.equal(await index.begin(base.operationId),true);
await assert.rejects(index.finish(base.operationId,{...base,operationId:'SWAP20_wrong12'}),/RECEIPT_MISMATCH/);
assert.equal(await index.read(mgr),null,'uncertain mutation must remain fail closed');
console.log('SWAP indexed DEV read model, CAS mutation fence, role privacy and dirty recovery: PASS');
