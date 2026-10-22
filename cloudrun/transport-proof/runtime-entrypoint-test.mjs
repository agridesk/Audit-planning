import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const docker=fs.readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');

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
  ['Docker starts npm start',docker.includes('CMD ["npm","start"]')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){
  console.error(`runtime-entrypoint-test failed: ${failed.map(([name])=>name).join(', ')}`);
  process.exit(1);
}
console.log('runtime-entrypoint-test passed');
