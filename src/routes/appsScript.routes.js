const express = require('express');
const appsScriptController = require('../controllers/appsScript.controller');

const router = express.Router();

router.get('/updateAll', appsScriptController.updateAll);
router.get('/getSheetSummary', appsScriptController.getSheetSummary);
router.get('/getSheetTotal', appsScriptController.getSheetTotal);

module.exports = router;
