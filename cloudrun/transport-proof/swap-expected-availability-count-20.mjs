export const DEFAULT_SWAP_EXPECTED_AVAILABILITY_DOCUMENTS=27;

export function resolveSwapExpectedAvailabilityDocuments(env={}){
 const raw=env.AMS_SWAP20_EXPECTED_AVAILABILITY_DOCUMENTS;
 if(raw===undefined||raw==='')return DEFAULT_SWAP_EXPECTED_AVAILABILITY_DOCUMENTS;
 if(!/^[1-9][0-9]{0,3}$/.test(String(raw))||Number(raw)<2)throw Error('SWAP_EXPECTED_AVAILABILITY_DOCUMENTS_INVALID');
 return Number(raw);
}
