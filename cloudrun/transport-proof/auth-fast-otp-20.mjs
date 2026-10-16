import {createHmac,randomBytes,randomInt,timingSafeEqual,createHash} from 'node:crypto';

const TTL_MS=600000;
const THROTTLE_MS=45000;
const MAX_ATTEMPTS=5;
const MAX_ACTIVE=2;
const clean=(v)=>String(v??'').trim();
const validEmail=(e)=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)&&e.length<=254;
const digest=(s)=>createHash('sha256').update(s).digest('hex');
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

export function createFastOtpService({projectId,secret,getAccessToken,lookupAccount,sendEmail,fetchImpl=fetch,now=Date.now,codeGenerator=()=>String(randomInt(0,1000000)).padStart(6,'0')}={}){
 if(projectId!=='audit-management-system-dev'||typeof secret!=='string'||secret.length<32||!getAccessToken||!lookupAccount||!sendEmail)throw Error('FAST_OTP_DEV_CONFIG_REQUIRED');
 const root='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents/ams_auth_fast_otp_dev';
 const identifier=(email)=>createHmac('sha256',secret).update('otp-account:'+email).digest('hex');
 const otpHash=(email,code,nonce)=>createHmac('sha256',secret).update('otp-code:'+email+':'+code+':'+nonce).digest('hex');
 async function call(url,init={}){
  const token=await getAccessToken();
  if(!token)throw Error('FAST_OTP_IAM_UNAVAILABLE');
  return fetchImpl(url,{...init,headers:{authorization:'Bearer '+token,...(init.body?{'content-type':'application/json'}:{})}});
 }
 async function read(email){
  const id=identifier(email);
  const res=await call(root+'/'+id);
  if(res.status===404)return{state:{codes:[],lastRequestedAt:0},version:null,id};
  if(!res.ok)throw Error('FAST_OTP_READ_'+res.status);
  const data=await res.json();
  let state;try{state=JSON.parse(data.fields?.state?.stringValue||'{}');}catch{throw Error('FAST_OTP_CORRUPT_RECORD');}
  if(!Array.isArray(state.codes))throw Error('FAST_OTP_CORRUPT_RECORD');
  return{state,version:data.updateTime,id};
 }
 async function save(snapshot,next){
  const data={fields:{state:{stringValue:JSON.stringify(next)}}};
  const path=root+'/'+snapshot.id;
  let response;
  if(snapshot.version){
   const url=path+'?currentDocument.updateTime='+encodeURIComponent(snapshot.version);
   response=await call(url,{method:'PATCH',body:JSON.stringify(data)});
  }else{
   const url=root+'?documentId='+snapshot.id;
   response=await call(url,{method:'POST',body:JSON.stringify(data)});
  }
  if(response.status===409||response.status===412)return false;
  if(!response.ok)throw Error('FAST_OTP_WRITE_'+response.status);
  return true;
 }
 async function change(email,transform){
  for(let attempt=0;attempt<5;attempt++){
   const snapshot=await read(email);
   const result=transform(structuredClone(snapshot.state));
   if(!result.update)return result;
   if(await save(snapshot,result.state))return result;
  }
  throw Error('FAST_OTP_CONCURRENT_WRITE_RETRY_EXHAUSTED');
 }
 async function requestCode(rawEmail){
  const email=clean(rawEmail).toLowerCase();
  if(!validEmail(email))return{ok:false,error:'INVALID_EMAIL'};
  const account=await lookupAccount(email);
  if(!account||!['Manager','Auditor'].includes(account.role))return{ok:false,error:'UNKNOWN_EMAIL'};
  const issued=await change(email,(state)=>{
   const current=now();
   if(current-Number(state.lastRequestedAt||0)<THROTTLE_MS)return{ok:true,update:false,throttled:true,retryAfterSeconds:Math.ceil((THROTTLE_MS-(current-state.lastRequestedAt))/1000)};
   const code=codeGenerator();if(!/^\d{6}$/.test(code))throw Error('FAST_OTP_GENERATOR_INVALID');
   const nonce=randomBytes(16).toString('hex');
   const active=state.codes.filter((row)=>row.expiresAt>current&&!row.usedAt&&row.attempts<MAX_ATTEMPTS).slice(-MAX_ACTIVE+1);
   const entry={nonce,hash:otpHash(email,code,nonce),expiresAt:current+TTL_MS,usedAt:0,attempts:0};
   return{ok:true,update:true,state:{codes:[...active,entry],lastRequestedAt:current},code,nonce,issuedAt:current};
  });
  if(!issued.update)return{ok:true,throttled:true,retryAfterSeconds:issued.retryAfterSeconds};
  try{
   await sendEmail(email,issued.code);
  }catch{
   await change(email,(state)=>{state.codes=state.codes.filter(row=>row.nonce!==issued.nonce);if(state.lastRequestedAt===issued.issuedAt)state.lastRequestedAt=0;return{update:true,state};});
   return{ok:false,error:'LOGIN_CODE_DELIVERY_FAILED'};
  }
  return{ok:true,throttled:false,retryAfterSeconds:THROTTLE_MS/1000};
 }
 async function verifyCode(rawEmail,rawCode){
  const email=clean(rawEmail).toLowerCase(),code=clean(rawCode);
  if(!validEmail(email)||!/^\d{6}$/.test(code))return{ok:false,error:'INVALID_LOGIN_INPUT'};
  const account=await lookupAccount(email);
  if(!account||!['Manager','Auditor'].includes(account.role))return{ok:false,error:'INVALID_OR_EXPIRED_CODE'};
  const result=await change(email,(state)=>{
   const time=now();
   let matched=null;
   for(const row of state.codes){
    if(row.usedAt||row.expiresAt<=time||row.attempts>=MAX_ATTEMPTS)continue;
    if(safeEqual(row.hash,otpHash(email,code,row.nonce))){matched=row;break;}
   }
   if(matched){
    matched.usedAt=time||1;
    for(const row of state.codes){if(row!==matched)row.usedAt=time||1;}
    return{ok:true,update:true,state};
   }
   for(const row of state.codes){if(!row.usedAt&&row.expiresAt>time)row.attempts=Math.min(MAX_ATTEMPTS,Number(row.attempts||0)+1);}
   return{ok:false,error:'INVALID_OR_EXPIRED_CODE',update:true,state};
  });
  if(!result.ok)return{ok:false,error:result.error||'INVALID_OR_EXPIRED_CODE'};
  return{ok:true,role:account.role,email,auditorUid:account.auditorUid||''};
 }
 return{requestCode,verifyCode};
}
