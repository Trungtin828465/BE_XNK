const express = require('express');
const driveController = require('../controllers/drive.controller');

const router = express.Router();

router.get('/drive-data', driveController.getDriveData);
router.get('/sheet', driveController.getSheet);
router.get('/order-folder/:orderCode', driveController.getOrderFolder);
router.get('/documents/:orderCode', driveController.getDocuments);
router.get('/file/:fileId', driveController.getFileType);

module.exports = router;
