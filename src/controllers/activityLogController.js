const {
  createActivityLog,
  getActivityLogs,
} = require('../services/activityLogService');

async function createLog(req, res) {
  const body = req.body || {};
  const userId = body.userId || body.user_id;
  const action = String(body.action || '').trim();
  const location = String(body.location || '').trim();
  const detail = String(body.detail || '').trim();

  if (!userId || !action) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu userId/user_id hoặc action',
    });
  }

  if (!/^\d+$/.test(String(userId))) {
    return res.status(400).json({ success: false, message: 'userId không hợp lệ' });
  }

  try {
    const data = await createActivityLog({
      userId: Number(userId),
      action: action.slice(0, 255),
      location: location.slice(0, 255),
      detail,
    });
    return res.status(201).json({ success: true, message: 'Đã ghi log người dùng', data });
  } catch (error) {
    console.error('Create activity log error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể ghi log người dùng',
      error: error.message || error.code || 'Database error',
    });
  }
}

async function getLogs(req, res) {
  const queryUserId = req.query.userId || req.query.user_id;
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);

  if (queryUserId !== undefined && !/^\d+$/.test(String(queryUserId))) {
    return res.status(400).json({
      success: false,
      message: 'userId không hợp lệ',
    });
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return res.status(400).json({
      success: false,
      message: 'limit phải là số nguyên từ 1 đến 500',
    });
  }

  if (!Number.isInteger(offset) || offset < 0) {
    return res.status(400).json({
      success: false,
      message: 'offset phải là số nguyên lớn hơn hoặc bằng 0',
    });
  }

  try {
    const data = await getActivityLogs({
      userId: queryUserId === undefined ? undefined : Number(queryUserId),
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        limit,
        offset,
        count: data.length,
      },
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lấy log người dùng',
      error: error.message || error.code || 'Database error',
    });
  }
}

module.exports = { createLog, getLogs };
