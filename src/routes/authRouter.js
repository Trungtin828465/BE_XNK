const express = require('express');
const activityLogController = require('../controllers/activityLogController');
const router = express.Router();

const {
  login,
  register,
  getUsers,
  getUserById,
  updateUser,
  updatePassword,
} = require('../controllers/authController');

router.post('/login', login);
router.post('/register', register);
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id', updateUser);
router.post('/update-password', updatePassword);
router.post('/activity-logs', activityLogController.createLog);
router.get('/activity-logs', activityLogController.getLogs);

module.exports = router;
