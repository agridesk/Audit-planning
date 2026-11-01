import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=Object.freeze(['manager-portal.html','manager-portal.js','server-r4.js','server-r10.js','availability-my-calendar-20.html']);
/** Manager-only diagnostic: identify bundled code without exposing source or configuration. */
export async function runtimeBundleProof20(base,{read=readFile}={}){
 const entries=await Promise.all(files.map(async file=>{
  const content=await read(new URL(file,base));
  if(!content.length)throw Error('RUNTIME_BUNDLE_EMPTY_'+file);
  return [file,{bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')}];
 }));
 return Object.fromEntries(entries);
}
