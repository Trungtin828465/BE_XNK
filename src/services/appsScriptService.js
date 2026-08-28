const { APPS_SCRIPT_TIMEOUT, getAppsScriptUrl } = require('../config/appsScript');

function isHtmlOrAuthPage(value) {
  const text = String(value || '').toLowerCase();
  return text.includes('<html') || text.includes('<!doctype') ||
    text.includes('accounts.google.com') || text.includes('sign in - google accounts');
}

function parseResponse(data) {
  if (typeof data !== 'string') return data;
  const text = data.trim();
  if (!text) return { success: false, message: 'Apps Script trả về response rỗng.' };
  if (isHtmlOrAuthPage(text)) {
    return {
      success: false,
      message: 'Apps Script trả về HTML. Kiểm tra URL /exec và quyền deploy Anyone.',
      raw: text.slice(0, 500),
    };
  }
  try { return JSON.parse(text); } catch {
    return { success: false, message: text.slice(0, 1000) };
  }
}

async function callAppsScript(action, params = {}, method = 'GET', body) {
  const url = new URL(getAppsScriptUrl());
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT);
  try {
    const response = await fetch(url.toString(), {
      method,
      redirect: 'follow',
      headers: {
        'User-Agent': 'be-app/1.0',
        Accept: 'application/json,text/plain,*/*',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    return parseResponse(await response.text());
  } catch (error) {
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const appsScriptService = {
  call: callAppsScript,
  getSheetTotal: () => callAppsScript('getSheetTotal'),
  getSheetSummary: () => callAppsScript('getSheetSummary'),
  getSheetNoti: () => callAppsScript('getSheetNoti'),
  getFolderById: (folderId) => callAppsScript('getFolderById', { folderId, id: folderId }),
  getArchivedDocuments: (orderCode) => callAppsScript('getArchivedDocuments', { orderCode }),
  checkDocumentsAndSaveStatus: (method) => callAppsScript('checkDocumentsAndSaveStatus', {}, method),
  updateNotifications: (method) => callAppsScript('updateNotifications', {}, method),
  moveCompletedOrder: (orderCode, method) => callAppsScript('moveCompletedOrder', { orderCode }, method),
};

module.exports = appsScriptService;
