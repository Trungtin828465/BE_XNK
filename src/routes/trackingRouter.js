const express = require('express');
const trackingController = require('../controllers/trackingController');

const router = express.Router();

router.get('/cma/:bl', trackingController.openCmaTracking);
router.get('/yangming/:trackingNumber', trackingController.getYangMingTracking);
router.get('/ckline/:bl', trackingController.getCKLineTracking);
router.get('/shipmentlink/:bl', trackingController.getShipmentLinkTracking);

module.exports = router;
