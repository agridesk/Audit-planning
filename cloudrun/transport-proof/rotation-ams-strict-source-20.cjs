'use strict';
const {completedLogRowsFromAms20}=require('./rotation-ams-log-20.cjs');
const REQUIRED=Array.from({length:8},(_,i)=>'SCOPE_'+String(i+1).padStart(2,'0'));
function strictAmsCompletedHistory20(values,options){
 if(!Array.isArray(values)||!Array.isArray(values[0]))throw Error('ROTATION_AMS_HEADERS_MISSING');
 const normalize=s=>String(s||'').trim().toUpperCase().replace(/[\s-]/g,'_');
 const headers=values[0].map(normalize);
 const mapping=options&&options.scopeByColumn;
 if(!mapping||typeof mapping!=='object'||Object.keys(mapping).length!==8)throw Error('ROTATION_AMS_EIGHT_SCOPE_MAPPING_REQUIRED');
 if(REQUIRED.some(k=>headers.filter(h=>h===k).length!==1||!Object.prototype.hasOwnProperty.call(mapping,k)||typeof mapping[k]!=='string'||!mapping[k].trim()))throw Error('ROTATION_AMS_EIGHT_SCOPE_HEADERS_REQUIRED');
 if(new Set(Object.values(mapping)).size!==8)throw Error('ROTATION_AMS_SCOPE_KEYS_NOT_UNIQUE');
 return completedLogRowsFromAms20(values,options);
}
module.exports={strictAmsCompletedHistory20};
