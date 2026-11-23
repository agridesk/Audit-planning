// DEV: reference tables (Auditors, Companies, Config_Scopes) Sheets -> Firestore.
// Preview by default; executes a create-only backfill per table only when its pinned manifest matches.
// Prints counts, manifests and parity booleans only (no business data).
import {REFERENCE_TABLES_20,compareReferenceMatrix20,createGridReferenceSource20,createReferenceTablesFirestoreStore20,planReferenceTable20,referenceMatrix20} from '../../../cloudrun/transport-proof/reference-tables-firestore-20.js';
const {SID,TOKEN}=process.env;
if(!SID||!TOKEN)throw Error('REFERENCE_BACKFILL_ENV_MISSING');
const expected=JSON.parse(process.env.EXPECTED_MANIFESTS||'{}');
const store=createReferenceTablesFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>TOKEN});
const readRanges=async ranges=>{
 const q=ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&');
 const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchGet?'+q+'&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING',{headers:{authorization:'Bearer '+TOKEN}});
 if(!r.ok)throw Error('SHEETS_READ_'+r.status);
 return (await r.json()).valueRanges.map(v=>v.values||[]);
};
const tables=Object.keys(REFERENCE_TABLES_20);
const sheets=Object.fromEntries((await readRanges(tables.map(t=>REFERENCE_TABLES_20[t].range))).map((v,i)=>[tables[i],v]));
const out={tables:{}};
for(const table of tables){
 const o=out.tables[table]={};
 try{
  const plan=planReferenceTable20(table,sheets[table]);
  Object.assign(o,{manifest:plan.manifest,rows:plan.rows.length,columns:plan.headers.length,counts:plan.counts});
  const meta=await store.readMeta(table);
  o.migrated=!!meta;
  o.manifestMatches=expected[table]===plan.manifest;
  if(!meta&&o.manifestMatches&&!plan.counts.blocked)o.execute=await store.backfillTable(plan,{expectedManifest:expected[table]});
  if(o.migrated||o.execute){
   const stored=await store.readTable(table);
   o.storedManifestMatches=stored.meta.manifest===plan.manifest;
   o.parity=compareReferenceMatrix20(sheets[table],referenceMatrix20(stored));
  }
 }catch(e){o.error=String(e?.message||e).slice(0,80);}
}
// Grid parity: exact Sheets ranges the Grid reads vs the Firestore-backed Grid source.
if(tables.every(t=>out.tables[t].parity)){
 try{
  const gridSheets=await readRanges(['Config_Scopes!A1:Z128','Companies!A1:AZ1024','Auditors!A1:Z256']);
  const gridFs=await createGridReferenceSource20(t=>store.readTable(t))();
  out.grid=gridSheets.map((v,i)=>compareReferenceMatrix20(v,gridFs[i].values));
 }catch(e){out.gridError=String(e?.message||e).slice(0,80);}
}
console.log(JSON.stringify(out));
const failed=tables.some(t=>out.tables[t].error||(out.tables[t].parity&&!out.tables[t].parity.equal))||out.gridError||(out.grid&&out.grid.some(g=>!g.equal));
if(failed)process.exitCode=2;
