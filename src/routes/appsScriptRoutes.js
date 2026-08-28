const express = require('express');
const appsScriptController = require('../controllers/appsScriptController');
const router = express.Router();

router.get('/getSheetTotal', appsScriptController.getSheetTotal);
router.get('/getSheetSummary', appsScriptController.getSheetSummary);
router.get('/getSheetNoti', appsScriptController.getSheetNoti);
router.get('/getFolderById', appsScriptController.getFolderById);
router.get('/getArchivedDocuments', appsScriptController.getArchivedDocuments);
router.get('/checkDocumentsAndSaveStatus', appsScriptController.checkDocumentsAndSaveStatus);
router.post('/checkDocumentsAndSaveStatus', appsScriptController.checkDocumentsAndSaveStatus);
router.get('/updateNotifications', appsScriptController.updateNotifications);
router.post('/updateNotifications', appsScriptController.updateNotifications);
router.get('/moveCompletedOrder', appsScriptController.moveCompletedOrder);
router.post('/moveCompletedOrder', appsScriptController.moveCompletedOrder);
router.post('/uploadDocument', appsScriptController.uploadDocument);
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
