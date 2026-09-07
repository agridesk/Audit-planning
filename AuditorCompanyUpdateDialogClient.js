// AuditorCompanyUpdateDialogClient.js
// BUILD: PREFERRED_AUDIT_MONTHS_R3_CURRENT_DAYS_CHECKBOXES_20260522
// BUILD: 2026-05-22_PREFERRED_AUDIT_MONTHS_MODAL_R2
// Full modal client helper. Uses AuditorCompanyUpdateDialog.html markup when present.
// Bundled submit to Company_Update_Proposals.

var __COMPANY_EDITOR_STATE = {
  companyUid: '',
  auditId: '',
  auditorEmail: '',
  snapshot: null
};

function companyEditor_escapeHtml_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function companyEditor_norm_(v) {
  return String(v == null ? '' : v).trim();
}

function companyEditor_parseHours_(v) {
  var s = companyEditor_norm_(v);
  var m = s.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  return { from: m ? m[1] : '', to: m ? m[2] : '' };
}

function companyEditor_normDaysString_(v) {
  var allowed = {mo:'Mo',tu:'Tu',we:'We',th:'Th',fr:'Fr'};
  var out = [];
  String(v || '').split(/[,\s;|]+/).forEach(function(x){
    var k = String(x || '').trim().toLowerCase();
    if (allowed[k] && out.indexOf(allowed[k]) === -1) out.push(allowed[k]);
  });
  return out.join(', ');
}

function companyEditor_splitDays_(v) {
  var s = companyEditor_normDaysString_(v);
  return s ? s.split(/\s*,\s*/) : [];
}

function companyEditor_monthDefs_() {
  return [
    { key:'Jan', aliases:['jan','january','januari','01','1'] },
    { key:'Feb', aliases:['feb','february','februari','02','2'] },
    { key:'Mar', aliases:['mar','march','maart','03','3'] },
    { key:'Apr', aliases:['apr','april','04','4'] },
    { key:'May', aliases:['may','mei','05','5'] },
    { key:'Jun', aliases:['jun','june','juni','06','6'] },
    { key:'Jul', aliases:['jul','july','juli','07','7'] },
    { key:'Aug', aliases:['aug','august','augustus','08','8'] },
    { key:'Sep', aliases:['sep','sept','september','09','9'] },
    { key:'Oct', aliases:['oct','okt','october','oktober','10'] },
    { key:'Nov', aliases:['nov','november','11'] },
    { key:'Dec', aliases:['dec','december','12'] }
  ];
}

function companyEditor_normMonthToken_(v) {
  var raw = String(v == null ? '' : v).trim();
  if (!raw) return '';
  var k = raw.toLowerCase().replace(/\./g, '').trim();
  var defs = companyEditor_monthDefs_();
  for (var i = 0; i < defs.length; i++) {
    if (defs[i].aliases.indexOf(k) >= 0) return defs[i].key;
  }
  return '';
}

function companyEditor_splitMonths_(v) {
  var out = [];
  String(v || '').split(/[,;|\s]+/).forEach(function(x){
    var m = companyEditor_normMonthToken_(x);
    if (m && out.indexOf(m) === -1) out.push(m);
  });
  return out;
}

function companyEditor_normMonthsString_(v) {
  return companyEditor_splitMonths_(v).join(',');
}

function companyEditor_getPreferredAuditMonths_(snapshot) {
  snapshot = snapshot || {};
  var planning = snapshot.planning || {};
  var principal = snapshot.principal || {};
  var candidates = [
    planning.preferredAuditMonths,
    planning.preferred_audit_months,
    planning.preferredAuditPeriod,
    planning.preferred_audit_period,
    planning.preferredMonths,
    planning.preferred_months,
    principal.preferredAuditMonths,
    principal.preferred_audit_months,
    snapshot.preferredAuditMonths,
    snapshot.preferred_audit_months
  ];
  for (var i = 0; i < candidates.length; i++) {
    var s = companyEditor_normMonthsString_(candidates[i]);
    if (s) return s;
  }
  return '';
}

function companyEditor_buildFieldRow_(label, currentHtml, editorHtml, extraCls) {
  return '<div class="cup-row ' + (extraCls || '') + '">' +
    '<div class="cup-label">' + companyEditor_escapeHtml_(label) + '</div>' +
    '<div class="cup-current">' + currentHtml + '</div>' +
    '<div class="cup-proposed" data-cup-proposed-wrap="1">' + editorHtml + '</div>' +
    '</div>';
}

function companyEditor_buildColumnHeader_() {
  return '<div class="cup-columns-head">' +
    '<div>Field</div>' +
    '<div>Current</div>' +
    '<div>Proposed</div>' +
    '</div>';
}

function companyEditor_markChangeState_() {
  var body = document.getElementById('companyUpdateBody');
  if (!body) return;
  var count = 0;
  body.querySelectorAll('[data-cup-proposed-wrap="1"]').forEach(function(wrap){
    var has = false;

    var monthsWrap = wrap.querySelector('.cup-months');
    if (monthsWrap) {
      var oldMonths = companyEditor_normMonthsString_(monthsWrap.getAttribute('data-cup-months-current') || '');
      var newMonths = Array.prototype.slice.call(monthsWrap.querySelectorAll('[data-cup-month]:checked'))
        .map(function(el){ return companyEditor_normMonthToken_(el.getAttribute('data-cup-month')); })
        .filter(Boolean)
        .join(',');
      has = (newMonths !== oldMonths);
    } else {
      wrap.querySelectorAll('input[type="text"], textarea').forEach(function(el){
        if (companyEditor_norm_(el.value)) has = true;
      });
      if (!has && wrap.querySelector('[data-cup-day]:checked')) has = true;
    }

    wrap.classList.toggle('cup-has-change', has);
    if (has) count++;
  });
  var el = document.getElementById('companyUpdateChangeCount');
  if (el) el.textContent = 'Proposed fields entered: ' + count;
}


function companyEditor_bindChangeTracking_() {
  var body = document.getElementById('companyUpdateBody');
  if (!body || body.getAttribute('data-cup-bound') === '1') return;
  body.setAttribute('data-cup-bound', '1');
  body.addEventListener('input', companyEditor_markChangeState_);
  body.addEventListener('change', companyEditor_markChangeState_);
}

function companyEditor_buildDaysEditor_(selected, options) {
  options = options || {};
  var arr = companyEditor_splitDays_(selected);
  var opts = ['Mo','Tu','We','Th','Fr'];
  var readonly = options.readonly === true;
  var cls = readonly ? 'cup-days cup-readonly-control' : 'cup-days';
  var dataAttr = readonly ? '' : ' data-cup-days-proposed="1"';
  return '<div class="' + cls + '"' + dataAttr + '>' + opts.map(function(d){
    var checked = arr.indexOf(d) >= 0 ? ' checked' : '';
    var disabled = readonly ? ' disabled aria-disabled="true"' : '';
    return '<label class="cup-day"><input type="checkbox" data-cup-day="' + d + '"' + checked + disabled + '> <span>' + d + '</span></label>';
  }).join('') + '</div>';
}


function companyEditor_buildMonthsEditor_(selected, options) {
  options = options || {};
  var arr = companyEditor_splitMonths_(selected);
  var opts = companyEditor_monthDefs_().map(function(x){ return x.key; });
  var readonly = options.readonly === true;
  var cls = readonly ? 'cup-months cup-readonly-control' : 'cup-months';
  var currentAttr = readonly ? '' : ' data-cup-months-current="' + companyEditor_escapeHtml_(companyEditor_normMonthsString_(selected)) + '"';
  return '<div class="' + cls + '"' + currentAttr + '>' + opts.map(function(m){
    var checked = arr.indexOf(m) >= 0 ? ' checked' : '';
    var disabled = readonly ? ' disabled aria-disabled="true"' : '';
    return '<label class="cup-month"><input type="checkbox" data-cup-month="' + m + '"' + checked + disabled + '> <span>' + m + '</span></label>';
  }).join('') + '</div>';
}

function companyEditor_buildModalHtml_(snapshot) {
  snapshot = snapshot || {};
  var principal = snapshot.principal || {};
  var planning = snapshot.planning || {};
  var locations = Array.isArray(snapshot.locations) ? snapshot.locations : [];
  var hours = companyEditor_parseHours_(planning.hours);
  var currentPreferredAuditMonths = companyEditor_getPreferredAuditMonths_(snapshot);

  var parts = [];
  parts.push('<div class="cup-section"><div class="cup-section-title">Contact</div>' + companyEditor_buildColumnHeader_());
  parts.push(companyEditor_buildFieldRow_('Contactperson',
    '<div class="cup-current-val">' + companyEditor_escapeHtml_(principal.contactperson || '—') + '</div>',
    '<input class="cup-input" data-cup-section="principal" data-cup-field="contactperson" type="text" value="">'
  ));
  parts.push(companyEditor_buildFieldRow_('Contact e-mail',
    '<div class="cup-current-val">' + companyEditor_escapeHtml_(principal.contact_email || '—') + '</div>',
    '<input class="cup-input" data-cup-section="principal" data-cup-field="contact_email" type="text" value="" placeholder="name@company.com, audits@company.com">'
  ));
  parts.push(companyEditor_buildFieldRow_('Contact phone',
    '<div class="cup-current-val">' + companyEditor_escapeHtml_(principal.contact_phone || '—') + '</div>',
    '<input class="cup-input" data-cup-section="principal" data-cup-field="contact_phone" type="text" value="" placeholder="+34 ...">'
  ));
  parts.push(companyEditor_buildFieldRow_('Comments',
    '<div class="cup-current-val">' + companyEditor_escapeHtml_(principal.comments || '—') + '</div>',
    '<textarea class="cup-textarea" data-cup-section="principal" data-cup-field="comments" rows="2"></textarea>'
  ));
  parts.push('</div>');

  parts.push('<div class="cup-section"><div class="cup-section-title">Planning limitations</div>' + companyEditor_buildColumnHeader_());
  parts.push(companyEditor_buildFieldRow_('Days',
    companyEditor_buildDaysEditor_(planning.days, { readonly:true }),
    companyEditor_buildDaysEditor_('')
  ));
  parts.push(companyEditor_buildFieldRow_('Preferred audit months',
    companyEditor_buildMonthsEditor_(currentPreferredAuditMonths, { readonly:true }),
    companyEditor_buildMonthsEditor_(currentPreferredAuditMonths)
  ));
  parts.push(companyEditor_buildFieldRow_('Hours',
    '<div class="cup-current-val">' + companyEditor_escapeHtml_(planning.hours || '—') + '</div>',
    '<div class="cup-hours">' +
      '<input class="cup-input cup-time" data-cup-hours="from" type="text" value="" placeholder="' + companyEditor_escapeHtml_(hours.from || 'HH:mm') + '">' +
      '<span class="cup-hours-sep">to</span>' +
      '<input class="cup-input cup-time" data-cup-hours="to" type="text" value="" placeholder="' + companyEditor_escapeHtml_(hours.to || 'HH:mm') + '">' +
    '</div>'
  ));
  parts.push('</div>');

  parts.push('<div class="cup-section"><div class="cup-section-title">Locations</div><div class="cup-location-grid">');
  locations.forEach(function(loc){
    var code = companyEditor_norm_(loc.code || '');
    if (!code) return;
    parts.push('<div class="cup-location-block">');
    parts.push('<div class="cup-location-title">' + companyEditor_escapeHtml_(code) + '</div>' + companyEditor_buildColumnHeader_());
    parts.push(companyEditor_buildFieldRow_('Name',
      '<div class="cup-current-val">' + companyEditor_escapeHtml_(loc.name || '—') + '</div>',
      '<input class="cup-input" data-cup-section="location" data-cup-location="' + companyEditor_escapeHtml_(code) + '" data-cup-field="name" type="text" value="">',
      'cup-location-row'
    ));
    parts.push(companyEditor_buildFieldRow_('GPS',
      '<div class="cup-current-val">' + companyEditor_escapeHtml_(loc.gps || '—') + '</div>',
      '<input class="cup-input" data-cup-section="location" data-cup-location="' + companyEditor_escapeHtml_(code) + '" data-cup-field="gps" type="text" value="" placeholder="37.51038888888889, -8.696972222222222">',
      'cup-location-row'
    ));
    parts.push(companyEditor_buildFieldRow_('Comment',
      '<div class="cup-current-val">' + companyEditor_escapeHtml_(loc.comment || '—') + '</div>',
      '<textarea class="cup-textarea" data-cup-section="location" data-cup-location="' + companyEditor_escapeHtml_(code) + '" data-cup-field="comment" rows="2"></textarea>',
      'cup-location-row'
    ));
    parts.push('</div>');
  });
  parts.push('</div></div>');

  return parts.join('');
}

function companyEditor_openModal_(snapshot) {
  __COMPANY_EDITOR_STATE.snapshot = snapshot || {};
  var title = document.getElementById('companyUpdateTitle');
  var body = document.getElementById('companyUpdateBody');
  if (!title || !body) {
    try { V5.toast('Company update dialog markup missing.'); } catch(e) {}
    return;
  }
  title.textContent = 'Suggest company update — ' + String((snapshot && snapshot.company) || '').trim();
  body.innerHTML = companyEditor_buildModalHtml_(snapshot);
  companyEditor_bindChangeTracking_();
  companyEditor_markChangeState_();
  try { V5.modal.open('modalCompanyUpdate'); } catch(e) {
    var el = document.getElementById('modalCompanyUpdate');
    if (el) el.style.display = 'flex';
  }
}

function companyEditor_closeModal_() {
  try { V5.modal.close('modalCompanyUpdate'); } catch(e) {
    var el = document.getElementById('modalCompanyUpdate');
    if (el) el.style.display = 'none';
  }
}

async function auditorOpenCompanyUpdateDialog(opts) {
  opts = opts || {};
  var companyUid = companyEditor_norm_(opts.companyUid);
  var auditId = companyEditor_norm_(opts.auditId);
  var auditorEmail = companyEditor_norm_(opts.auditorEmail).toLowerCase();
  if (!companyUid || !auditorEmail) {
    await UiDialogs.error({ title:'Error', message:'Missing company UID or auditor e-mail.' });
    return;
  }
  __COMPANY_EDITOR_STATE.companyUid = companyUid;
  __COMPANY_EDITOR_STATE.auditId = auditId;
  __COMPANY_EDITOR_STATE.auditorEmail = auditorEmail;

  google.script.run
    .withSuccessHandler(function(snapshot){
      companyEditor_openModal_(snapshot || {});
    })
    .withFailureHandler(function(err){
      UiDialogs.error({ title:'Error', message: err && err.message ? err.message : String(err) });
    })
    .companyUpdate_getCompanySnapshot(companyUid);
}

function companyEditor_collectChanges_() {
  var snapshot = __COMPANY_EDITOR_STATE.snapshot || {};
  var changes = [];
  var principal = snapshot.principal || {};
  var planning = snapshot.planning || {};
  var locations = Array.isArray(snapshot.locations) ? snapshot.locations : [];

  function pushChange(section, fieldKey, currentValue, proposedValue, locationCode, opts) {
    opts = opts || {};
    var oldVal = opts.months ? companyEditor_normMonthsString_(currentValue) : companyEditor_norm_(currentValue);
    var newVal = opts.months ? companyEditor_normMonthsString_(proposedValue) : companyEditor_norm_(proposedValue);

    // Contract: Current = source value. Proposed = correction proposal.
    // Empty Proposed fields mean no change; they do not clear existing company data,
    // except complete-list controls such as Preferred audit months.
    if (!newVal && opts.allowEmpty !== true) return;
    if (newVal === oldVal) return;

    changes.push({
      section: section,
      fieldKey: fieldKey,
      locationCode: locationCode || '',
      proposedValue: newVal
    });
  }

  document.querySelectorAll('#companyUpdateBody [data-cup-section="principal"]').forEach(function(el){
    var field = companyEditor_norm_(el.getAttribute('data-cup-field'));
    var value = companyEditor_norm_(el.value);
    pushChange('principal', field, principal[field] || '', value, '');
  });

  var dayChecks = Array.prototype.slice.call(document.querySelectorAll('#companyUpdateBody [data-cup-day]:checked'))
    .map(function(el){ return companyEditor_norm_(el.getAttribute('data-cup-day')); });
  pushChange('planning', 'days', planning.days || '', dayChecks.join(', '), '');

  var monthChecks = Array.prototype.slice.call(document.querySelectorAll('#companyUpdateBody [data-cup-month]:checked'))
    .map(function(el){ return companyEditor_normMonthToken_(el.getAttribute('data-cup-month')); })
    .filter(Boolean);
  var currentPreferredAuditMonths = companyEditor_getPreferredAuditMonths_(snapshot);
  pushChange('planning', 'preferredAuditMonths', currentPreferredAuditMonths, monthChecks.join(','), '', { months:true, allowEmpty:true });

  var fromEl = document.querySelector('#companyUpdateBody [data-cup-hours="from"]');
  var toEl = document.querySelector('#companyUpdateBody [data-cup-hours="to"]');
  var hourFrom = companyEditor_norm_(fromEl && fromEl.value);
  var hourTo = companyEditor_norm_(toEl && toEl.value);
  var hourCombined = (hourFrom && hourTo) ? (hourFrom + '-' + hourTo) : '';
  pushChange('planning', 'hours', planning.hours || '', hourCombined, '');

  document.querySelectorAll('#companyUpdateBody [data-cup-section="location"]').forEach(function(el){
    var field = companyEditor_norm_(el.getAttribute('data-cup-field'));
    var code = companyEditor_norm_(el.getAttribute('data-cup-location')).toUpperCase();
    var loc = locations.filter(function(x){ return companyEditor_norm_(x.code).toUpperCase() === code; })[0] || {};
    var value = companyEditor_norm_(el.value);
    pushChange('location', field, loc[field] || '', value, code);
  });

  return changes;
}

function companyEditor_validate_() {
  var bad = [];
  document.querySelectorAll('#companyUpdateBody .cup-time').forEach(function(el){
    var v = companyEditor_norm_(el.value);
    if (!v) return;
    if (!/^\d{2}:\d{2}$/.test(v)) bad.push('Hours must use HH:mm');
  });
  return bad;
}

function companyEditor_submit_() {
  var errs = companyEditor_validate_();
  if (errs.length) {
    UiDialogs.error({ title:'Validation', message: errs.join('\n') });
    return;
  }
  var changes = companyEditor_collectChanges_();
  if (!changes.length) {
    UiDialogs.info({ title:'No changes', message:'No effective changes were entered.' });
    return;
  }
  var btn = document.getElementById('btnCompanyUpdateSave');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  google.script.run
    .withSuccessHandler(function(res){
      if (btn) { btn.disabled = false; btn.textContent = 'Submit proposal'; }
      if (!res || res.success !== true) {
        UiDialogs.error({ title:'Error', message:(res && res.message) || 'Submit failed.' });
        return;
      }
      companyEditor_closeModal_();
      UiDialogs.flashSuccess('Proposal submitted', 900);
    })
    .withFailureHandler(function(err){
      if (btn) { btn.disabled = false; btn.textContent = 'Submit proposal'; }
      UiDialogs.error({ title:'Error', message: err && err.message ? err.message : String(err) });
    })
    .companyUpdate_submitProposalBundle({
      companyUid: __COMPANY_EDITOR_STATE.companyUid,
      auditId: __COMPANY_EDITOR_STATE.auditId,
      auditorEmail: __COMPANY_EDITOR_STATE.auditorEmail,
      changes: changes
    });
}
