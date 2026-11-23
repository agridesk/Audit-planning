/** In-process bridge between the layered servers for the manager Grid.
 * r15 owns the Firestore store; r4 owns the Grid builder. Neither imports the other.
 */
let firestoreAuditSource=null,gridBuilder=null;
export function setFirestoreGridAuditSource20(source){
 if(source!==null&&typeof source!=='function')throw Error('GRID_SOURCE_INVALID');
 firestoreAuditSource=source;
}
export const firestoreGridAuditSource20=()=>firestoreAuditSource;
export function setManagerGridBuilder20(builder){
 if(typeof builder!=='function')throw Error('GRID_BUILDER_INVALID');
 gridBuilder=builder;
}
export const managerGridBuilder20=()=>gridBuilder;
// Reference tables (Config_Scopes, Companies, Auditors) from Firestore; resolves to sheetsBatchGet-shaped [{values}x3].
let referenceSource=null;
export function setFirestoreGridReferenceSource20(source){
 if(source!==null&&typeof source!=='function')throw Error('GRID_REFERENCE_SOURCE_INVALID');
 referenceSource=source;
}
export const firestoreGridReferenceSource20=()=>referenceSource;
