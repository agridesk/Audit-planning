// AMS Grid 4: pure, read-only data transformation. Not wired into the active portal.
const clean = v => String(v ?? '').trim();
const normal = v => clean(v).toLocaleLowerCase('en');
const scopeTokens = row => Array.isArray(row.scopes) && row.scopes.length
  ? row.scopes.map(s => typeof s === 'string' ? s : (s.scopeCode || s.slotKey || s.displayName || '')).map(normal).filter(Boolean)
  : clean(row.scopesText).split(',').map(normal).filter(Boolean);
const value = (row, key) => key === 'scopes' ? scopeTokens(row) : row[key];
function asNumber(v) { if (v === '' || v == null) return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; }
function asDate(v) { const s = clean(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const t=Date.parse(s+'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0,10)===s ? t : null; }
export function grid4FilterSort(rows, {filters=[],sorts=[],search='',searchValue=null}={}) {
  const original = Array.isArray(rows) ? rows : [];
  const q = normal(search);
  const matched = original.filter(row => {
    if (q && !normal(searchValue ? searchValue(row) : Object.values(row).join(' ')).includes(q)) return false;
    return filters.every(f => {
      const raw=value(row,f.key), values=Array.isArray(raw)?raw:[raw];
      const selected=Array.isArray(f.values)?f.values:[f.value];
      if (!selected.length) return true;
      return selected.some(choice => {
        if(f.type==='number') { const n=asNumber(raw);return n!==null && (f.min==null||n>=Number(f.min)) && (f.max==null||n<=Number(f.max)); }
        if(f.type==='date') { const n=asDate(raw);return n!==null && (f.from==null||n>=asDate(f.from)) && (f.to==null||n<=asDate(f.to)); }
        return values.some(v=>f.mode==='contains'?normal(v).includes(normal(choice)):normal(v)===normal(choice));
      });
    });
  });
  if(!sorts.length) return matched;
  return matched.map((row,index)=>({row,index})).sort((a,b)=>{
    for(const s of sorts){
      const x=value(a.row,s.key),y=value(b.row,s.key);
      const left=s.type==='number'?asNumber(x):s.type==='date'?asDate(x):normal(Array.isArray(x)?x.join(' '):x);
      const right=s.type==='number'?asNumber(y):s.type==='date'?asDate(y):normal(Array.isArray(y)?y.join(' '):y);
      if(left===null||left==='') {if(right!==null&&right!=='')return 1;continue;}
      if(right===null||right==='')return -1;
      const cmp=typeof left==='number'&&typeof right==='number'?Math.sign(left-right):String(left).localeCompare(String(right));
      if(cmp)return s.direction==='desc'?-cmp:cmp;
    }
    return a.index-b.index;
  }).map(x=>x.row);
}
