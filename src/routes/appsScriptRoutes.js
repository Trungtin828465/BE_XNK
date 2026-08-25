const express = require('express');
const appsScriptController = require('../controllers/appsScriptController');
const router = express.Router();

router.get('/getSheetTotal', appsScriptController.getSheetTotal);
router.get('/getSheetSummary', appsScriptController.getSheetSummary);
router.get('/updateAll', appsScriptController.updateAll);
router.get('/getPIFiles', appsScriptController.getPIFiles);
router.get('/getSheetSell', appsScriptController.getSheetSell);
router.get('/checkDriveAndUpdate', appsScriptController.checkDriveAndUpdate);
router.get('/runCheckDriveAndUpdateJob', appsScriptController.runCheckDriveAndUpdateJob);
router.post('/sendMissingDocumentEmail', appsScriptController.sendMissingDocumentEmail);
router.get('/sendNotification', appsScriptController.sendNotification);
// Kênh realtime cho UI: nhận event notification mỗi khi sheet thay đổi.
router.get('/notifications/stream', appsScriptController.streamNotifications);
router.put('/updateStatusNotification', appsScriptController.updateStatusNotification);
module.exports = router;
