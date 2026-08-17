const express = require('express');
const appsScriptController = require('../controllers/appsScript.controller');

const router = express.Router();

router.get('/getSheetTotal', appsScriptController.getSheetTotal);
router.get('/getSheetSummary', appsScriptController.getSheetSummary);
router.get('/updateAll', appsScriptController.updateAll);
router.get('/getPIFiles', appsScriptController.getPIFiles);
router.post('/sendMissingDocumentEmail', appsScriptController.sendMissingDocumentEmail);
module.exports = router;
