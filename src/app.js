require('dotenv').config();

const express = require('express');
const cors = require('cors');
const appsScriptRoutes = require('./routes/appsScriptRoutes');
const trackingRouter = require('./routes/trackingRouter');
const authRouter = require('./routes/authRouter');

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: 'http://localhost:3000',
  }),
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));
app.use('/api', appsScriptRoutes);
// Giữ endpoint cũ /api/... và bổ sung nhóm endpoint rõ ràng /api/tracking/...
app.use('/api', trackingRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/auth', authRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
