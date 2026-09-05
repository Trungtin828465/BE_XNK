const express = require('express');
const activityLogController = require('../controllers/activityLogController');
const router = express.Router();

const {
  login
} = require('../controllers/authController');

router.post('/login', login);
router.post('/activity-logs', activityLogController.createLog);
router.get('/activity-logs', activityLogController.getLogs);

module.exports = router;
