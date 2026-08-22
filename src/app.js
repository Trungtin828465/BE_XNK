require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const appsScriptRoutes = require('./routes/appsScriptRoutes');
const authRouter = require('./routes/authRouter');

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: 'http://localhost:3000',
  }),
);
app.use(express.json());
app.use('/api', appsScriptRoutes);
app.use('/api/auth', authRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  // Tự động kiểm tra log và cập nhật notification mỗi 3 phút.
  setInterval(async () => {
    try {
      console.log('Auto chạy hàm checkDriveAndUpdateJob');

      const response = await axios.get(
        `http://localhost:${port}/api/runCheckDriveAndUpdateJob`,
      );

      console.log('Gọi hàm auto thành công:', response.data);
    } catch (error) {
      console.error(
        'Auto báo lỗi checkDriveAndUpdateJob:',
        error.response?.data || error.message,
      );
    }
  }, 300 * 60 * 1000);
});
