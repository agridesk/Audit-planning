function Swap20_validateImmutable_(before,after){
 if(!before||!after)throw Error('Proposal required');
 if(before.operationId!==after.operationId||before.auditA!==after.auditA||before.auditB!==after.auditB)throw Error('Identity changed');
 if(JSON.stringify(before.originalRevisions)!==JSON.stringify(after.originalRevisions))throw Error('Revisions changed');
 if(JSON.stringify(before.requiredAuditorUids)!==JSON.stringify(after.requiredAuditorUids))throw Error('Auditors changed');
 if(JSON.stringify(before.blocksA)!==JSON.stringify(after.blocksA)||JSON.stringify(before.blocksB)!==JSON.stringify(after.blocksB))throw Error('Swap schedule changed');
 if(before.dateChanged!==after.dateChanged)throw Error('Swap acknowledgement policy changed');
 return true;
}
