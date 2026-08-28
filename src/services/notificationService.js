const appsScriptService = require('./appsScriptService');

const clients = new Set();
let snapshot;

function rowsOf(source) {
  if (Array.isArray(source?.data)) return source.data;
  if (Array.isArray(source?.data?.data)) return source.data.data;
  if (Array.isArray(source?.alerts)) return source.alerts;
  return Array.isArray(source) ? source : [];
}

function timestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const [date, time = '00:00:00'] = String(value).split(' ');
  const [day, month, year] = date.split('/').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  return day && month && year ? new Date(year, month - 1, day, hour || 0, minute || 0, second || 0).getTime() : 0;
}

function buildPayload(source) {
  const notifications = rowsOf(source).slice().sort((a, b) =>
    timestamp(b.date || b.created_at) - timestamp(a.date || a.created_at));
  return {
    success: true,
    total: notifications.length,
    latest_count: Math.min(notifications.length, 5),
    latest_notifications: notifications.slice(0, 5),
    all_notifications: notifications,
  };
}

async function getPayload() {
  const source = await appsScriptService.getSheetNoti();
  if (source?.success === false) {
    const error = new Error(source.message || 'Không thể lấy thông báo từ Apps Script');
    error.appsScriptResponse = source;
    throw error;
  }
  return buildPayload(source);
}

function broadcast(payload) {
  const event = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try { client.write(event); } catch { clients.delete(client); }
  }
}

async function refresh({ force = false, changed = false, affectedOrders = [] } = {}) {
  const payload = await getPayload();
  const next = JSON.stringify(payload.all_notifications);
  const hasChanged = snapshot !== undefined && snapshot !== next;
  snapshot = next;
  if (force || hasChanged) broadcast({ ...payload, changed, affectedOrders });
  return payload;
}

function stream(req, res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  clients.add(res);
  res.write(': connected\n\n');
  getPayload().then((payload) => {
    if (!res.writableEnded) res.write(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`);
  }).catch((error) => {
    if (!res.writableEnded) res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
  });
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': heartbeat\n\n'); }, 25000);
  req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
}

module.exports = { getPayload, refresh, stream, rowsOf };
