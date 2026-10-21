function Swap20_verifyCommittedReconciliationLocked_(history, proposal) {
  if (!history || history.length < 3 || !proposal) return false;
  if (history[0].stage !== 'PREPARED' || history[history.length-1].stage !== 'COMMITTED') return false;
  var previous = history[0].payload;
  if (!previous || !previous.canonical || !previous.availability) return false;
  var canonical = previous.canonical;
  var availability = previous.availability;
  if (!canonical.rows || canonical.rows.length !== 2 || !canonical.headers) return false;
  if (canonical.rows[0].auditId !== proposal.auditA || canonical.rows[1].auditId !== proposal.auditB) return false;
  var col = canonical.headers.map(function(x) {return String(x).toLowerCase().replace(/[ _-]/g,'');}).indexOf('assignedto');
  if (col < 0) return false;
  var owners = {};
  canonical.rows.forEach(function(image) {
    var assigned = String(image.values[col] || '').trim().toLowerCase();
    if (!assigned) throw Error('Missing swap auditor owner');
    owners[image.auditId] = assigned;
  });
  var plan = Swap20_availabilityPlan_(availability, proposal, owners);
  if (!plan || plan.sheetName !== availability.sheetName || plan.width !== availability.width ||
      plan.originalHeight !== availability.height) return false;
  return Swap20_verifyAppliedPairLocked_(canonical, proposal, plan) === true;
}
