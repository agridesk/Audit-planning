function Swap20_validateImmutable_(before,after){
 if(!before||!after)throw Error('Proposal required');
 if(before.operationId!==after.operationId||before.auditA!==after.auditA||before.auditB!==after.auditB)throw Error('Identity changed');
 if(JSON.stringify(before.originalRevisions)!==JSON.stringify(after.originalRevisions))throw Error('Revisions changed');
 if(JSON.stringify(before.requiredAuditorUids)!==JSON.stringify(after.requiredAuditorUids))throw Error('Auditors changed');
 return true;
}
