/**
 * DEV-only, side-effect-free Firestore create-only backfill plan.
 * Explicit expected manifest hash prevents stale-source migration.
 * Caller must separately obtain authorization and perform writes.
 */
import {buildSwapMigrationManifest} from './swap-migration-manifest-20.mjs';
import {partitionSwapSheetMigration} from './swap-sheet-migration-partition-20.mjs';
const ID=/^[A-Za-z0-9_-]{1,140}$/;
export function planSwapMigrationBackfill({project,auditRows,availabilityRows,expectedManifestHash}={}){
 if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||''))throw Error('SWAP_BACKFILL_DEV_ONLY');
 const manifest=buildSwapMigrationManifest({auditRows,availabilityRows});
 if(!/^[a-f0-9]{64}$/.test(expectedManifestHash||'')||manifest.manifestHash!==expectedManifestHash)
  throw Error('SWAP_BACKFILL_SOURCE_DRIFT');
 const partition=partitionSwapSheetMigration({auditRows,availabilityRows});
 const root='projects/'+project+'/databases/(default)/documents/';
 const writes=[];
 for(const row of partition.eligible){
  if(!ID.test(row.auditId))throw Error('SWAP_BACKFILL_AUDIT_ID_INVALID');
  const canonical={auditId:row.auditId,status:row.status,assignedTo:row.assignedTo,plannedBlocks:row.plannedBlocks};
  const availability={auditId:row.auditId,reservations:row.reservations.map(x=>({...x,auditId:row.auditId,status:'Accepted'}))};
  for(const [collection,payload] of [['ams_swap20_dev_audits',canonical],['ams_swap20_dev_availability',availability]]){
   writes.push({update:{name:root+collection+'/'+row.auditId,fields:{payload:{stringValue:JSON.stringify(payload)}}},currentDocument:{exists:false}});
  }
 }
 return Object.freeze({manifestHash:manifest.manifestHash,sourceCount:manifest.counts.source,
  eligibleCount:partition.eligible.length,quarantinedCount:partition.quarantined.length,
  orphanCount:partition.orphanReservations.length,writes,createOnly:true,
  executionAuthorized:false,cutoverAuthorized:false});
}
