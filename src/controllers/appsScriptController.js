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

      if (
        text.includes('Sign in - Google Accounts') ||
        text.includes('accounts.google.com')
      ) {
        return {
          success: false,
          message:
            'Apps Script requires Google Workspace sign-in. Deploy as "Anyone can access".',
        };
      }

      // Check if response is HTML (not JSON)
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        return {
          success: false,
          message: 'Apps Script returned HTML instead of JSON. Check deployment settings.',
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
          text.includes('accounts.google.com'))
      ) {
        return {
          success: false,
          message:
            'Apps Script requires Google Workspace sign-in. Deploy as "Anyone can access".',
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

async function runCheckDriveAndUpdateJob() {
  // return callAppsScript({
  //   action: 'checkDriveAndUpdate',
  // });
}

async function sendNotification(req, res) {
  try {
    const source = await callAppsScript({
      action: 'getSheetNoti',
    });
    const notifications = Array.isArray(source?.alerts)
      ? source.alerts
      : Array.isArray(source)
        ? source
        : [];

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

module.exports = {
  updateAll,
  getSheetSummary,
  getSheetTotal,
  getPIFiles,
  checkDriveAndUpdate,
  runCheckDriveAndUpdateJob,
  sendNotification,
  sendMissingDocumentEmail,
};
