const clients = new Set();
let lastNotificationSignature = '';

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function getClientCount() {
  return clients.size;
}

function writeEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(eventName, data) {
  let successCount = 0;
  for (const client of clients) {
    try {
      writeEvent(client, eventName, data);
      successCount += 1;
    } catch {
      removeClient(client);
    }
  }

  return successCount;
}

function normalizeNotificationValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function parseCreatedAt(value) {
  if (!value) return 0;

  const text = String(value).trim();
  const [datePart, timePart = '00:00:00'] = text.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);

  if (!day || !month || !year) {
    const fallback = Date.parse(text);
    return Number.isNaN(fallback) ? 0 : fallback;
  }

  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

function normalizeNotifications(input) {
  const list = Array.isArray(input?.alerts)
    ? input.alerts
    : Array.isArray(input)
      ? input
      : [];

  return [...list]
    .map((item) => ({
      id: normalizeNotificationValue(item.id),
      order_code: normalizeNotificationValue(item.order_code),
      type: normalizeNotificationValue(item.type),
      missing_docs: normalizeNotificationValue(item.missing_docs),
      message: normalizeNotificationValue(item.message),
      updated_by: normalizeNotificationValue(item.updated_by),
      status: normalizeNotificationValue(item.status),
      created_at: normalizeNotificationValue(item.created_at),
    }))
    .sort((a, b) => {
      const byCreatedAt = parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at);
      if (byCreatedAt !== 0) return byCreatedAt;
      return `${a.id}|${a.order_code}`.localeCompare(`${b.id}|${b.order_code}`);
    });
}

function createNotificationSignature(input) {
  const list = normalizeNotifications(input);
  return JSON.stringify(
    list.map((item) => [
      item.id,
      item.order_code,
      item.type,
      item.missing_docs,
      item.message,
      item.updated_by,
      item.status,
      item.created_at,
    ]),
  );
}

function hasNotificationChanged(input) {
  const signature = createNotificationSignature(input);
  const changed = signature !== lastNotificationSignature;
  return {
    changed,
    signature,
    notifications: normalizeNotifications(input),
  };
}

function setLastNotificationSignature(signature) {
  lastNotificationSignature = signature;
}

function getLastNotificationSignature() {
  return lastNotificationSignature;
}

function primeNotificationSignature(input) {
  const signature = createNotificationSignature(input);
  lastNotificationSignature = signature;
  return signature;
}

module.exports = {
  addClient,
  removeClient,
  getClientCount,
  broadcast,
  createNotificationSignature,
  hasNotificationChanged,
  setLastNotificationSignature,
  getLastNotificationSignature,
  primeNotificationSignature,
  normalizeNotifications,
};
