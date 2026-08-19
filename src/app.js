require('dotenv').config();

const express = require('express');
const cors = require('cors');
// add router
const appsScriptRoutes = require('./routes/appsScriptRoutes');
const authRouter = require('./routes/authRouter');
const {
  runCheckDriveAndUpdateJob
} = require('./controllers/appsScriptController');
const {
  seedNotificationSnapshot
} = require('./controllers/appsScriptController');
const {
  addClient,
  removeClient,
  getClientCount,
  broadcast
} = require('./services/notificationSseService');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: 'http://localhost:3000'
}));
app.use(express.json());
// tạo endpoint
app.use('/api', appsScriptRoutes);
app.use('/api/auth', authRouter);

app.get('/notifications/stream', (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.flushHeaders?.();
  res.write('retry: 5000\n\n');

  addClient(res);
  console.log('[SSE] client connected:', getClientCount());

  req.on('close', () => {
    removeClient(res);
    console.log('[SSE] client disconnected:', getClientCount());
  });
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

async function runScheduledCheckDriveAndUpdate() {
  try {
    const data = await runCheckDriveAndUpdateJob();
    console.log('[checkDriveAndUpdate job] response:', JSON.stringify(data));

    if (data?.success && data?.changed) {
      const notificationChanged = data?.notificationChanged === true;
      const affectedOrders = Array.isArray(data?.affectedOrders)
        ? data.affectedOrders
        : [];

      console.log('[checkDriveAndUpdate job] notificationChanged:', notificationChanged);

      if (notificationChanged) {
        const payload = {
          type: 'notification_changed',
          timestamp: new Date().toISOString(),
          affectedOrders,
        };

        const sent = broadcast('notification_changed', payload);
        console.log('[SSE] broadcast success, clients:', sent);
      }
    }
  } catch (error) {
    console.error('[checkDriveAndUpdate job] error:', error.message);
  }
}

async function bootstrapJobs() {
  try {
    await seedNotificationSnapshot();
    console.log('[notification snapshot] initialized');
  } catch (error) {
    console.error('[notification snapshot] error:', error.message);
  }

  await runScheduledCheckDriveAndUpdate();
  setInterval(runScheduledCheckDriveAndUpdate, 2 * 60 * 1000);
}

bootstrapJobs();
