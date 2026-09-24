import http from 'node:http';
import { URL } from 'node:url';

const GAS_URL = process.env.GAS_DEV_URL || '';
const PORT = Number(process.env.PORT || 8080);

function send(res,status,body){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS'});
  res.end(JSON.stringify(body));
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS') return send(res,204,{});
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health') return send(res,200,{ok:true,service:'ams-transport-proof'});
  if(u.pathname!=='/api/v1/planning/workspace'||req.method!=='GET') return send(res,404,{ok:false,error:'NOT_FOUND'});
  const auditId=(u.searchParams.get('auditId')||'').trim();
  if(!auditId) return send(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});
  if(!GAS_URL) return send(res,500,{ok:false,error:'GAS_DEV_URL_NOT_CONFIGURED'});
  const started=Date.now();
  try{
    const gas=new URL(GAS_URL);
    gas.searchParams.set('action','transportproof');
    gas.searchParams.set('env','DEV');
    gas.searchParams.set('auditId',auditId);
    const outbound=Date.now();
    const response=await fetch(gas,{redirect:'follow',headers:{accept:'application/json'}});
    const gasWaitMs=Date.now()-outbound;
    const text=await response.text();
    let body;
    try{body=JSON.parse(text);}catch{body={raw:text.slice(0,500)};}
    return send(res,response.ok?200:502,{ok:response.ok&&body&&body.ok===true,proof:'AMS_CLOUD_RUN_TRANSPORT_R1',timing:{cloudRunTotalMs:Date.now()-started,gasHttpWaitMs:gasWaitMs,gasReportedMs:body&&body.gasMs||null},gas:body});
  }catch(err){
    return send(res,502,{ok:false,error:'GAS_TRANSPORT_FAILED',detail:String(err&&err.message||err),timing:{cloudRunTotalMs:Date.now()-started}});
  }
});

server.listen(PORT,'0.0.0.0');