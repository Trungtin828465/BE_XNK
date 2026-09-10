const express = require('express');
const evergreenTrackingController = require('../controllers/evergreenTrackingController');
const cklineTrackingController = require('../controllers/cklineTrackingController');

const router = express.Router();

router.post('/evergreen/launch', evergreenTrackingController.launchEvergreenTracking);
router.post('/ckline', cklineTrackingController.trackCKLine);

module.exports = router;
