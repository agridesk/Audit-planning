import assert from 'node:assert/strict';
import {createSwapFirestoreDevTransport} from './swap-firestore-dev-transport-20.mjs';
const common={project:'ams-test-dev',getToken:async()=>'token',authorize:async()=>true,expectedAvailabilityDocuments:2,fetchImpl:async()=>{throw Error('Network must not be called when disabled');}};
const transport=createSwapFirestoreDevTransport({...common,enabled:true,canonicalCutoverVerified:false});
assert.equal((await transport.commit({operationId:'swap_12345678',actor:{role:'manager',email:'m@example.test'}})).code,'SWAP_DIRECT_COMMIT_DISABLED');
assert.throws(()=>createSwapFirestoreDevTransport({...common,project:'ams-test-prod'}),/SWAP_DEV_PROJECT_REQUIRED/);
console.log('SWAP Firestore cutover remains fail-closed');
