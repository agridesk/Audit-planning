const table=document.getElementById('rows');
const message=document.getElementById('message');
const search=document.getElementById('search');
let records=[];
function render(){
 table.replaceChildren();
 const q=search.value.trim().toLowerCase();
 for(const item of records.filter(r=>[r.company,r.scope,r.auditor,r.auditorUid].join(' ').toLowerCase().includes(q))){
  const tr=document.createElement('tr');
  for(const key of ['company','scope','auditor','years','consecutiveYears','maximum','status']){
   const td=document.createElement('td');td.textContent=String(item[key]??'');tr.append(td);
  }
  table.append(tr);
 }
}
async function refresh(){
 message.textContent='Loading...';
 try{
  const response=await fetch('/api/v1/rotation-manager-20',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const result=await response.json();
  if(result.success!==true)throw Error(result.error||'Rotation read failed');
  records=result.rows||[];
  message.textContent=records.length+' rotation records (read-only)';
  render();
 }catch(error){message.textContent='Unable to load rotation: '+error.message;}
}
document.getElementById('reload').addEventListener('click',refresh);
search.addEventListener('input',render);
refresh();
