function Swap20ManagerPreview(input){input=input||{};var a=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Manager',input.deviceFingerprint||input.deviceId);if(!a||a.ok!==true||!a.email)throw new Error('Manager authentication required');return Swap20_readCanonicalPair({auditA:input.auditA,auditB:input.auditB});}

/** Manager-only persistent proposal lookup. No mutation. */
function Swap20ManagerGetProposal(input){
 input=input||{};
 var auth=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Manager',input.deviceFingerprint||input.deviceId);
 if(!auth||auth.ok!==true||!auth.email)throw new Error('Manager authentication required');
 var proposal=Swap20Store_read_(input.operationId);
 if(!proposal)throw new Error('Swap proposal not found');
 return {success:true,proposal:proposal,readOnly:true};
}
