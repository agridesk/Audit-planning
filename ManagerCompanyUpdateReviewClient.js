// ManagerCompanyUpdateReviewClient.js
// Additive client helper. Uses UiDialogs.

function managerLoadPendingCompanyUpdates(limit, onDone) {
  google.script.run
    .withSuccessHandler(function(res) {
      if (typeof onDone === 'function') onDone(res || { items: [], count: 0 });
    })
    .withFailureHandler(function(err) {
      UiDialogs.error({ title: 'Error', message: err && err.message ? err.message : String(err) });
    })
    .companyUpdate_listPendingProposals(limit || 50);
}

async function managerReviewCompanyUpdates(managerEmail) {
  managerEmail = String(managerEmail || '').trim().toLowerCase();

  managerLoadPendingCompanyUpdates(50, async function(res) {
    var items = Array.isArray(res && res.items) ? res.items : [];
    if (!items.length) {
      await UiDialogs.info({ title: 'Company updates', message: 'No pending company updates.' });
      return;
    }

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var label = it.section + ' / ' + it.fieldKey + (it.locationCode ? ' / ' + it.locationCode : '');
      var msg = ''
        + 'Company: ' + it.company + '\n'
        + 'Auditor: ' + it.auditorEmail + '\n'
        + 'Audit ID: ' + it.auditId + '\n\n'
        + 'Field: ' + label + '\n'
        + 'Old: ' + (it.oldValue || '(empty)') + '\n'
        + 'New: ' + (it.proposedValue || '(empty)');

      var apply = await UiDialogs.confirm({
        title: 'Review company update',
        message: msg,
        confirmLabel: 'Apply',
        cancelLabel: 'Next'
      });

      if (apply) {
        google.script.run
          .withSuccessHandler(function() { UiDialogs.flashSuccess('Applied', 500); })
          .withFailureHandler(function(err) {
            UiDialogs.error({ title: 'Error', message: err && err.message ? err.message : String(err) });
          })
          .companyUpdate_applyProposalRow(it.rowNumber, managerEmail, '');
      } else {
        var reject = await UiDialogs.confirm({
          title: 'Reject this update?',
          message: 'Choose Confirm to reject this row. Choose Cancel to leave it Pending.',
          confirmLabel: 'Reject',
          cancelLabel: 'Keep pending'
        });

        if (reject) {
          google.script.run
            .withSuccessHandler(function() { UiDialogs.flashSuccess('Rejected', 500); })
            .withFailureHandler(function(err) {
              UiDialogs.error({ title: 'Error', message: err && err.message ? err.message : String(err) });
            })
            .companyUpdate_rejectProposalRow(it.rowNumber, managerEmail, '');
        }
      }
    }
  });
}
