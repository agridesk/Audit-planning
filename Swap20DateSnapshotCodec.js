// SWAP 2.0 canonical, lossless values for durable journal snapshots.
// A tagged Date round-trips to a Date object before writing to Sheets.
function Swap20_safeSerializeValue_(value) {
 if(Object.prototype.toString.call(value)==='[object Date]'){
  if(isNaN(value.getTime()))throw Error('Invalid Date in SWAP snapshot');
  return {__AMS_SWAP_DATE_ISO__:value.toISOString()};
 }
 return value;
}
function Swap20_safeRestoreValue_(value) {
 if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.__AMS_SWAP_DATE_ISO__==='string'){
  var date=new Date(value.__AMS_SWAP_DATE_ISO__);
  if(isNaN(date.getTime())||date.toISOString()!==value.__AMS_SWAP_DATE_ISO__)throw Error('Invalid durable SWAP Date');
  return date;
 }
 return value;
}
function Swap20_safeSnapshotRow_(row) {
 return row.map(Swap20_safeSerializeValue_);
}
function Swap20_safeRestoreRow_(row) {
 return row.map(Swap20_safeRestoreValue_);
}
