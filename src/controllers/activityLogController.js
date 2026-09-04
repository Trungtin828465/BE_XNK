const { createActivityLog } = require('../services/activityLogService');

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

module.exports = { createLog };
