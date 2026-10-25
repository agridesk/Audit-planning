/**
 * Deterministic DEV-only SWAP migration manifest, without network or writes.
 * A manifest is evidence for review, never authorization to migrate/cut over.
 */
import {createHash} from 'node:crypto';
import {partitionSwapSheetMigration} from './swap-sheet-migration-partition-20.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function buildSwapMigrationManifest({auditRows,availabilityRows}={}){
 const partition=partitionSwapSheetMigration({auditRows,availabilityRows});
 const eligible=partition.eligible.map(x=>({
  auditId:x.auditId,
  sourceHash:digest({auditId:x.auditId,status:x.status,assignedTo:x.assignedTo,
   plannedBlocks:x.plannedBlocks,reservations:x.reservations}),
  blockCount:x.plannedBlocks.length,reservationCount:x.reservations.length
 })).sort((a,b)=>a.auditId.localeCompare(b.auditId));
 const excluded=partition.quarantined.map(x=>({auditId:x.auditId,reason:x.reason,row:x.row}))
  .sort((a,b)=>a.auditId.localeCompare(b.auditId));
 const manifest={schema:'AMS_SWAP_DEV_MIGRATION_MANIFEST_20',eligible,excluded,
  orphanReservations:partition.orphanReservations,counts:partition.counts,
  sourceAuditCount:partition.counts.source};
 return Object.freeze({...manifest,manifestHash:digest(manifest),writeAuthorized:false,cutoverAuthorized:false});
}
