import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const docker=fs.readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');

const r15=fs.readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const planningProxy=r15.slice(r15.indexOf('async function proxy(req,res){'),r15.indexOf('http.createServer(async(req,res)=>'));
const checks=[
  ['package starts canonical Availability R15 runtime',pkg?.scripts?.start==='node server-r15.js'],
  ['Docker image contains R12',docker.includes('COPY server-r12.js ./')],
  ['Docker image contains R15',docker.includes('COPY server-r15.js ./')],
  ['Docker contains runtime environment resolver',docker.includes('COPY runtime-environment-20.mjs ./')],
  ['Docker image contains Availability modules',docker.includes('COPY availability-*.js ./')],
  ['Docker image contains shared assignment validator',docker.includes('COPY assignment-validation-v211.js ./')],
  ['Docker image contains shared actor capabilities',docker.includes('COPY actor-capabilities-v211.js ./')],
  ['Docker image contains scope hours version service',docker.includes('COPY scope-hours-version-20.js ./')],
  ['Docker image contains scope policy service',docker.includes('COPY scope-policy-20.js ./')],
  ['Docker image contains scheme version service',docker.includes('COPY scope-scheme-version-20.js ./')],
  ['Docker image contains Add scope service',docker.includes('COPY scope-create-20.js ./')],
  ['DEV Planning Save obtains durable CAS lease before HARD gate',planningProxy.indexOf('service.acquirePlanningLease(')>=0&&planningProxy.indexOf('service.acquirePlanningLease(')<planningProxy.indexOf('enforceAvailabilityHardGate20(')],
  ['DEV Planning Save holds lease until Sheets proxy returns',planningProxy.indexOf('service.releasePlanningLease(')>planningProxy.indexOf('const r=await fetch(url,init)')],
  ['DEV Planning Save preserves uncertain write for reconciliation',planningProxy.includes('service.markPlanningLeaseUncertain(')&&planningProxy.includes('PLANNING_COMMIT_OUTCOME_UNCERTAIN')],
  ['DEV manager recovery verifies canonical Sheets and cooldown',r15.includes("'/api/v1/planning/reconcile-uncertain-lease'")&&r15.includes('PLANNING_RECOVERY_COOLDOWN')&&r15.includes('PLANNING_RECOVERY_INTERVAL_MISMATCH')],
  ['Docker starts npm start',docker.includes('CMD ["npm","start"]')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){
  console.error(`runtime-entrypoint-test failed: ${failed.map(([name])=>name).join(', ')}`);
  process.exit(1);
}
console.log('runtime-entrypoint-test passed');
