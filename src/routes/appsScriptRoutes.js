const express = require('express');
const appsScriptController = require('../controllers/appsScriptController');

const router = express.Router();

router.get('/getSheetTotal', appsScriptController.getSheetTotal);
router.get('/getSheetSummary', appsScriptController.getSheetSummary);
router.get('/updateAll', appsScriptController.updateAll);
router.get('/getPIFiles', appsScriptController.getPIFiles);
router.get('/checkDriveAndUpdate', appsScriptController.checkDriveAndUpdate);
router.get('/runCheckDriveAndUpdateJob', appsScriptController.runCheckDriveAndUpdateJob);
router.post('/sendMissingDocumentEmail', appsScriptController.sendMissingDocumentEmail);
router.get('/sendNotification', appsScriptController.sendNotification);

module.exports = router;
