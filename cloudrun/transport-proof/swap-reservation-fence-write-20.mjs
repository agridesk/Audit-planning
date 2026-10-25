export function reservationFenceWrite(project,operationId,revision,now){
 if(!project.endsWith('-dev')||!revision||!operationId)throw Error('SWAP_FENCE_INVALID');
 return {update:{name:'projects/'+project+'/databases/(default)/documents/ams_swap20_dev_meta/reservation_fence',fields:{payload:{stringValue:JSON.stringify({operationId,now})}}},currentDocument:{updateTime:revision}};
}
