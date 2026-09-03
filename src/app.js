require('dotenv').config();

const express = require('express');
const cors = require('cors');
const appsScriptRoutes = require('./routes/appsScriptRoutes');
const trackingRouter = require('./routes/trackingRouter');
const authRouter = require('./routes/authRouter');
const ocrRoutes = require('./routes/ocrRoutes');

const app = express();
const port = process.env.PORT || 5000;

// Cho phép Frontend ở localhost, Render hoặc domain khác gọi API.
// Không dùng credentials/cookie nên có thể mở CORS cho mọi origin.
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));
app.options(/.*/, cors());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));
app.use('/api', appsScriptRoutes);
// Giữ endpoint cũ /api/... và bổ sung nhóm endpoint rõ ràng /api/tracking/...
app.use('/api', trackingRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/auth', authRouter);
app.use('/api/ocr', ocrRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
