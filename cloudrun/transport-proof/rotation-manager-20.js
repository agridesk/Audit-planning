const table=document.getElementById('rows');
const message=document.getElementById('message');
const search=document.getElementById('search');
let records=[];
const companyFilter=document.getElementById('companyFilter');
const auditorFilter=document.getElementById('auditorFilter');
const statusFilter=document.getElementById('statusFilter');
const scopeFilter=document.getElementById('scopeFilter');
function populate(select,values){const selected=select.value;select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=select===companyFilter?'All companies':select===scopeFilter?'All scopes':'All auditors';select.append(first);for(const v of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}))){const o=document.createElement('option');o.value=v;o.textContent=v;select.append(o)}select.value=selected;}
function render(){
 table.replaceChildren();
 const q=search.value.trim().toLowerCase();
 for(const item of records.filter(r=>(!companyFilter.value||r.companyUid===companyFilter.value)&&(!auditorFilter.value||r.auditorUid===auditorFilter.value)&&(!scopeFilter.value||r.slot===scopeFilter.value)&&(!statusFilter.value||r.status===statusFilter.value)&&[r.company,r.scope,r.auditor,r.auditorUid].join(' ').toLowerCase().includes(q))){
  const tr=document.createElement('tr');
  for(const key of ['company','scope','auditor','years','consecutiveYears','maximum','status']){
   const td=document.createElement('td');td.textContent=key==='status'?({AT_LIMIT:'Limit reached',NEAR_LIMIT:'Last available',AVAILABLE:'OK'}[item.status]||item.status):key==='consecutiveYears'?(item.current?item.consecutiveYears+'/'+item.maximum:'—'):String(item[key]??'');if(key==='status')td.className='status-'+item.status;tr.append(td);
  }
  tr.style.cursor='pointer';tr.title='View completed audit history';tr.addEventListener('click',()=>showDetail(item));
  table.append(tr);
 }
}
function showDetail(item){
 const panel=document.getElementById('detail');panel.replaceChildren();panel.hidden=false;
 const title=document.createElement('h3');title.textContent=item.company+' · '+item.scope+' · '+item.auditor+' ('+item.consecutiveYears+'/'+item.maximum+')';panel.append(title);
 const note=document.createElement('p');note.textContent='Completed audit history (newest first). Auditor changes reset the rotation sequence.';panel.append(note);
 const list=document.createElement('ol');for(const event of item.history||[]){const line=document.createElement('li');line.textContent=event.date+' — '+event.auditor;list.append(line);}panel.append(list);
 const close=document.createElement('button');close.textContent='Close details';close.onclick=()=>{panel.hidden=true;};panel.append(close);
 panel.scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function refresh(){
 message.textContent='Loading...';
 try{
  const response=await fetch('/api/v1/rotation-manager-20',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const result=await response.json();
  if(result.success!==true)throw Error(result.error||'Rotation read failed');
  records=result.rows||[];
  populate(scopeFilter,records.map(r=>r.slot));
  for(const option of scopeFilter.options){const item=records.find(r=>r.slot===option.value);if(item)option.textContent=item.scope;}
  populate(companyFilter,records.map(r=>r.companyUid));
  for(const option of companyFilter.options){const item=records.find(r=>r.companyUid===option.value);if(item)option.textContent=item.company;}
  const companyOptions=[...companyFilter.options].slice(1).sort((a,b)=>a.textContent.localeCompare(b.textContent,'en',{sensitivity:'base'}));companyFilter.replaceChildren(companyFilter.options[0],...companyOptions);
  populate(auditorFilter,records.map(r=>r.auditorUid));
  for(const option of auditorFilter.options){const item=records.find(r=>r.auditorUid===option.value);if(item)option.textContent=item.auditor;}
  message.textContent=records.length+' auditor histories · read-only';
  const issues=result.issues||[];
  const quality=document.getElementById('quality');quality.hidden=!issues.length;quality.textContent=issues.length?issues.length+' source records excluded: '+issues.map(x=>'row '+x.row+' ('+x.reason+')').join(', '):'';
  render();
 }catch(error){message.textContent='Unable to load rotation: '+error.message;}
}
document.getElementById('reload').addEventListener('click',refresh);
search.addEventListener('input',render);
refresh();

for(const element of [companyFilter,auditorFilter,scopeFilter,statusFilter])element.addEventListener('change',render);
document.getElementById('resetFilters').addEventListener('click',()=>{companyFilter.value='';auditorFilter.value='';statusFilter.value='';scopeFilter.value='';search.value='';render();});
