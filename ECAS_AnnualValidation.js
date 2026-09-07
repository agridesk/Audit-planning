/************************************************************************************
 * ECAS ANNUAL VALIDATION / JAARFUNCTIE
 * Build: 2026-04-30_README_REBUILT
 *
 * DOEL
 * Deze file is de jaarlijkse ECAS-controle/import-hulpfunctie voor het Audit Planning
 * systeem. Gebruik deze file om te controleren of de ECAS opdrachten per jaar correct
 * zijn verwerkt in Audit planning en Companies.
 *
 * BELANGRIJK
 * - Dit is geen runtime planning engine.
 * - Dit schrijft geen planning/availability.
 * - Altijd eerst dry run draaien.
 * - Report tabs worden automatisch opnieuw aangemaakt/overschreven.
 * - Volgend jaar hoef je oude report tabs dus NIET te hebben.
 *
 * INPUTTAB
 * BronBedrijfUrenScopes
 *
 * Vaste bronstructuur:
 * - A: MPS-nummer
 * - B: Name
 * - C: Mandated time
 * - D: Services
 * - F1: Import_Year
 * - G1: jaar, bijvoorbeeld 2026 / 2027
 *
 * CONFIGTAB
 * Config_Scopes
 * Verwachte headers:
 * - SlotKey      bv SCOPE_01
 * - ScopeCode    bv MPS-ABC
 * - DisplayName  bv MPS-ABC
 *
 * BELANGRIJKE TABS
 * - Audit planning
 * - Companies
 * - Config_Scopes
 * - Log realized audits
 * - BronBedrijfUrenScopes
 *
 * VASTE REPORTTABS DIE DEZE FILE ZELF MAAKT
 * - ECAS_Import_Check_Report
 * - ECAS_ActiveAudits_Check_Report
 *
 * JAARLIJKSE WERKFLOW
 * 1. Plak ECAS brondata in BronBedrijfUrenScopes, kolommen A:D.
 * 2. Zet BronBedrijfUrenScopes!G1 op het juiste importjaar.
 * 3. Run: checkEcasImportDryRun()
 *    - Maakt/ververst ECAS_Import_Check_Report.
 *    - Controleert bron scopes/uren tegenover Audit planning.
 *    - Controleert Companies.Active Audits.
 *    - Slaat audits over die al Completed zijn in Log realized audits voor dat jaar.
 * 4. Bekijk ECAS_Import_Check_Report.
 * 5. Run pas daarna eventueel: applyEcasImportCorrections()
 *    - Corrigeert scope flags, uren en Companies.Active Audits.
 *    - Markeert gewijzigde cellen lichtrood.
 *    - Maakt geen nieuwe auditregels.
 * 6. Als er missing audit planning rows zijn en je wilt ze aanmaken:
 *    run: createMissingEcasAuditPlanningRowsFromReport()
 *    - Deze functie gebruikt ECAS_Import_Check_Report.
 *    - Daarom eerst checkEcasImportDryRun() draaien.
 *    - Als het report volgend jaar niet bestaat: geen probleem, eerst dry run draaien.
 * 7. Run optioneel: CHECK_ActiveAudits_vs_AuditPlanning()
 *    - Maakt/ververst ECAS_ActiveAudits_Check_Report.
 *    - Controleert Companies.Active Audits vs Audit planning vs Completed in Log realized audits.
 *
 * MAIN FUNCTIONS
 * - checkEcasImportDryRun()
 * - applyEcasImportCorrections()
 * - createMissingEcasAuditPlanningRowsFromReport()
 * - CHECK_ActiveAudits_vs_AuditPlanning()
 *
 * JAARREGELS
 * - Als MPS-ABC de enige scope is voor het importjaar:
 *   Birthdate certificate in Audit planning kolom U wordt yyyy-12-31.
 * - Nieuwe auditregels die worden aangemaakt krijgen status Pending planning in kolom AC.
 *
 * MATCHING GOVERNANCE
 * - Bron MPS-nummer -> Companies.Number -> Companies.Company_UID -> Audit planning.Company_UID
 * - Log realized audits checkt Completed via Company_UID en importjaar.
 *
 * SCOPE GOVERNANCE
 * - Scope mapping komt uit Config_Scopes.
 * - In Audit planning zijn scopekolommen C,E,G,I,K,M,O,Q.
 * - Urenkolommen zijn D,F,H,J,L,N,P,R.
 * - Een scope is aanwezig als de cel iets bevat, bijvoorbeeld x/X/TRUE/checkbox.
 *
 ************************************************************************************/

/**
 * ECAS_AnnualValidation.gs
 * Build: 2026-04-30_MERGED_ANNUAL_VALIDATION
 *
 * Jaarlijkse ECAS controle/import file.
 *
 * Input tabs:
 * - BronBedrijfUrenScopes
 * - Config_Scopes
 * - Companies
 * - Audit planning
 * - Log realized audits
 *
 * Output/report tabs:
 * - ECAS_Import_Check_Report
 * - ECAS_ActiveAudits_Check_Report
 *
 * Main functions:
 * - checkEcasImportDryRun
 * - applyEcasImportCorrections
 * - createMissingEcasAuditPlanningRowsFromReport
 * - CHECK_ActiveAudits_vs_AuditPlanning
 */

/**
 * ECAS_ImportValidation.gs
 * Build: 2026-04-30_YEAR_RULES
 *
 * Purpose:
 * - Annual ECAS source validation from BronBedrijfUrenScopes.
 * - Source matching by MPS number via Companies.Number.
 * - Audit planning matching by Company_UID.
 * - Completed audit skip check via Log realized audits.Company_UID + Year/Date completed/Date planned.
 * - Dry-run first, apply second.
 * - Scope flag validation accepts any non-empty target value as present (x/X/TRUE/etc.).
 * - If MPS-ABC is the only scope for the import year, Birthdate certificate is set to yyyy-12-31.
 * - Optional missing-row creator sets new rows to Status = Pending planning.
 *
 * Source tab BronBedrijfUrenScopes:
 * - A: MPS-nummer
 * - B: Name
 * - C: Mandated time
 * - D: Services
 * - F1: Import_Year
 * - G1: 2026 etc.
 *
 * Config_Scopes expected headers:
 * - SlotKey
 * - ScopeCode
 * - DisplayName
 */

const ECAS_IMPORT_VALIDATION_BUILD = '2026-04-30_YEAR_RULES';

function checkEcasImportDryRun() {
  const ss = SpreadsheetApp.getActive();

  const cfg = getEcasImportValidationConfig_();
  const ctx = buildEcasImportContext_(ss, cfg);

  const sourceModel = buildEcasSourceModel_(ctx.sourceSheet);
  const scopeMap = buildEcasScopeMap_(ctx.configScopesSheet);
  const companiesIndex = buildEcasCompaniesIndex_(ctx.companiesSheet, cfg);
  const auditPlanningIndex = buildEcasAuditPlanningIndex_(ctx.auditPlanningSheet, cfg);
  const completedIndex = buildEcasCompletedIndex_(ctx.realizedSheet, cfg, ctx.importYear);

  const reportRows = [];
  const now = new Date();

  Object.keys(sourceModel).sort().forEach(function(mpsNumber) {
    const sourceCompany = sourceModel[mpsNumber];
    const companyInfo = companiesIndex.byMps[mpsNumber];

    if (!companyInfo) {
      Object.keys(sourceCompany.scopes).forEach(function(scopeCode) {
        reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, '', scopeCode, sourceCompany.scopes[scopeCode], '', '', '', 'COMPANY_NOT_FOUND', 'Add/check company in Companies by Number', 'PENDING'));
      });
      return;
    }

    const companyUid = companyInfo.companyUid;

    if (completedIndex.byCompanyUid[companyUid]) {
      reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, '', '', '', '', '', 'SKIP_ALREADY_COMPLETED', 'Already completed in import year; no Audit planning row required', 'SKIPPED'));
      return;
    }

    if (String(companyInfo.activeAudits || '').trim().toUpperCase() !== 'YES') {
      reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, '', '', '', '', companyInfo.activeAudits, 'COMPANY_ACTIVE_AUDITS_NOT_YES', 'Set Companies.Active Audits to YES', 'PENDING'));
    }

    const auditInfo = auditPlanningIndex.byCompanyUid[companyUid];

    if (!auditInfo) {
      Object.keys(sourceCompany.scopes).forEach(function(scopeCode) {
        reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, scopeCode, sourceCompany.scopes[scopeCode], '', '', '', 'MISSING_IN_AUDIT_PLANNING', 'Create/check Audit planning row for Company_UID', 'PENDING'));
      });
      return;
    }

    if (ecasIsMpsAbcOnly_(sourceCompany.scopes)) {
      const expectedBirthdate = ctx.importYear + '-12-31';
      const currentBirthdate = normalizeEcasDateText_(auditInfo.values[cfg.auditPlanning.birthdateCol - 1]);

      if (currentBirthdate !== expectedBirthdate) {
        reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, 'MPS-ABC', expectedBirthdate, expectedBirthdate, 'U', currentBirthdate, 'BIRTHDATE_REQUIRED_MPS_ABC_ONLY', 'Set Birthdate certificate to ' + expectedBirthdate, 'PENDING'));
      }
    }

    Object.keys(sourceCompany.scopes).sort().forEach(function(scopeCode) {
      const sourceHours = normalizeEcasNumber_(sourceCompany.scopes[scopeCode]);
      const mapInfo = scopeMap.bySourceCode[normalizeEcasKey_(scopeCode)] || scopeMap.byDisplayName[normalizeEcasKey_(scopeCode)];

      if (!mapInfo) {
        reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, scopeCode, sourceHours, '', '', '', 'SCOPE_MAPPING_NOT_FOUND', 'Add/check ScopeCode or DisplayName in Config_Scopes', 'PENDING'));
        return;
      }

      const target = cfg.scopeTargets[mapInfo.slotKey];

      if (!target) {
        reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, scopeCode, sourceHours, mapInfo.slotKey, '', '', 'TARGET_SLOT_NOT_SUPPORTED', 'Check target scope columns C:R / SlotKey', 'PENDING'));
        return;
      }

      const rowValues = auditInfo.values;
      const scopeValue = String(rowValues[target.scopeCol - 1] || '').trim();
      const targetHours = normalizeEcasNumber_(rowValues[target.hoursCol - 1]);
      const expectedFlag = 'x';

      if (!scopeValue) {
        reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, scopeCode, sourceHours, expectedFlag, target.a1Scope, scopeValue, 'MISSING_SCOPE_FLAG', 'Set ' + target.a1Scope + ' to x', 'PENDING'));
      }

      if (!ecasNumbersEqual_(sourceHours, targetHours)) {
        reportRows.push(makeEcasReportRow_(now, ctx.importYear, mpsNumber, sourceCompany.name, companyUid, scopeCode, sourceHours, targetHours, target.a1Hours, targetHours, 'HOURS_MISMATCH', 'Set ' + target.a1Hours + ' to source hours', 'PENDING'));
      }
    });
  });

  writeEcasImportReport_(ss, cfg.reportTab, reportRows);

  Logger.log(JSON.stringify({
    ok: true,
    build: ECAS_IMPORT_VALIDATION_BUILD,
    mode: 'DRY_RUN',
    importYear: ctx.importYear,
    sourceCompanies: Object.keys(sourceModel).length,
    reportRows: reportRows.length,
    reportTab: cfg.reportTab
  }, null, 2));
}

function applyEcasImportCorrections() {
  const ss = SpreadsheetApp.getActive();
  const cfg = getEcasImportValidationConfig_();

  const reportSheet = ss.getSheetByName(cfg.reportTab);
  if (!reportSheet) throw new Error('Missing report tab: ' + cfg.reportTab + '. Run checkEcasImportDryRun first.');

  const ctx = buildEcasImportContext_(ss, cfg);
  const scopeMap = buildEcasScopeMap_(ctx.configScopesSheet);
  const companiesIndex = buildEcasCompaniesIndex_(ctx.companiesSheet, cfg);
  const auditPlanningIndex = buildEcasAuditPlanningIndex_(ctx.auditPlanningSheet, cfg);

  const values = reportSheet.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log(JSON.stringify({ ok: true, build: ECAS_IMPORT_VALIDATION_BUILD, mode: 'APPLY', applied: 0, message: 'No report rows.' }, null, 2));
    return;
  }

  const headers = values[0].map(String);
  const col = headerIndexMap_(headers);
  const required = ['MPS_Number', 'Company_UID', 'Scope', 'Source_Hours', 'Issue_Type', 'Apply_Status'];
  required.forEach(function(h) {
    if (col[h] === undefined) throw new Error('Report missing column: ' + h);
  });

  let applied = 0;
  let skipped = 0;
  const red = cfg.changedCellColor;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const status = String(row[col.Apply_Status] || '').trim().toUpperCase();
    if (status === 'APPLIED' || status === 'SKIPPED') {
      skipped++;
      continue;
    }

    const issueType = String(row[col.Issue_Type] || '').trim();
    const mpsNumber = String(row[col.MPS_Number] || '').trim();
    const companyUid = String(row[col.Company_UID] || '').trim();
    const scopeCode = String(row[col.Scope] || '').trim();
    const sourceHours = normalizeEcasNumber_(row[col.Source_Hours]);

    if (issueType === 'COMPANY_ACTIVE_AUDITS_NOT_YES') {
      const companyInfo = companiesIndex.byMps[mpsNumber];
      if (companyInfo) {
        const cell = ctx.companiesSheet.getRange(companyInfo.rowNumber, companiesIndex.cols.activeAudits + 1);
        cell.setValue('YES');
        cell.setBackground(red);
        reportSheet.getRange(r + 1, col.Apply_Status + 1).setValue('APPLIED');
        applied++;
      }
      continue;
    }

    if (issueType === 'BIRTHDATE_REQUIRED_MPS_ABC_ONLY') {
      const auditInfo = auditPlanningIndex.byCompanyUid[companyUid];
      if (auditInfo) {
        const expectedBirthdate = String(row[col.Target_Value] || '').trim();
        const cell = ctx.auditPlanningSheet.getRange(auditInfo.rowNumber, cfg.auditPlanning.birthdateCol);
        cell.setValue(expectedBirthdate);
        cell.setBackground(red);
        reportSheet.getRange(r + 1, col.Apply_Status + 1).setValue('APPLIED');
        applied++;
      }
      continue;
    }

    if (issueType === 'MISSING_SCOPE_FLAG' || issueType === 'HOURS_MISMATCH') {
      const auditInfo = auditPlanningIndex.byCompanyUid[companyUid];
      const mapInfo = scopeMap.bySourceCode[normalizeEcasKey_(scopeCode)] || scopeMap.byDisplayName[normalizeEcasKey_(scopeCode)];
      if (!auditInfo || !mapInfo || !cfg.scopeTargets[mapInfo.slotKey]) continue;

      const target = cfg.scopeTargets[mapInfo.slotKey];

      if (issueType === 'MISSING_SCOPE_FLAG') {
        const cell = ctx.auditPlanningSheet.getRange(auditInfo.rowNumber, target.scopeCol);
        cell.setValue('x');
        cell.setBackground(red);
      }

      if (issueType === 'HOURS_MISMATCH') {
        const cell = ctx.auditPlanningSheet.getRange(auditInfo.rowNumber, target.hoursCol);
        cell.setValue(sourceHours);
        cell.setBackground(red);
      }

      reportSheet.getRange(r + 1, col.Apply_Status + 1).setValue('APPLIED');
      applied++;
      continue;
    }
  }

  Logger.log(JSON.stringify({
    ok: true,
    build: ECAS_IMPORT_VALIDATION_BUILD,
    mode: 'APPLY',
    applied: applied,
    skipped: skipped
  }, null, 2));
}

function getEcasImportValidationConfig_() {
  return {
    sourceTab: 'BronBedrijfUrenScopes',
    auditPlanningTab: 'Audit planning',
    companiesTab: 'Companies',
    configScopesTab: 'Config_Scopes',
    realizedTab: 'Log realized audits',
    reportTab: 'ECAS_Import_Check_Report',
    changedCellColor: '#f4cccc',
    auditPlanning: {
      companyCol: 1,
      locationCol: 2,
      totalHoursCol: 19,
      totalDaysCol: 20,
      birthdateCol: 21,
      statusCol: 29,
      companyUidCol: 39,
      defaultLocation: 'HQ',
      defaultNewStatus: 'Pending planning'
    },
    scopeTargets: {
      SCOPE_01: { scopeCol: 3, hoursCol: 4, a1Scope: 'C', a1Hours: 'D' },
      SCOPE_02: { scopeCol: 5, hoursCol: 6, a1Scope: 'E', a1Hours: 'F' },
      SCOPE_03: { scopeCol: 7, hoursCol: 8, a1Scope: 'G', a1Hours: 'H' },
      SCOPE_04: { scopeCol: 9, hoursCol: 10, a1Scope: 'I', a1Hours: 'J' },
      SCOPE_05: { scopeCol: 11, hoursCol: 12, a1Scope: 'K', a1Hours: 'L' },
      SCOPE_06: { scopeCol: 13, hoursCol: 14, a1Scope: 'M', a1Hours: 'N' },
      SCOPE_07: { scopeCol: 15, hoursCol: 16, a1Scope: 'O', a1Hours: 'P' },
      SCOPE_08: { scopeCol: 17, hoursCol: 18, a1Scope: 'Q', a1Hours: 'R' }
    }
  };
}

function buildEcasImportContext_(ss, cfg) {
  const sourceSheet = mustGetSheet_(ss, cfg.sourceTab);
  const auditPlanningSheet = mustGetSheet_(ss, cfg.auditPlanningTab);
  const companiesSheet = mustGetSheet_(ss, cfg.companiesTab);
  const configScopesSheet = mustGetSheet_(ss, cfg.configScopesTab);
  const realizedSheet = mustGetSheet_(ss, cfg.realizedTab);
  const importYear = String(sourceSheet.getRange('G1').getDisplayValue() || sourceSheet.getRange('G1').getValue() || '').trim();

  if (!/^\d{4}$/.test(importYear)) {
    throw new Error('Import year missing/invalid in ' + cfg.sourceTab + '!G1');
  }

  return {
    sourceSheet: sourceSheet,
    auditPlanningSheet: auditPlanningSheet,
    companiesSheet: companiesSheet,
    configScopesSheet: configScopesSheet,
    realizedSheet: realizedSheet,
    importYear: importYear
  };
}

function buildEcasSourceModel_(sheet) {
  const values = sheet.getDataRange().getValues();
  const model = {};

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const mpsNumber = normalizeEcasMps_(row[0]);
    const name = String(row[1] || '').trim();
    const hours = normalizeEcasNumber_(row[2]);
    const scopeCode = String(row[3] || '').trim();

    if (!mpsNumber || !scopeCode) continue;

    if (!model[mpsNumber]) {
      model[mpsNumber] = { name: name, scopes: {} };
    }

    if (!model[mpsNumber].name && name) model[mpsNumber].name = name;
    model[mpsNumber].scopes[scopeCode] = hours;
  }

  return model;
}

function buildEcasScopeMap_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Config_Scopes has no data');

  const headers = values[0].map(function(h) { return String(h || '').trim(); });
  const col = headerIndexMap_(headers);

  const slotCol = col.SlotKey;
  const codeCol = col.ScopeCode;
  const displayCol = col.DisplayName;

  if (slotCol === undefined || codeCol === undefined) {
    throw new Error('Config_Scopes needs headers SlotKey and ScopeCode. Headers found: ' + headers.join(' | '));
  }

  const map = { bySourceCode: {}, byDisplayName: {} };

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const slotKey = String(row[slotCol] || '').trim().toUpperCase();
    const scopeCode = String(row[codeCol] || '').trim();
    const displayName = displayCol === undefined ? '' : String(row[displayCol] || '').trim();

    if (!slotKey || !scopeCode) continue;

    map.bySourceCode[normalizeEcasKey_(scopeCode)] = { slotKey: slotKey, scopeCode: scopeCode, displayName: displayName };
    if (displayName) map.byDisplayName[normalizeEcasKey_(displayName)] = { slotKey: slotKey, scopeCode: scopeCode, displayName: displayName };
  }

  return map;
}

function buildEcasCompaniesIndex_(sheet, cfg) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h || '').trim(); });
  const col = headerIndexMap_(headers);

  const numberCol = col.Number !== undefined ? col.Number : 5;
  const companyUidCol = col.Company_UID !== undefined ? col.Company_UID : 19;
  const activeAuditsCol = col['Active Audits'] !== undefined ? col['Active Audits'] : 18;
  const companyNameCol = col.Company !== undefined ? col.Company : 0;

  const byMps = {};
  const byCompanyUid = {};

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const mpsNumber = normalizeEcasMps_(row[numberCol]);
    const companyUid = String(row[companyUidCol] || '').trim();
    if (!mpsNumber && !companyUid) continue;

    const item = {
      rowNumber: r + 1,
      mpsNumber: mpsNumber,
      companyUid: companyUid,
      companyName: String(row[companyNameCol] || '').trim(),
      activeAudits: String(row[activeAuditsCol] || '').trim()
    };

    if (mpsNumber) byMps[mpsNumber] = item;
    if (companyUid) byCompanyUid[companyUid] = item;
  }

  return {
    byMps: byMps,
    byCompanyUid: byCompanyUid,
    cols: {
      number: numberCol,
      companyUid: companyUidCol,
      activeAudits: activeAuditsCol,
      companyName: companyNameCol
    }
  };
}

function buildEcasAuditPlanningIndex_(sheet, cfg) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h || '').trim(); });
  const col = headerIndexMap_(headers);

  const companyUidCol = col.Company_UID !== undefined ? col.Company_UID : (cfg.auditPlanning.companyUidCol - 1);
  if (companyUidCol === undefined || companyUidCol < 0) {
    throw new Error('Audit planning missing Company_UID column. Headers found: ' + headers.join(' | '));
  }

  const byCompanyUid = {};

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const companyUid = String(row[companyUidCol] || '').trim();
    if (!companyUid) continue;

    byCompanyUid[companyUid] = {
      rowNumber: r + 1,
      companyUid: companyUid,
      values: row
    };
  }

  return { byCompanyUid: byCompanyUid, cols: { companyUid: companyUidCol } };
}

function buildEcasCompletedIndex_(sheet, cfg, importYear) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { byCompanyUid: {} };

  const headers = values[0].map(function(h) { return String(h || '').trim(); });
  const col = headerIndexMap_(headers);

  const companyUidCol = col.Company_UID !== undefined ? col.Company_UID : 20;
  const yearCol = col.Year;
  const dateCompletedCol = col['Date completed'];
  const datePlannedCol = col['Date planned'];
  const statusCol = col.Status;

  if (companyUidCol === undefined || companyUidCol < 0) {
    throw new Error('Log realized audits missing Company_UID column. Headers found: ' + headers.join(' | '));
  }

  const byCompanyUid = {};

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const companyUid = String(row[companyUidCol] || '').trim();
    if (!companyUid) continue;

    const status = statusCol === undefined ? '' : String(row[statusCol] || '').trim().toUpperCase();
    const yearValue = yearCol === undefined ? '' : String(row[yearCol] || '').trim();
    const completedValue = dateCompletedCol === undefined ? '' : row[dateCompletedCol];
    const plannedValue = datePlannedCol === undefined ? '' : row[datePlannedCol];

    const matchesYear =
      yearValue === importYear ||
      dateValueContainsYear_(completedValue, importYear) ||
      dateValueContainsYear_(plannedValue, importYear);

    const looksCompleted = !status || status === 'COMPLETED' || status === 'COMPLETE' || completedValue;

    if (matchesYear && looksCompleted) {
      byCompanyUid[companyUid] = true;
    }
  }

  return { byCompanyUid: byCompanyUid };
}


function createMissingEcasAuditPlanningRowsFromReport() {
  const ss = SpreadsheetApp.getActive();
  const cfg = getEcasImportValidationConfig_();

  const reportSheet = ss.getSheetByName(cfg.reportTab);
  if (!reportSheet) throw new Error('Missing report tab: ' + cfg.reportTab + '. Run checkEcasImportDryRun first.');

  const ctx = buildEcasImportContext_(ss, cfg);
  const sourceModel = buildEcasSourceModel_(ctx.sourceSheet);
  const scopeMap = buildEcasScopeMap_(ctx.configScopesSheet);
  const companiesIndex = buildEcasCompaniesIndex_(ctx.companiesSheet, cfg);
  const auditPlanningIndex = buildEcasAuditPlanningIndex_(ctx.auditPlanningSheet, cfg);
  const completedIndex = buildEcasCompletedIndex_(ctx.realizedSheet, cfg, ctx.importYear);

  const values = reportSheet.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log(JSON.stringify({ ok: true, build: ECAS_IMPORT_VALIDATION_BUILD, mode: 'CREATE_MISSING_ROWS', created: 0, message: 'No report rows.' }, null, 2));
    return;
  }

  const headers = values[0].map(String);
  const col = headerIndexMap_(headers);
  if (col.Issue_Type === undefined || col.MPS_Number === undefined || col.Apply_Status === undefined) {
    throw new Error('Report missing required columns for createMissingEcasAuditPlanningRowsFromReport');
  }

  const missingMps = {};
  for (let r = 1; r < values.length; r++) {
    const issueType = String(values[r][col.Issue_Type] || '').trim();
    const applyStatus = String(values[r][col.Apply_Status] || '').trim().toUpperCase();
    const mpsNumber = String(values[r][col.MPS_Number] || '').trim();

    if (issueType === 'MISSING_IN_AUDIT_PLANNING' && applyStatus !== 'APPLIED' && mpsNumber) {
      missingMps[mpsNumber] = true;
    }
  }

  const newRows = [];
  const createdMps = [];

  Object.keys(missingMps).sort().forEach(function(mpsNumber) {
    const sourceCompany = sourceModel[mpsNumber];
    const companyInfo = companiesIndex.byMps[mpsNumber];

    if (!sourceCompany || !companyInfo || !companyInfo.companyUid) return;
    if (completedIndex.byCompanyUid[companyInfo.companyUid]) return;
    if (auditPlanningIndex.byCompanyUid[companyInfo.companyUid]) return;

    const row = new Array(ctx.auditPlanningSheet.getLastColumn()).fill('');
    row[cfg.auditPlanning.companyCol - 1] = companyInfo.companyName || sourceCompany.name;
    row[cfg.auditPlanning.locationCol - 1] = cfg.auditPlanning.defaultLocation;
    row[cfg.auditPlanning.companyUidCol - 1] = companyInfo.companyUid;
    row[cfg.auditPlanning.statusCol - 1] = cfg.auditPlanning.defaultNewStatus;

    let totalHours = 0;

    Object.keys(sourceCompany.scopes).forEach(function(scopeCode) {
      const mapInfo = scopeMap.bySourceCode[normalizeEcasKey_(scopeCode)] || scopeMap.byDisplayName[normalizeEcasKey_(scopeCode)];
      if (!mapInfo || !cfg.scopeTargets[mapInfo.slotKey]) return;

      const target = cfg.scopeTargets[mapInfo.slotKey];
      const hours = normalizeEcasNumber_(sourceCompany.scopes[scopeCode]);
      row[target.scopeCol - 1] = 'x';
      row[target.hoursCol - 1] = hours;
      totalHours += hours;
    });

    row[cfg.auditPlanning.totalHoursCol - 1] = totalHours;
    row[cfg.auditPlanning.totalDaysCol - 1] = totalHours ? Math.ceil((totalHours / 8) * 100) / 100 : '';

    if (ecasIsMpsAbcOnly_(sourceCompany.scopes)) {
      row[cfg.auditPlanning.birthdateCol - 1] = ctx.importYear + '-12-31';
    }

    newRows.push(row);
    createdMps.push(mpsNumber);
  });

  if (newRows.length) {
    const startRow = ctx.auditPlanningSheet.getLastRow() + 1;
    ctx.auditPlanningSheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
    ctx.auditPlanningSheet.getRange(startRow, 1, newRows.length, newRows[0].length).setBackground(cfg.changedCellColor);
  }

  for (let r = 1; r < values.length; r++) {
    const issueType = String(values[r][col.Issue_Type] || '').trim();
    const mpsNumber = String(values[r][col.MPS_Number] || '').trim();
    if (issueType === 'MISSING_IN_AUDIT_PLANNING' && createdMps.indexOf(mpsNumber) !== -1) {
      reportSheet.getRange(r + 1, col.Apply_Status + 1).setValue('APPLIED');
    }
  }

  Logger.log(JSON.stringify({
    ok: true,
    build: ECAS_IMPORT_VALIDATION_BUILD,
    mode: 'CREATE_MISSING_ROWS',
    created: newRows.length,
    createdMps: createdMps
  }, null, 2));
}

function ecasIsMpsAbcOnly_(scopes) {
  const keys = Object.keys(scopes || {}).filter(function(k) { return String(k || '').trim(); });
  if (keys.length !== 1) return false;
  return normalizeEcasKey_(keys[0]) === normalizeEcasKey_('MPS-ABC');
}

function normalizeEcasDateText_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  const raw = String(value || '').trim();
  if (!raw) return '';

  const m1 = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m1) return m1[1] + '-' + String(m1[2]).padStart(2, '0') + '-' + String(m1[3]).padStart(2, '0');

  const m2 = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m2) return m2[3] + '-' + String(m2[2]).padStart(2, '0') + '-' + String(m2[1]).padStart(2, '0');

  return raw;
}

function writeEcasImportReport_(ss, reportTab, rows) {
  const sheet = ss.getSheetByName(reportTab) || ss.insertSheet(reportTab);
  sheet.clear();

  const headers = [
    'Timestamp',
    'Import_Year',
    'MPS_Number',
    'Company',
    'Company_UID',
    'Scope',
    'Source_Hours',
    'Target_Value',
    'Target_Cell',
    'Current_Value',
    'Issue_Type',
    'Proposed_Action',
    'Apply_Status'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.autoResizeColumns(1, headers.length);
  sheet.setFrozenRows(1);
}

function makeEcasReportRow_(timestamp, importYear, mpsNumber, company, companyUid, scope, sourceHours, targetValue, targetCell, currentValue, issueType, proposedAction, applyStatus) {
  return [
    timestamp,
    importYear,
    mpsNumber,
    company,
    companyUid,
    scope,
    sourceHours,
    targetValue,
    targetCell,
    currentValue,
    issueType,
    proposedAction,
    applyStatus
  ];
}

function mustGetSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Missing tab: ' + name);
  return sheet;
}

function headerIndexMap_(headers) {
  const map = {};
  headers.forEach(function(h, idx) {
    const key = String(h || '').trim();
    if (key) map[key] = idx;
  });
  return map;
}

function normalizeEcasMps_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\.0$/, '').replace(/\s+/g, '');
}

function normalizeEcasKey_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeEcasNumber_(value) {
  if (typeof value === 'number') return value;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function ecasNumbersEqual_(a, b) {
  return Math.abs(normalizeEcasNumber_(a) - normalizeEcasNumber_(b)) < 0.0001;
}

function dateValueContainsYear_(value, year) {
  if (!value) return false;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return String(value.getFullYear()) === String(year);
  }

  return String(value || '').indexOf(String(year)) !== -1;
}



/* ============================================================================
 * ACTIVE AUDITS VS AUDIT PLANNING ANNUAL CONSISTENCY CHECK
 * Uses BronBedrijfUrenScopes!G1 as import year.
 * Report tab: ECAS_ActiveAudits_Check_Report.
 * ============================================================================ */

var CHECK_ACTIVE_AUDITS_VERSION = '2026-04-30_003_MERGED_ECAS_ANNUAL';

var CHECK_ACTIVE_AUDITS_COMPANIES_TAB = 'Companies';
var CHECK_ACTIVE_AUDITS_PLANNING_TAB = 'Audit planning';
var CHECK_ACTIVE_AUDITS_LRA_TAB = 'Log realized audits';
var CHECK_ACTIVE_AUDITS_REPORT_TAB = 'ECAS_ActiveAudits_Check_Report';

var CHECK_ACTIVE_AUDITS_YEAR_FALLBACK = '2026';

function CHECK_ActiveAudits_vs_AuditPlanning() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var checkYear = CHECK_AA_getImportYear_(ss);

  var companiesSheet = ss.getSheetByName(CHECK_ACTIVE_AUDITS_COMPANIES_TAB);
  var planningSheet = ss.getSheetByName(CHECK_ACTIVE_AUDITS_PLANNING_TAB);
  var lraSheet = ss.getSheetByName(CHECK_ACTIVE_AUDITS_LRA_TAB);

  if (!companiesSheet) throw new Error('Missing tab: ' + CHECK_ACTIVE_AUDITS_COMPANIES_TAB);
  if (!planningSheet) throw new Error('Missing tab: ' + CHECK_ACTIVE_AUDITS_PLANNING_TAB);
  if (!lraSheet) throw new Error('Missing tab: ' + CHECK_ACTIVE_AUDITS_LRA_TAB);

  var companiesPack = CHECK_AA_readSheet_(companiesSheet);
  var planningPack = CHECK_AA_readSheet_(planningSheet);
  var lraPack = CHECK_AA_readSheet_(lraSheet);

  var companies = CHECK_AA_buildCompanies_(companiesPack);
  var planningActive = CHECK_AA_buildPlanningActive_(planningPack);
  var lraCompleted2026 = CHECK_AA_buildLraCompletedForYear_(lraPack, checkYear);

  var rows = [];
  var stats = {
    companies: Object.keys(companies.byUid).length,
    companiesYes: 0,
    planningActiveCompanies: Object.keys(planningActive.byUid).length,
    lraCompleted2026Companies: Object.keys(lraCompleted2026.byUid).length,
    okActivePlanning: 0,
    okCompleted2026NoPlanning: 0,
    yesButNoPlanningNoCompleted2026: 0,
    planningButCompaniesNotYes: 0,
    planningAndCompleted2026: 0,
    missingCompanyUidPlanning: planningActive.missingCompanyUidRows.length,
    missingCompanyUidLra: lraCompleted2026.missingCompanyUidRows.length,
    duplicateActivePlanningGroups: planningActive.duplicateGroups.length
  };

  var allUids = {};

  Object.keys(companies.byUid).forEach(function(uid) { allUids[uid] = true; });
  Object.keys(planningActive.byUid).forEach(function(uid) { allUids[uid] = true; });
  Object.keys(lraCompleted2026.byUid).forEach(function(uid) { allUids[uid] = true; });

  Object.keys(allUids).sort().forEach(function(uid) {
    var company = companies.byUid[uid] || null;
    var cYes = company ? CHECK_AA_isYes_(company.activeAudits) : false;
    var hasPlanning = !!planningActive.byUid[uid];
    var hasCompleted2026 = !!lraCompleted2026.byUid[uid];

    if (cYes) stats.companiesYes++;

    var category = '';
    var severity = '';
    var expected = '';

    if (cYes && hasPlanning) {
      category = 'OK_ACTIVE_PLANNING';
      severity = 'OK';
      expected = 'Company has YES and active Audit planning row.';
      stats.okActivePlanning++;
    } else if (cYes && !hasPlanning && hasCompleted2026) {
      category = 'OK_COMPLETED_2026_NO_PLANNING';
      severity = 'OK';
      expected = 'Company has YES because 2026 audit is already completed; no active Audit planning row needed.';
      stats.okCompleted2026NoPlanning++;
    } else if (cYes && !hasPlanning && !hasCompleted2026) {
      category = 'YES_IN_COMPANIES_BUT_NO_AUDIT_PLANNING_AND_NO_2026_COMPLETED';
      severity = 'CHECK';
      expected = 'Should have active Audit planning row OR 2026 Completed audit in LRA.';
      stats.yesButNoPlanningNoCompleted2026++;
    } else if (!cYes && hasPlanning) {
      category = 'AUDIT_PLANNING_BUT_COMPANIES_NOT_YES';
      severity = 'CHECK';
      expected = 'Company Active Audits should probably be YES.';
      stats.planningButCompaniesNotYes++;
    } else if (!cYes && !hasPlanning && hasCompleted2026) {
      category = 'COMPLETED_2026_BUT_COMPANIES_NOT_YES';
      severity = 'CHECK';
      expected = 'Company Active Audits should probably be YES because a 2026 audit was completed.';
      stats.planningButCompaniesNotYes++;
    } else {
      category = 'OK_NO_ACTIVE_AUDIT';
      severity = 'OK';
      expected = 'No active audit and no 2026 completed audit.';
    }

    if (hasPlanning && hasCompleted2026) {
      stats.planningAndCompleted2026++;
      if (severity === 'OK') severity = 'REVIEW';
      category = category + ' | ALSO_COMPLETED_2026_AND_ACTIVE_PLANNING';
      expected = expected + ' Review whether active planning row is a future/new cycle or duplicate.';
    }

    rows.push([
      severity,
      category,
      uid,
      company ? company.company : '',
      company ? company.number : '',
      company ? company.activeAudits : '',
      hasPlanning ? 'YES' : '',
      planningActive.byUid[uid] ? planningActive.byUid[uid].count : '',
      planningActive.byUid[uid] ? planningActive.byUid[uid].statuses.join(' | ') : '',
      planningActive.byUid[uid] ? planningActive.byUid[uid].scopes.join(' | ') : '',
      hasCompleted2026 ? 'YES' : '',
      lraCompleted2026.byUid[uid] ? lraCompleted2026.byUid[uid].count : '',
      lraCompleted2026.byUid[uid] ? lraCompleted2026.byUid[uid].dates.join(' | ') : '',
      lraCompleted2026.byUid[uid] ? lraCompleted2026.byUid[uid].scopes.join(' | ') : '',
      expected
    ]);
  });

  for (var i = 0; i < planningActive.missingCompanyUidRows.length; i++) {
    rows.push([
      'ERROR',
      'AUDIT_PLANNING_MISSING_COMPANY_UID',
      '',
      planningActive.missingCompanyUidRows[i].company,
      '',
      '',
      'YES',
      '',
      planningActive.missingCompanyUidRows[i].status,
      planningActive.missingCompanyUidRows[i].scopes,
      '',
      '',
      '',
      '',
      'Active Audit planning row has no Company_UID.'
    ]);
  }

  for (var j = 0; j < lraCompleted2026.missingCompanyUidRows.length; j++) {
    rows.push([
      'ERROR',
      'LRA_COMPLETED_2026_MISSING_COMPANY_UID',
      '',
      lraCompleted2026.missingCompanyUidRows[j].company,
      '',
      '',
      '',
      '',
      '',
      '',
      'YES',
      '',
      lraCompleted2026.missingCompanyUidRows[j].dateCompleted,
      lraCompleted2026.missingCompanyUidRows[j].scopes,
      'Completed 2026 LRA row has no Company_UID.'
    ]);
  }

  for (var k = 0; k < planningActive.duplicateGroups.length; k++) {
    var d = planningActive.duplicateGroups[k];
    rows.push([
      'REVIEW',
      'DUPLICATE_ACTIVE_PLANNING_SCOPE_GROUP',
      d.companyUid,
      d.company,
      '',
      '',
      'YES',
      d.count,
      d.statuses.join(' | '),
      d.scopeKey,
      '',
      '',
      '',
      '',
      'More than one active Audit planning row exists for same Company_UID + scope combination.'
    ]);
  }

  CHECK_AA_writeReport_(ss, rows, stats);

  var summary = {
    ok: true,
    version: CHECK_ACTIVE_AUDITS_VERSION,
    reportTab: CHECK_ACTIVE_AUDITS_REPORT_TAB,
    companies: stats.companies,
    companiesYes: stats.companiesYes,
    planningActiveCompanies: stats.planningActiveCompanies,
    lraCompleted2026Companies: stats.lraCompleted2026Companies,
    okActivePlanning: stats.okActivePlanning,
    okCompleted2026NoPlanning: stats.okCompleted2026NoPlanning,
    yesButNoPlanningNoCompleted2026: stats.yesButNoPlanningNoCompleted2026,
    planningButCompaniesNotYes: stats.planningButCompaniesNotYes,
    planningAndCompleted2026: stats.planningAndCompleted2026,
    missingCompanyUidPlanning: stats.missingCompanyUidPlanning,
    missingCompanyUidLra: stats.missingCompanyUidLra,
    duplicateActivePlanningGroups: stats.duplicateActivePlanningGroups,
    message: 'Check complete. Review tab ' + CHECK_ACTIVE_AUDITS_REPORT_TAB + '.'
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function CHECK_AA_buildCompanies_(pack) {
  var companyCol = CHECK_AA_findCol_(pack.map, ['Company']);
  var numberCol = CHECK_AA_findCol_(pack.map, ['Number']);
  var activeCol = CHECK_AA_findCol_(pack.map, ['Active Audits']);
  var uidCol = CHECK_AA_findCol_(pack.map, ['Company_UID', 'Company UID', 'UID']);

  if (companyCol < 0) throw new Error('Companies missing header: Company');
  if (numberCol < 0) throw new Error('Companies missing header: Number');
  if (activeCol < 0) throw new Error('Companies missing header: Active Audits');
  if (uidCol < 0) throw new Error('Companies missing header: Company_UID');

  var byUid = {};

  for (var i = 0; i < pack.rows.length; i++) {
    var row = pack.rows[i];
    var uid = CHECK_AA_clean_(row[uidCol]);
    if (!uid) continue;

    byUid[uid] = {
      rowNumber: i + 2,
      company: CHECK_AA_clean_(row[companyCol]),
      number: CHECK_AA_clean_(row[numberCol]),
      activeAudits: CHECK_AA_clean_(row[activeCol])
    };
  }

  return { byUid: byUid };
}

function CHECK_AA_buildPlanningActive_(pack) {
  var companyCol = CHECK_AA_findCol_(pack.map, ['Company']);
  var uidCol = CHECK_AA_findCol_(pack.map, ['Company_UID', 'Company UID', 'UID']);
  var statusCol = CHECK_AA_findCol_(pack.map, ['Status']);

  if (uidCol < 0) throw new Error('Audit planning missing header: Company_UID');
  if (statusCol < 0) throw new Error('Audit planning missing header: Status');

  var scopeCols = CHECK_AA_scopeCols_(pack.headers);
  var byUid = {};
  var duplicateCheck = {};
  var missingCompanyUidRows = [];

  for (var i = 0; i < pack.rows.length; i++) {
    var row = pack.rows[i];
    var status = CHECK_AA_clean_(row[statusCol]);

    if (!CHECK_AA_isActivePlanningStatus_(status)) continue;

    var uid = CHECK_AA_clean_(row[uidCol]);
    var company = companyCol >= 0 ? CHECK_AA_clean_(row[companyCol]) : '';
    var scopes = CHECK_AA_extractScopes_(row, scopeCols);

    if (!uid) {
      missingCompanyUidRows.push({
        rowNumber: i + 2,
        company: company,
        status: status,
        scopes: scopes.join(' | ')
      });
      continue;
    }

    if (!byUid[uid]) {
      byUid[uid] = {
        count: 0,
        statuses: [],
        scopes: [],
        rows: []
      };
    }

    byUid[uid].count++;
    CHECK_AA_pushUnique_(byUid[uid].statuses, status);
    CHECK_AA_pushUniqueMany_(byUid[uid].scopes, scopes);
    byUid[uid].rows.push(i + 2);

    var scopeKey = scopes.length ? scopes.sort().join('+') : 'NO_SCOPE';
    var dupKey = uid + '||' + scopeKey;
    if (!duplicateCheck[dupKey]) {
      duplicateCheck[dupKey] = {
        companyUid: uid,
        company: company,
        scopeKey: scopeKey,
        count: 0,
        statuses: [],
        rows: []
      };
    }
    duplicateCheck[dupKey].count++;
    CHECK_AA_pushUnique_(duplicateCheck[dupKey].statuses, status);
    duplicateCheck[dupKey].rows.push(i + 2);
  }

  var duplicateGroups = [];
  Object.keys(duplicateCheck).forEach(function(key) {
    if (duplicateCheck[key].count > 1) duplicateGroups.push(duplicateCheck[key]);
  });

  return {
    byUid: byUid,
    missingCompanyUidRows: missingCompanyUidRows,
    duplicateGroups: duplicateGroups
  };
}

function CHECK_AA_buildLraCompletedForYear_(pack, checkYear) {
  var companyCol = CHECK_AA_findCol_(pack.map, ['Company']);
  var uidCol = CHECK_AA_findCol_(pack.map, ['Company_UID', 'Company UID', 'UID']);
  var statusCol = CHECK_AA_findCol_(pack.map, ['Status']);
  var yearCol = CHECK_AA_findCol_(pack.map, ['Year']);
  var dateCompletedCol = CHECK_AA_findCol_(pack.map, ['Date completed', 'Date Completed']);
  var datePlannedCol = CHECK_AA_findCol_(pack.map, ['Date planned', 'Date Planned']);

  if (uidCol < 0) throw new Error('Log realized audits missing header: Company_UID');
  if (statusCol < 0) throw new Error('Log realized audits missing header: Status');

  var scopeCols = CHECK_AA_scopeCols_(pack.headers);
  var byUid = {};
  var missingCompanyUidRows = [];

  for (var i = 0; i < pack.rows.length; i++) {
    var row = pack.rows[i];
    var status = CHECK_AA_clean_(row[statusCol]);
    if (CHECK_AA_norm_(status) !== 'completed') continue;

    var year = yearCol >= 0 ? CHECK_AA_clean_(row[yearCol]) : '';
    var dateCompleted = dateCompletedCol >= 0 ? CHECK_AA_clean_(row[dateCompletedCol]) : '';
    var datePlanned = datePlannedCol >= 0 ? CHECK_AA_clean_(row[datePlannedCol]) : '';
    var bestDate = dateCompleted || datePlanned;

    if (year !== checkYear && String(bestDate).slice(0, 4) !== checkYear) continue;

    var uid = CHECK_AA_clean_(row[uidCol]);
    var company = companyCol >= 0 ? CHECK_AA_clean_(row[companyCol]) : '';
    var scopes = CHECK_AA_extractScopes_(row, scopeCols);

    if (!uid) {
      missingCompanyUidRows.push({
        rowNumber: i + 2,
        company: company,
        dateCompleted: bestDate,
        scopes: scopes.join(' | ')
      });
      continue;
    }

    if (!byUid[uid]) {
      byUid[uid] = {
        count: 0,
        dates: [],
        scopes: [],
        rows: []
      };
    }

    byUid[uid].count++;
    CHECK_AA_pushUnique_(byUid[uid].dates, bestDate);
    CHECK_AA_pushUniqueMany_(byUid[uid].scopes, scopes);
    byUid[uid].rows.push(i + 2);
  }

  return {
    byUid: byUid,
    missingCompanyUidRows: missingCompanyUidRows
  };
}

function CHECK_AA_writeReport_(ss, dataRows, stats) {
  var sh = ss.getSheetByName(CHECK_ACTIVE_AUDITS_REPORT_TAB);
  if (!sh) sh = ss.insertSheet(CHECK_ACTIVE_AUDITS_REPORT_TAB);
  sh.clearContents();

  var out = [];
  out.push(['Generated', CHECK_AA_formatDateTime_(new Date()), '', '', '', '', '', '', '', '', '', '', '', '', '']);
  out.push(['Version', CHECK_ACTIVE_AUDITS_VERSION, '', '', '', '', '', '', '', '', '', '', '', '', '']);
  out.push(['Year rule', CHECK_AA_getImportYear_(ss), '', '', '', '', '', '', '', '', '', '', '', '', '']);
  out.push(['Companies', stats.companies, 'Companies YES', stats.companiesYes, 'Planning active companies', stats.planningActiveCompanies, 'LRA completed 2026 companies', stats.lraCompleted2026Companies, '', '', '', '', '', '', '']);
  out.push(['OK active planning', stats.okActivePlanning, 'OK completed 2026 no planning', stats.okCompleted2026NoPlanning, 'YES but missing planning/completed', stats.yesButNoPlanningNoCompleted2026, 'Planning/Completed but Companies not YES', stats.planningButCompaniesNotYes, '', '', '', '', '', '', '']);
  out.push(['Planning and completed 2026 review', stats.planningAndCompleted2026, 'Missing UID planning', stats.missingCompanyUidPlanning, 'Missing UID LRA', stats.missingCompanyUidLra, 'Duplicate active planning groups', stats.duplicateActivePlanningGroups, '', '', '', '', '', '', '']);
  out.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  out.push([
    'Severity',
    'Category',
    'Company_UID',
    'Company',
    'MPS Number',
    'Companies Active Audits',
    'Has active Audit planning',
    'Audit planning row count',
    'Audit planning statuses',
    'Audit planning scopes',
    'Has Completed 2026 in LRA',
    'LRA Completed 2026 count',
    'LRA Completed 2026 dates',
    'LRA Completed 2026 scopes',
    'Expected / Comment'
  ]);

  for (var i = 0; i < dataRows.length; i++) out.push(dataRows[i]);

  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.setFrozenRows(8);
  sh.autoResizeColumns(1, out[0].length);
}


function CHECK_AA_getImportYear_(ss) {
  var fallback = CHECK_ACTIVE_AUDITS_YEAR_FALLBACK || '2026';
  var sourceSheet = ss.getSheetByName('BronBedrijfUrenScopes');
  if (!sourceSheet) return fallback;
  var year = String(sourceSheet.getRange('G1').getDisplayValue() || sourceSheet.getRange('G1').getValue() || '').trim();
  return year || fallback;
}

function CHECK_AA_readSheet_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  var rows = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues() : [];
  return {
    headers: headers,
    map: CHECK_AA_headerMap_(headers),
    rows: rows
  };
}

function CHECK_AA_headerMap_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = CHECK_AA_normHeader_(headers[i]);
    if (key) map[key] = i;
  }
  return map;
}

function CHECK_AA_findCol_(map, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var key = CHECK_AA_normHeader_(aliases[i]);
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  return -1;
}

function CHECK_AA_scopeCols_(headers) {
  var cols = [];
  for (var i = 0; i < headers.length; i++) {
    var h = CHECK_AA_clean_(headers[i]);
    if (/^SCOPE_0[1-8]$/i.test(h)) {
      cols.push({ index: i, header: h });
    }
  }
  return cols;
}

function CHECK_AA_extractScopes_(row, scopeCols) {
  var scopes = [];
  for (var i = 0; i < scopeCols.length; i++) {
    var v = CHECK_AA_clean_(row[scopeCols[i].index]);
    if (CHECK_AA_isScopeFilled_(v)) scopes.push(scopeCols[i].header);
  }
  return scopes;
}

function CHECK_AA_isScopeFilled_(v) {
  var s = CHECK_AA_norm_(v);
  return s === 'x' || s === 'yes' || s === 'true' || s === '1' || (!!s && s !== 'no' && s !== 'false' && s !== '0');
}

function CHECK_AA_isActivePlanningStatus_(status) {
  var s = CHECK_AA_norm_(status);
  return s === 'pending planning' ||
    s === 'pending approval' ||
    s === 'approved' ||
    s === 'accepted';
}

function CHECK_AA_isYes_(v) {
  return CHECK_AA_norm_(v) === 'yes';
}

function CHECK_AA_pushUnique_(arr, value) {
  value = CHECK_AA_clean_(value);
  if (!value) return;
  if (arr.indexOf(value) < 0) arr.push(value);
}

function CHECK_AA_pushUniqueMany_(arr, values) {
  for (var i = 0; i < values.length; i++) CHECK_AA_pushUnique_(arr, values[i]);
}

function CHECK_AA_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CHECK_AA_norm_(v) {
  return CHECK_AA_clean_(v).toLowerCase().replace(/\s+/g, ' ');
}

function CHECK_AA_normHeader_(v) {
  return CHECK_AA_clean_(v).toLowerCase().replace(/[_\-–—]+/g, ' ').replace(/\s+/g, ' ');
}

function CHECK_AA_formatDateTime_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
