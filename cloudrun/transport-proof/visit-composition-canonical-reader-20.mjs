/** DEV read-only canonical SSoT snapshot reader for Issue #87.
 * No write methods. Always read complete bounded tables rather than trusting
 * browser or preflight-provided Model C rows. Caller holds global write gate.
 */
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const blank=row=>!row||row.every(cell=>String(cell??'').trim()==='');
const MAX={planning:2000,obligations:5000,links:5000};
const norm=x=>String(x??'').trim().toUpperCase().replace(/[\s-]/g,'_');
const mandatory={
 planning:[['AUDIT_ID'],['COMPANY_UID'],['STATUS']],
 obligations:[['OBLIGATION_ID'],['COMPANY_UID'],['SCOPECODE','SCOPE_CODE'],['FORMAL_HOURS'],['OBLIGATION_STATE']],
 links:[['AUDIT_ID'],['OBLIGATION_ID'],['LINK_STATE'],['LINKED_AT'],['UNLINKED_AT']]
};
const assertHeader=(rows,tab)=>{
 const headers=(rows[0]||[]).map(norm);
 if(mandatory[tab].some(aliases=>!aliases.some(x=>headers.includes(x))))
  fail('COMPOSITION_READER_'+tab.toUpperCase()+'_SCHEMA_MISSING');
 const nonEmpty=headers.filter(Boolean);
 if(new Set(nonEmpty).size!==nonEmpty.length)
  fail('COMPOSITION_READER_'+tab.toUpperCase()+'_DUPLICATE_HEADERS');
};
export function createVisitCompositionCanonicalReader20({readRange}={}){
 if(typeof readRange!=='function')fail('COMPOSITION_READER_CONFIG_INVALID');
 const required=(rows,limit,label)=>{
  if(!Array.isArray(rows)||rows.length<2||rows.length>=limit||
     rows.some(row=>!Array.isArray(row)))fail('COMPOSITION_READER_'+label+'_INCOMPLETE');
  return rows;
 };
 async function read({appendRowNumbers=[]}={}){
  if(!Array.isArray(appendRowNumbers)||appendRowNumbers.length>14||
     appendRowNumbers.some(n=>!Number.isSafeInteger(n)||n<2)||
     new Set(appendRowNumbers).size!==appendRowNumbers.length)
    fail('COMPOSITION_READER_APPEND_ROWS_INVALID');
  // Sequential reads are intentional. Under the write gate these must have
  // consistent canonical ownership; never rely on in-process caching.
  const readAuditRows=required(await readRange('Audit planning!A1:BW'+MAX.planning),MAX.planning,'PLANNING');
  const readObligationRows=required(await readRange('Audit_Obligations!A1:AA'+MAX.obligations),MAX.obligations,'OBLIGATIONS');
  const readLinkRows=required(await readRange('Audit_Visit_Obligations!A1:AZ'+MAX.links),MAX.links,'LINKS');
  assertHeader(readAuditRows,'planning');
  assertHeader(readObligationRows,'obligations');
  assertHeader(readLinkRows,'links');
  const emptyAppendRows=[];
  for(const row of appendRowNumbers){
   if(row<=readLinkRows.length||row>=MAX.links)
    fail('COMPOSITION_READER_APPEND_ROW_POSITION_INVALID');
   const values=await readRange('Audit_Visit_Obligations!A'+row+':AZ'+row);
   if(!Array.isArray(values)||values.length>1||values.some(x=>!Array.isArray(x))||
      values.length>0&&!blank(values[0]))
    fail('COMPOSITION_READER_APPEND_ROW_OCCUPIED');
   emptyAppendRows.push({row,before:values[0]||[]});
  }
  return {readAuditRows,readObligationRows,readLinkRows,emptyAppendRows};
 }
 return Object.freeze({read});
}
