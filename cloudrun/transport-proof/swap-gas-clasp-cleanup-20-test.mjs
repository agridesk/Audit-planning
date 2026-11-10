import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ignore=read('../../.claspignore');
const excludes=['Swap20EcasIntentReconciler.js','Swap20EcasQueueDispatch.js','Swap20FirestoreReadModel20.js'];
for(const file of excludes){
 assert(ignore.split(/\r?\n/).includes(file),'Retired GAS source must have an exact clasp upload exclusion: '+file);
 assert(!ignore.split(/\r?\n/).includes('Swap20*.js'),'Never blanket-exclude SWAP runtime files');
 assert(read('../../'+file).length>0,'Retained rollback source required: '+file);
}
const legacyIntent=read('../../Swap20EcasIntentReconciler.js');
const legacyQueue=read('../../Swap20EcasQueueDispatch.js');
const scaffold=read('../../Swap20FirestoreReadModel20.js');
assert.match(legacyIntent,/RETIRED legacy SWAP notification reconciler/);
assert.match(legacyQueue,/Retired ECAS dispatcher/);
assert.doesNotMatch(scaffold,/\bfunction\s+\w+|\b(?:var|let|const)\s+\w+|\bclass\s+\w+|\bimport\s+/);
const authoritative=[
 '../../NotificationSender.js','../../Swap20AtomicCommitGate.js',
 '../../Swap20NotificationIntent.js','../../Swap20EcasNotificationReconciler.js',
 '../../Swap20CombinedEcasDispatch.js','../../Swap20Bridge20.js','../../EntryV5.js'
].map(read).join('\n');
assert(!authoritative.includes('Swap20_reconcileEcasIntentsLegacyLocked_'),'Legacy notification reconciler still used');
assert(!authoritative.includes('Swap20_tryQueueCombinedEcasLegacyLocked_'),'Legacy notification dispatcher still used');
assert.match(read('../../NotificationSender.js'),/Swap20_reconcileEcasIntentsLocked_/);
assert.match(read('../../Swap20EcasNotificationReconciler.js'),/function Swap20_reconcileEcasIntentsLocked_\(/);
assert.match(read('../../Swap20CombinedEcasDispatch.js'),/function Swap20_tryQueueCombinedEcasLocked_\(/);
const swapIntents=read('../../Swap20NotificationIntent.js');
assert.match(swapIntents,/Swap20_tryQueueCombinedEcasLocked_/);
assert.match(read('../../Swap20ProposalStore.js'),/AMS_SWAP20_PROPOSAL_/);
assert.match(read('../../Swap20DurableJournal.js'),/AMS_Swap_20_Journal/);
console.log('SWAP GAS cleanup batch 1: upload exclusions and canonical runtime ownership PASS');
