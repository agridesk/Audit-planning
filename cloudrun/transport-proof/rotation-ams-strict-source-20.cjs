'use strict';
const {completedLogRowsFromAms20}=require('./rotation-ams-log-20.cjs');

function strictAmsCompletedHistory20(values,options){
 if(!Array.isArray(values)||!Array.isArray(values[0]))throw Error('ROTATION_AMS_HEADERS_MISSING');
 const normalize=s=>String(s||'').trim().toUpperCase().replace(/[\s-]/g,'_');
 const headers=values[0].map(normalize);
 const mapping=options&&options.scopeByColumn;
 if(options&&options.resolveAuditorUid!=null&&typeof options.resolveAuditorUid!=='function')throw Error('ROTATION_AMS_IDENTITY_RESOLVER_INVALID');
 if(!mapping||typeof mapping!=='object'||Object.keys(mapping).length===0)throw Error('ROTATION_AMS_SCOPE_MAPPING_REQUIRED');
 if(Object.keys(mapping).some(k=>!/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(k)||headers.filter(h=>h===k).length!==1||typeof mapping[k]!=='string'||!mapping[k].trim()))throw Error('ROTATION_AMS_SCOPE_HEADERS_REQUIRED');
 if(new Set(Object.values(mapping)).size!==Object.keys(mapping).length)throw Error('ROTATION_AMS_SCOPE_KEYS_NOT_UNIQUE');
 return completedLogRowsFromAms20(values,options);
}
module.exports={strictAmsCompletedHistory20};
