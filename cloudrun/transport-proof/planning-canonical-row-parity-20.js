const clean=value=>String(value??'').trim();
const withoutTrailingEmpty=values=>{
 const result=values.slice();
 while(result.length&&result.at(-1)==='')result.pop();
 return result;
};

export function canonicalPlanningRowMatches20(snapshot,preview){
 if(!Array.isArray(snapshot?.headers)||!Array.isArray(preview?.canonicalSnapshot?.headers)||
    !Array.isArray(snapshot?.row)||!Array.isArray(preview?.sourceRowBefore))return false;
 return JSON.stringify(withoutTrailingEmpty(snapshot.headers.map(clean)))===
   JSON.stringify(withoutTrailingEmpty(preview.canonicalSnapshot.headers.map(clean)))&&
  JSON.stringify(withoutTrailingEmpty(snapshot.row))===JSON.stringify(withoutTrailingEmpty(preview.sourceRowBefore));
}
