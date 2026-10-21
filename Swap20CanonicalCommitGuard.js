function Swap20CanonicalCommitGuard(input) {
  input = input || {};
  var a = String(input.auditA || '').trim();
  var b = String(input.auditB || '').trim();
  if (!a || !b || a === b) throw new Error('Distinct audit IDs required');
  var pair = Swap20_readCanonicalPair({auditA:a,auditB:b});
  if (!pair.eligible) throw new Error('Swap pair not eligible');
  return {ok:true,readOnly:true,commitAuthorized:false,pair:pair};
}
