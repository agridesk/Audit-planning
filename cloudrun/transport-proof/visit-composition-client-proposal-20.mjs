/** Issue #87: allow-list for unauthoritative HTTP composition proposals.
 * Does not authorize the writer. Rejects client-supplied transaction proofs,
 * snapshot identities, revision claims, row numbers and Sheets mutations.
 * The canonical preflight must derive all authority independently.
 */
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const keys=x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x):[];
const allowed=new Set(['auditId','companyUid','sourceRevision','mode','blocks','allocations','visits','requestNonce']);
const visitAllowed=new Set(['obligationId','blocks','auditorUid']);
const blockAllowed=new Set(['date','start','end','executionType','workType']);
const allocationAllowed=new Set(['blockIndex','obligationId','start','end']);
export function validateCompositionClientProposal20(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    keys(body).some(key=>!allowed.has(key)))
  fail('COMPOSITION_CLIENT_AUTHORITY_FIELDS_FORBIDDEN');
 if(!str(body.auditId)||!str(body.companyUid)||
    !/^[a-f0-9]{24}$/.test(str(body.sourceRevision))||
    !['TOGETHER','SEPARATELY'].includes(body.mode))
  fail('COMPOSITION_CLIENT_IDENTITY_INVALID');
 if(body.requestNonce!==undefined&&(!/^[a-zA-Z0-9_-]{1,128}$/.test(str(body.requestNonce))))
  fail('COMPOSITION_CLIENT_NONCE_INVALID');
 if(body.blocks!==undefined&&(!Array.isArray(body.blocks)||
    body.blocks.some(b=>!keys(b).length||keys(b).some(k=>!blockAllowed.has(k)))))
  fail('COMPOSITION_CLIENT_BLOCK_FIELDS_INVALID');
 if(body.allocations!==undefined&&(!Array.isArray(body.allocations)||
    body.allocations.some(a=>!keys(a).length||keys(a).some(k=>!allocationAllowed.has(k)))))
  fail('COMPOSITION_CLIENT_ALLOCATION_FIELDS_INVALID');
 if(body.visits!==undefined&&(!Array.isArray(body.visits)||!body.visits.length||
    body.visits.length>14||body.visits.some(v=>!str(v?.obligationId)||
      !Array.isArray(v.blocks)||!v.blocks.length||
      keys(v).some(k=>!visitAllowed.has(k))||
      v.blocks.some(b=>!keys(b).length||keys(b).some(k=>!blockAllowed.has(k))))))
  fail('COMPOSITION_CLIENT_VISIT_AUTHORITY_FORBIDDEN');
 if(body.mode==='TOGETHER'&&body.visits!==undefined||
    body.mode==='SEPARATELY'&&(body.blocks!==undefined||body.allocations!==undefined))
  fail('COMPOSITION_CLIENT_MODE_FIELDS_INVALID');
 return Object.freeze({valid:true,authoritative:false,writeEnabled:false,
  mode:body.mode,sourceRevision:str(body.sourceRevision)});
}
