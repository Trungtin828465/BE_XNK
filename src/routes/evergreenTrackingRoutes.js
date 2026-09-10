const express = require('express');
const evergreenTrackingController = require('../controllers/evergreenTrackingController');

const router = express.Router();

router.post('/launch', evergreenTrackingController.launchEvergreenTracking);

module.exports = router;
