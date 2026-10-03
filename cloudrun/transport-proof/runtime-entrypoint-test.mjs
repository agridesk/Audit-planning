import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const docker=fs.readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');

const checks=[
  ['package starts current R12 runtime',pkg?.scripts?.start==='node server-r12.js'],
  ['Docker image contains R12',docker.includes('COPY server-r12.js ./')],
  ['Docker starts npm start',docker.includes('CMD ["npm","start"]')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length){
  console.error(`runtime-entrypoint-test failed: ${failed.map(([name])=>name).join(', ')}`);
  process.exit(1);
}
console.log('runtime-entrypoint-test passed');
