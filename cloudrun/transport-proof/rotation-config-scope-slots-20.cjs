'use strict';
// Resolve indicator slots from actual DEV Config_Scopes. Never infer rotation limits
// from certificate Extension or other unrelated columns.
function scopeSlotsFromConfig20(values){
 if(!Array.isArray(values)||!Array.isArray(values[0]))throw Error('ROTATION_CONFIG_SCOPES_MISSING');
 const headers=values[0].map(x=>String(x||'').trim().toLowerCase().replace(/[\s_-]/g,''));
 const slot=headers.indexOf('slotkey'),code=headers.indexOf('scopecode');
 if(slot<0||code<0)throw Error('ROTATION_CONFIG_SCOPE_COLUMNS_MISSING');
 const mapping={};
 for(const row of values.slice(1)){
  const key=String(row[slot]||'').trim(),scope=String(row[code]||'').trim();
  if(!/^SCOPE_0[1-8]$/.test(key))continue;
  if(!scope||Object.prototype.hasOwnProperty.call(mapping,key))throw Error('ROTATION_CONFIG_SCOPE_MAPPING_INVALID');
  mapping[key]=scope;
 }
 if(Object.keys(mapping).length!==8||new Set(Object.values(mapping)).size!==8)throw Error('ROTATION_CONFIG_EIGHT_SCOPE_MAPPING_INCOMPLETE');
 return mapping;
}
module.exports={scopeSlotsFromConfig20};
