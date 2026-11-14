/** Manager-only DEV migration console. Runtime route must enforce authenticated
 * Manager, canonical host, full HTTP writer freeze and retired GAS authority.
 * No write runs automatically; an explicit human click initiates the backfill.
 */
export function devCutoverConsole20(){
 return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMS DEV - Firestore backfill</title>
<style>body{font:16px system-ui;max-width:740px;margin:35px auto;padding:16px}
button{padding:12px 18px;margin-right:12px;cursor:pointer}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:14px}
small{color:#555}</style></head><body>
<h2>AMS DEV - gecontroleerde Firestore-migratie</h2>
<p>Alleen DEV. De Cloud Run-schrijfpauze en externe GAS-schrijfpauze moeten bevestigd zijn.
Er worden geen gegevens gewijzigd totdat je expliciet op <strong>Backfill uitvoeren</strong> klikt.</p>
<button id="inspect">Bron controleren</button><button id="commit" disabled>Backfill uitvoeren</button>
<p><strong id="status">Nog niet gecontroleerd.</strong></p><pre id="report"></pre>
<small>STOP bij fouten; zet geen Save/atomic-writer aan voordat de pariteit geslaagd is.</small>
<script>
const status=document.getElementById('status'),report=document.getElementById('report'),
inspect=document.getElementById('inspect'),commit=document.getElementById('commit');
let sourceManifest=null,sourceCount=null;
const show=(label,data)=>{status.textContent=label;report.textContent=JSON.stringify(data,null,2)};
inspect.onclick=async()=>{
 commit.disabled=true;sourceManifest=null;inspect.disabled=true;
 try{
  const r=await fetch('/api/v1/planning/atomic-backfill-dry-run?limit=200',{credentials:'same-origin'});
  const data=await r.json();
  if(!r.ok||!data.success||!data.dryRun||!data.sourceManifest||!Number.isSafeInteger(data.audits))throw Error(data.code||data.error||'DRY_RUN_FAILED');
  sourceManifest=data.sourceManifest;sourceCount=data.audits;
  show('Bron gevalideerd. '+data.audits+' audits, '+data.claimedSlots+' claims.',data);
  commit.disabled=false;
 }catch(e){show('Controles geblokkeerd',{error:String(e)})}
 finally{inspect.disabled=false}
};
commit.onclick=async()=>{
 if(!sourceManifest||!confirm('Firestore backfill DEV starten voor '+sourceCount+' audits? De externe GAS-writers moeten aantoonbaar gestopt zijn.'))return;
 commit.disabled=true;inspect.disabled=true;
 let startRow=2,seeded=0,replayed=0,batches=0;
 try{
  for(;;){
   if(batches++>100)throw Error('BACKFILL_MAX_BATCHES');
   const body={dryRun:false,startRow,limit:25,sourceManifest};
   const r=await fetch('/api/v1/planning/atomic-backfill',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const data=await r.json();
   if(!r.ok||!data.success||data.dryRun!==false||data.sourceManifest!==sourceManifest)throw Error(data.error||'BACKFILL_BATCH_FAILED');
   seeded+=Number(data.seeded||0);replayed+=Number(data.replayed||0);
   show('Migratie: '+(seeded+replayed)+' / '+sourceCount+' audits verwerkt.',data);
   if(data.nextRow===null){if(seeded+replayed!==sourceCount)throw Error('BACKFILL_COUNT_MISMATCH');break}
   if(!Number.isSafeInteger(data.nextRow)||data.nextRow<=startRow)throw Error('BACKFILL_NEXT_ROW_INVALID');
   startRow=data.nextRow;
  }
  const evidence=await fetch('/api/v1/planning/atomic-cutover-evidence-readonly',{credentials:'same-origin'});
  const proof=await evidence.json();
  if(!evidence.ok||proof.success!==true||proof.ready!==true)throw Error('BACKFILL_PARITY_NOT_READY: '+JSON.stringify(proof));
  show('Firestore-backfill en volledige pariteit PASS. Save blijft uit.',{seeded,replayed,proof});
 }catch(e){show('STOP - migratie of parity nog niet voltooid. Niets activeren.',{error:String(e),seeded,replayed,nextRow:startRow})}
 finally{inspect.disabled=false}
};
</script></body></html>`;
}
