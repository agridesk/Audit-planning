/** Model C read-projection write fence; fail closed when Firestore is authoritative. */
const str=x=>String(x??'').trim();
const normalizedRange=x=>str(x).replace(/^'/,'').replace(/'!/,'!').replace(/''/g,"'").toLowerCase();
const guarded=new Set(['audit_obligations','audit_visit_obligations','audit planning']);
export function assertScopeExtensionLegacyWriteFenced20({authority,writes=[],projectionRanges=null,operation='batch'}={}){
 if(authority!=='FIRESTORE')return;
 if(!Array.isArray(writes)||writes.some(x=>!x||typeof x.range!=='string'))throw Error('EXT_WRITER_FENCE_INVALID_WRITESET');
 const projection=Array.isArray(projectionRanges)?new Set(projectionRanges.map(normalizedRange)):null;
 for(const item of writes){
  const range=normalizedRange(item.range),sheet=range.split('!')[0];
  if(!guarded.has(sheet))continue;
  if(operation==='raw-projection'&&projection?.has(range)&&projection.size===7&&writes.length===7&&writes.every(x=>Array.isArray(x.values)&&x.values.length===1&&Array.isArray(x.values[0])&&x.values[0].length===1))continue;
  throw Error('EXT_LEGACY_MODEL_C_WRITER_FENCED_'+sheet.replace(/\W+/g,'_'));
 }
}
export function assertScopeExtensionLegacyDeleteFenced20({authority,sheetTitle}={}){
 if(authority==='FIRESTORE'&&guarded.has(str(sheetTitle).toLowerCase()))throw Error('EXT_LEGACY_MODEL_C_DELETE_FENCED');
}
