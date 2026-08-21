const axios = require('axios');
const emailjs = require('@emailjs/nodejs');

emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
});

const appsScriptClient = axios.create({
  timeout: 30000,
  maxRedirects: 10,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  },
});

function getAppsScriptUrl() {
  const url = process.env.APPSCRIPT_URL;

  if (!url) {
    throw new Error('Missing APPSCRIPT_URL in .env');
  }

  return url.trim();
}

async function callAppsScript(params = {}) {
  const baseUrl = getAppsScriptUrl();
  const url = new URL(baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const targetUrl = url.toString();

  try {
    const response = await appsScriptClient.get(targetUrl, {
      responseType: 'text',
      maxRedirects: 10,
      validateStatus: (status) => status < 400,
    });

    if (typeof response.data === 'string') {
      const text = response.data.trim();
      const lowerText = text.toLowerCase();

      if (
        text.includes('Sign in - Google Accounts') ||
        text.includes('accounts.google.com') ||
        lowerText.includes('google accounts')
      ) {
        return {
          success: false,
          message:
            'Apps Script requires Google Workspace sign-in. Deploy as "Anyone can access".',
        };
      }

      // Check if response is HTML (not JSON)
      if (
        lowerText.startsWith('<!doctype') ||
        lowerText.startsWith('<html') ||
        lowerText.includes('<html')
      ) {
        return {
          success: false,
          message:
            'Apps Script trả về HTML thay vì JSON. Kiểm tra URL /exec và quyền deploy Anyone.',
          raw: text.substring(0, 500),
        };
      }

      try {
        return JSON.parse(text);
      } catch {
        return {
          success: false,
          message: text.substring(0, 1000),
        };
      }
    }

    return response.data;
  } catch (error) {
    if (error.response) {
      const data = error.response.data;
      const text = typeof data === 'string' ? data : JSON.stringify(data);

      if (
        text &&
        (text.includes('Sign in - Google Accounts') ||
          text.includes('accounts.google.com') ||
          text.toLowerCase().includes('<html'))
      ) {
        return {
          success: false,
          message: text.toLowerCase().includes('<html')
            ? 'Apps Script trả về HTML thay vì JSON. Kiểm tra URL /exec và quyền deploy Anyone.'
            : 'Apps Script requires Google Workspace sign-in. Deploy as "Anyone can access".',
          raw: text.substring(0, 500),
        };
      }

      return typeof data === 'string'
        ? { success: false, message: data.substring(0, 1000) }
        : data;
    }

    throw error;
  }
}

async function updateAll(req, res) {
  try {
    const data = await callAppsScript({
      action: 'updateAll',
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message,
    });
  }
}

async function getSheetSummary(req, res) {
  try {
    const data = await callAppsScript({
      action: 'getSheetSummary',
      getSheetSummary: req.query.getSheetSummary,
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message,
    });
  }
}

async function getSheetTotal(req, res) {
  try {
    const data = await callAppsScript({
      action: 'getSheetTotal',
      getSheetTotal: req.query.getSheetTotal,
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message,
    });
  }
}

async function getPIFiles(req, res) {
  try {
    const data = await callAppsScript({
      action: 'getPIFiles',
      getPIFiles: req.query.getPIFiles,
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message,
    });
  }
}

async function checkDriveAndUpdate(req, res) {
  try {
    const data = await callAppsScript({
      action: 'checkDriveAndUpdate',
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message,
    });
  }
}

async function runCheckDriveAndUpdateJob(req, res) {
  const result = await callAppsScript({
    action: 'checkDriveAndUpdate',
  });

  // Sau mỗi lần check log thành công, cập nhật notification và đẩy SSE.
  if (result?.success !== false) {
    try {
      await updateNotificationsAfterCheck({
        // Apps Script đã xác nhận có file/order thay đổi thì phải đẩy event.
        forceBroadcast: result?.changed === true,
        changed: result?.changed === true,
        affectedOrders: result?.affectedOrders || [],
      });
    } catch (error) {
      console.error('Không thể cập nhật realtime notification:', error.message);
    }
  }

  // Giữ tương thích với route cũ: khi được gọi qua HTTP phải trả response.
  if (res) return res.status(200).json(result);
  return result;
}

// ==================== REALTIME NOTIFICATION (SSE) ====================
// Code cũ của runCheckDriveAndUpdateJob vẫn được giữ nguyên ở phía trên.
// Phần mới bên dưới bổ sung cơ chế phát thông báo khi sheet thay đổi.
const notificationClients = new Set();
let notificationPollRunning = false;
let notificationSnapshot = null;

function getNotificationRows(source) {
  if (Array.isArray(source?.alerts)) return source.alerts;
  if (Array.isArray(source?.data)) return source.data;
  if (Array.isArray(source?.data?.data)) return source.data.data;
  if (Array.isArray(source)) return source;
  return [];
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

function buildNotificationPayload(source) {
  const sortedNotifications = [...getNotificationRows(source)].sort(
    (a, b) => parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at),
  );

  return {
    success: true,
    total: sortedNotifications.length,
    latest_count: Math.min(sortedNotifications.length, 5),
    latest_notifications: sortedNotifications.slice(0, 5),
    all_notifications: sortedNotifications,
  };
}

async function fetchNotificationPayload() {
  const source = await callAppsScript({ action: 'getSheetNoti' });

  // Không được coi lỗi Apps Script là danh sách thông báo rỗng.
  if (source?.success === false) {
    const error = new Error(source.message || 'Apps Script không trả được notification');
    error.appsScriptResponse = source;
    throw error;
  }

  return buildNotificationPayload(source);
}

function notificationFingerprint(payload) {
  return JSON.stringify(payload.all_notifications);
}

function broadcastNotification(payload) {
  const event = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of notificationClients) {
    try {
      client.write(event);
    } catch {
      notificationClients.delete(client);
    }
  }
}

// Một chu kỳ duy nhất: check Drive -> Apps Script cập nhật Sheet -> đọc noti -> SSE.
async function updateNotificationsAfterCheck({
  forceBroadcast = false,
  changed = false,
  affectedOrders = [],
} = {}) {
  if (notificationPollRunning) return;
  notificationPollRunning = true;

  try {
    const payload = await fetchNotificationPayload();
    const fingerprint = notificationFingerprint(payload);
    const snapshotChanged =
      notificationSnapshot !== null && fingerprint !== notificationSnapshot;

    // Luôn cập nhật snapshot trước khi phát event, kể cả lần chạy đầu tiên.
    notificationSnapshot = fingerprint;

    // changed=true là tín hiệu Apps Script xác nhận dữ liệu vừa cập nhật.
    // Không để snapshot null chặn event realtime đầu tiên.
    if (forceBroadcast || snapshotChanged) {
      broadcastNotification({
        ...payload,
        changed,
        affectedOrders,
      });
      console.log(
        `SSE notification broadcasted to ${notificationClients.size} client(s)`,
      );
    }
  } catch (error) {
    console.error('Notification polling thất bại:', error.message);
  } finally {
    notificationPollRunning = false;
  }
}

// Hàm này vẫn được export để có thể gọi trực tiếp khi cần.
async function runNotificationCycle() {
  const result = await callAppsScript({ action: 'checkDriveAndUpdate' });
  if (result?.success !== false) {
    await updateNotificationsAfterCheck({
      forceBroadcast: result?.changed === true,
      changed: result?.changed === true,
      affectedOrders: result?.affectedOrders || [],
    });
  }
  return result;
}

function streamNotifications(req, res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  notificationClients.add(res);
  res.write(': connected\n\n');

  // Gửi dữ liệu hiện tại ngay khi UI kết nối, không phải chờ lần thay đổi kế tiếp.
  fetchNotificationPayload()
    .then((payload) => {
      if (!res.writableEnded) {
        res.write(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    })
    .catch((error) => {
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      }
    });

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    notificationClients.delete(res);
  });
}

async function sendNotification(req, res) {
  try {
    const source = await callAppsScript({
      action: 'getSheetNoti',
    });

    // Code cũ vẫn giữ nguyên; bổ sung kiểm tra để không biến lỗi HTML từ
    // Apps Script thành response giả "Không có thông báo nào".
    if (source?.success === false) {
      return res.status(502).json({
        success: false,
        message: source.message || 'Apps Script không trả được notification',
        apps_script: source,
      });
    }

    // Apps Script hiện trả về { data: { data: [...] } }.
    // Vẫn hỗ trợ format cũ { alerts: [...] } và [...] để không phá API cũ.
    const notifications = getNotificationRows(source);

    if (notifications.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Không có thông báo nào',
        data: source,
      });
    }
    const parseCreatedAt = (value) => {
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
    };

    const sortedNotifications = [...notifications].sort(
      (a, b) => parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at),
    );
    const latestNotifications = sortedNotifications.slice(0, 5);

    return res.status(200).json({
      success: true,
      message: 'Đã tải thông báo thành công',
      total: sortedNotifications.length,
      latest_count: latestNotifications.length,
      latest_notifications: latestNotifications,
      all_notifications: sortedNotifications,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải thông báo',
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
      },
    });
  }
}

async function sendMissingDocumentEmail(req, res) {
  try {
    const { to_email, to_name, order_code, missing_docs } = req.body;

    if (!to_email || !order_code || !missing_docs) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu to_email, to_name, order_code hoặc missing_docs',
      });
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (!serviceId || !templateId || !publicKey || !privateKey) {
      return res.status(500).json({
        success: false,
        message: 'Thiếu biến môi trường EmailJS',
      });
    }

    const result = await emailjs.send(
      serviceId,
      templateId,
      {
        to_email,
        to_name,
        order_code,
        missing_docs,
      },
      {
        publicKey,
        privateKey,
      },
    );

    return res.status(200).json({
      success: true,
      message: 'Đã gửi email thành công',
      data: result,
    });
  } catch (error) {
    const detail = {
      name: error.name,
      status: error.status,
      text: error.text,
      message: error.message,
    };

    return res.status(500).json({
      success: false,
      message: 'Không thể gửi email',
      error: detail,
    });
  }
}

// update status noti
async function updateStatusNotification(req, res) {

  try {

    const data = await callAppsScript({
      action: "updateStatusNotification"
    });

    return res.status(200).json(data);

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: "Cannot connect to Apps Script",
      error: error.message
    });

  }

}

module.exports = {
  updateAll,
  getSheetSummary,
  getSheetTotal,
  getPIFiles,
  checkDriveAndUpdate,
  runCheckDriveAndUpdateJob,
  sendNotification,
  streamNotifications,
  runNotificationCycle,
  sendMissingDocumentEmail,
  updateStatusNotification,
};
