const appsScriptService = require('../services/appsScriptService');
const emailService = require('../services/emailService');

function sendServiceError(res, error, message = 'Không thể kết nối Apps Script') {
  return res.status(error.code === 'EMAIL_CONFIG_MISSING' ? 500 : 502).json({
    success: false, message, error: error.message, apps_script: error.appsScriptResponse,
  });
}

function actionHandler(action, { method = 'GET', params = () => ({}) } = {}) {
  return async (req, res) => {
    try {
      const result = await appsScriptService.call(action, params(req), method);
      return res.status(200).json(result);
    } catch (error) { return sendServiceError(res, error); }
  };
}

const getSheetTotal = actionHandler('getSheetTotal');
const getSheetSummary = actionHandler('getSheetSummary');
const getSheetNoti = actionHandler('getSheetNoti');
const getFolderById = actionHandler('getFolderById', {
  params: (req) => ({ folderId: req.query.folderId || req.query.id }),
});
const getArchivedDocuments = actionHandler('getArchivedDocuments', {
  params: (req) => ({ orderCode: req.query.orderCode || req.body?.orderCode }),
});
const checkDocumentsAndSaveStatus = actionHandler('checkDocumentsAndSaveStatus', { method: 'POST' });
const moveCompletedOrder = actionHandler('moveCompletedOrder', {
  method: 'POST', params: (req) => ({ orderCode: req.query.orderCode || req.body?.orderCode }),
});
const getSheetReturnItem = actionHandler('getSheetReturnItem');

async function editSummary(req, res) {
  const { orderCode, order_code: legacyOrderCode, data, updates } = req.body || {};
  const resolvedOrderCode = orderCode || legacyOrderCode;
  const changes = data || updates;

  if (!resolvedOrderCode) {
    return res.status(400).json({ success: false, message: 'Thiếu orderCode' });
  }
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return res.status(400).json({ success: false, message: 'Thiếu dữ liệu cần cập nhật' });
  }

  try {
    const result = await appsScriptService.call('editSummary', {}, 'POST', {
      action: 'editSummary',
      orderCode: resolvedOrderCode,
      data: changes,
    });
    return res.status(200).json(result);
  } catch (error) { return sendServiceError(res, error, 'Không thể cập nhật dữ liệu Summary'); }
}

async function editReturnItem(req, res) {
  try {
    const result = await appsScriptService.call('editReturnItem', {}, 'POST', {
      ...(req.body || {}),
      action: 'editReturnItem',
    });
    return res.status(200).json(result);
  } catch (error) { return sendServiceError(res, error, 'Không thể cập nhật bảng hàng rỗng'); }
}

async function uploadDocument(req, res) {
  const { orderCode, documentCode, fileName, fileData } = req.body || {};
  if (!orderCode || !documentCode || !fileName || !fileData) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu orderCode, documentCode, fileName hoặc fileData',
    });
  }

  try {
    const result = await appsScriptService.call('uploadDocument', {}, 'POST', {
      action: 'uploadDocument', orderCode, documentCode, fileName, fileData,
    });
    return res.status(200).json(result);
  } catch (error) { return sendServiceError(res, error, 'Không thể upload chứng từ'); }
}

async function sendMissingDocumentEmail(req, res) {
  const { to_email, to_name, order_code, missing_docs } = req.body || {};
  if (!to_email || !order_code || !missing_docs) {
    return res.status(400).json({ success: false, message: 'Thiếu to_email, order_code hoặc missing_docs' });
  }
  try {
    const data = await emailService.sendMissingDocumentEmail({ to_email, to_name, order_code, missing_docs });
    return res.status(200).json({ success: true, message: 'Đã gửi email thành công', data });
  } catch (error) { return sendServiceError(res, error, 'Không thể gửi email'); }
}

async function runCheckDocumentsJob(req, res) {
  try {
    const result = await appsScriptService.call('checkDocumentsAndSaveStatus', {}, 'POST');
    return res?.json(result) || result;
  } catch (error) { if (res) return sendServiceError(res, error); throw error; }
}

// Legacy actions kept for existing clients.
const updateAll = actionHandler('updateAll');
const getPIFiles = actionHandler('getPIFiles');
const getSheetSell = actionHandler('getSheetSell');
const checkDriveAndUpdate = actionHandler('checkDriveAndUpdate');

module.exports = {
  getSheetTotal, getSheetSummary, getSheetNoti, getFolderById, getArchivedDocuments,
  getSheetReturnItem, checkDocumentsAndSaveStatus, moveCompletedOrder,
  uploadDocument, editSummary,
  editReturnItem,
  sendMissingDocumentEmail, runCheckDocumentsJob,
  updateAll, getPIFiles, getSheetSell, checkDriveAndUpdate,
  runCheckDriveAndUpdateJob: runCheckDocumentsJob,
};
