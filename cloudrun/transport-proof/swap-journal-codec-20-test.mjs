import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {gzipSync,gunzipSync} from 'node:zlib';
const src=readFileSync(new URL('../../Swap20DurableJournal.js',import.meta.url),'utf8');
const bytesBlob=b=>({getBytes:()=>[...b],getDataAsString:()=>Buffer.from(b).toString()});
const Utilities={
 newBlob:(data)=>bytesBlob(typeof data==='string'?Buffer.from(data):Buffer.from(data)),
 gzip:blob=>bytesBlob(gzipSync(Buffer.from(blob.getBytes()))),
 ungzip:blob=>bytesBlob(gunzipSync(Buffer.from(blob.getBytes()))),
 base64Encode:data=>Buffer.from(data).toString('base64'),
 base64Decode:value=>[...Buffer.from(value,'base64')]
};
const ctx={JSON,String,Date,Array,Object,Number,Error,Utilities};
runInNewContext(src,ctx);
const date=new Date('2026-10-21T00:00:00.000Z');
const original={before:{values:Array.from({length:1008},(_,i)=>[date,'auditor@example.test',i,'',''])}};
const encoded=ctx.Swap20Journal_encodePayload_(original);
assert.match(encoded,/^SWAP_GZIP_V1:/);
assert.ok(encoded.length<40000);
const restored=ctx.Swap20Journal_decodePayload_(encoded);
assert.equal(restored.before.values.length,1008);
assert.equal(restored.before.values[0][0].toISOString(),date.toISOString());
assert.equal(restored.before.values[500][2],500);
assert.equal(ctx.Swap20Journal_decodePayload_('{"stage":"COMMITTED"}').stage,'COMMITTED');
console.log('SWAP compressed typed journal codec tests passed');
