const { openCKLineTracking } = require('../services/cklineTrackingService');

async function trackCKLine(req, res) {
  const code = req.body?.code || req.body?.blNo || req.body?.bl_no;

  try {
    const result = await openCKLineTracking(code);
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error('CK Line tracking error:', error.message);
    return res.status(502).json({
      success: false,
      carrier: 'CK LINE',
      message: `Không thể mở CK Line tracking: ${error.message}`,
    });
  }
}

module.exports = { trackCKLine };
