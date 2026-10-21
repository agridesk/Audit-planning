function Swap20ManagerCommitPreflight(input){
 input=input||{};
 var auth=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Manager',input.deviceFingerprint||input.deviceId);
 if(!auth||auth.ok!==true||!auth.email)throw Error('Manager authentication required');
 var p=Swap20Store_read_(input.operationId);
 if(!p||p.status!=='CONFIRMED')throw Error('Confirmed proposal required');
 return Swap20CanonicalCommitGuard({auditA:p.auditA,auditB:p.auditB,expectedRevisions:p.originalRevisions,blocksA:input.blocksA,blocksB:input.blocksB});
}
