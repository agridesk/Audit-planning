// Protect the reference tabs so only the runtime SA (and the file owner) can edit them.
// MODE: preview (default) | apply | remove. Logs counts/ids only, no cell data.
const {SID, TOKEN, MODE = 'preview', RUNTIME_SA} = process.env;
const TABS = ['Auditors', 'Companies', 'Config_Scopes'];
const DESC = 'AMS Firestore-first: alleen app (reference gateway)';
const base = `https://sheets.googleapis.com/v4/spreadsheets/${SID}`;
const h = {Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json'};
async function meta() {
  const r = await fetch(`${base}?fields=sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description,range,warningOnly,editors))`, {headers: h});
  if (!r.ok) throw new Error(`meta HTTP ${r.status}`);
  return (await r.json()).sheets;
}
function state(sheets) {
  return TABS.map(t => {
    const s = sheets.find(x => x.properties.title === t);
    if (!s) return {tab: t, found: false};
    const prs = s.protectedRanges || [];
    const ours = prs.filter(p => p.description === DESC);
    return {tab: t, found: true, sheetId: s.properties.sheetId, protections: prs.length, ours: ours.map(p => p.protectedRangeId),
      oursEditorsOk: ours.every(p => (p.editors?.users || []).map(u => u.toLowerCase()).includes(RUNTIME_SA.toLowerCase()) && !p.warningOnly)};
  });
}
const before = state(await meta());
if (before.some(x => !x.found)) { console.log(JSON.stringify({mode: MODE, error: 'TAB_MISSING', before})); process.exit(1); }
const requests = [];
if (MODE === 'apply') for (const x of before) if (!x.ours.length) requests.push({addProtectedRange: {protectedRange: {
  range: {sheetId: x.sheetId}, description: DESC, warningOnly: false, editors: {users: [RUNTIME_SA]}}}});
if (MODE === 'remove') for (const x of before) for (const id of x.ours) requests.push({deleteProtectedRange: {protectedRangeId: id}});
if (requests.length) {
  const r = await fetch(`${base}:batchUpdate`, {method: 'POST', headers: h, body: JSON.stringify({requests})});
  if (!r.ok) { console.log(JSON.stringify({mode: MODE, error: `batchUpdate HTTP ${r.status}`, detail: (await r.text()).slice(0, 300)})); process.exit(1); }
}
const after = state(await meta());
const ok = MODE === 'apply' ? after.every(x => x.ours.length === 1 && x.oursEditorsOk) : MODE === 'remove' ? after.every(x => !x.ours.length) : true;
console.log(JSON.stringify({mode: MODE, requests: requests.length, ok, before, after}));
if (!ok) process.exit(1);
