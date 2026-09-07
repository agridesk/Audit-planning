// BUILD: ManagerPlanningUILogicSource_d23_ENV_AWARE_TOOLKIT_LOGGING_20260514
// Serves ManagerPlanningUI_logic as plain JavaScript source for deferred browser injection.
// Required because HtmlService cannot render raw JS partials as standalone HTML.

function ManagerPlanningUI_getLogicSource() {
  var html = HtmlService.createHtmlOutputFromFile('ManagerPlanningUI_logic').getContent();
  var m = String(html || '').match(/<script[^>]*id=["']ManagerPlanningUI_logic_source["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m || !m[1]) {
    throw new Error('ManagerPlanningUI_logic source wrapper not found or empty');
  }

  return String(m[1])
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
