const {
  createEvergreenTrackingRequest,
} = require('../services/evergreenTrackingService');

async function launchEvergreenTracking(req, res) {
  try {
    return res.status(200).json(
      createEvergreenTrackingRequest(req.body?.containerNo),
    );
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error('Evergreen tracking request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể tạo yêu cầu tracking Evergreen',
    });
  }
}

module.exports = { launchEvergreenTracking };
