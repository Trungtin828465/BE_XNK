const express = require('express');
const activityLogController = require('../controllers/activityLogController');
const router = express.Router();

const {
  login,
  updatePassword,
} = require('../controllers/authController');

router.post('/login', login);
router.post('/update-password', updatePassword);
router.post('/activity-logs', activityLogController.createLog);
router.get('/activity-logs', activityLogController.getLogs);

module.exports = router;
