export function requireSwapIndexCoverage(index,expectedCount){
 if(!index||index.complete!==true||!Number.isSafeInteger(expectedCount)||expectedCount<2||
  index.documentCount!==expectedCount)throw Error('SWAP_INDEX_COVERAGE_UNVERIFIED');
 return index;
}
