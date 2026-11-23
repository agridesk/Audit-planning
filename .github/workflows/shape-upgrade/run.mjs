// DEV one-off: legacy Model C snapshot shape upgrade. Prints counts/codes only.
import {createPlanningAtomicFirestoreStore} from '../../../cloudrun/transport-proof/planning-atomic-firestore-store-20.js';
import {listAllPlanningAudits20} from '../../../cloudrun/transport-proof/planning-firestore-grid-projection-20.js';
import {executeSnapshotShapeUpgrades20,planSnapshotShapeUpgrades20} from '../../../cloudrun/transport-proof/planning-snapshot-shape-upgrade-20.js';
const {SID,TOKEN,EXPECTED_MANIFEST}=process.env;
if(!SID||!TOKEN||!/^[0-9a-f]{64}$/.test(EXPECTED_MANIFEST||''))throw Error('SHAPE_UPGRADE_ENV_MISSING');
const getToken=async()=>TOKEN;
const store=createPlanningAtomicFirestoreStore({projectId:'audit-management-system-dev',getToken});
const readSheet=async()=>{
 const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/'+encodeURIComponent('Audit planning!A1:BW2000'),{headers:{authorization:'Bearer '+TOKEN}});
 if(!r.ok)throw Error('SHEETS_READ_'+r.status);
 const rows=(await r.json()).values;
 if(!Array.isArray(rows)||!rows.length||rows.length>=2000)throw Error('SHEETS_INCOMPLETE');
 return rows;
};
const summary=({candidates,...plan})=>plan;
const load=async()=>{const [sheetValues,records]=await Promise.all([readSheet(),listAllPlanningAudits20(store)]);return {sheetValues,records};};
const first=await load(),before=planSnapshotShapeUpgrades20(first.sheetValues,first.records);
const out={before:summary(before),manifestMatches:before.manifest===EXPECTED_MANIFEST};
if(out.manifestMatches&&before.eligible>0){
 out.execute=await executeSnapshotShapeUpgrades20({store,...first,manifest:EXPECTED_MANIFEST});
 const second=await load();out.after=summary(planSnapshotShapeUpgrades20(second.sheetValues,second.records));
}
console.log(JSON.stringify(out));
if(!out.manifestMatches&&before.eligible>0)process.exitCode=2;
