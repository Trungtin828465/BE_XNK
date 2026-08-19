const axios = require("axios");
const emailjs = require("@emailjs/nodejs");
const {
  hasNotificationChanged,
  setLastNotificationSignature,
  primeNotificationSignature,
  normalizeNotifications,
} = require("../services/notificationSseService");

emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
});

function getAppsScriptUrl() {
  const url = process.env.APPSCRIPT_URL;

  if (!url) {
    throw new Error("Missing APPSCRIPT_URL in .env");
  }

  return url;
}
// Call AppSCript
async function callAppsScript(params = {}) {
  const url = new URL(getAppsScriptUrl());

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await axios.get(url.toString(), {
      responseType: "text",
    });

    if (typeof response.data === "string") {
      const text = response.data;

      if (text.includes("Sign in - Google Accounts")) {
        return {
          success: false,
          message: "Apps Script requires Google Workspace sign-in",
        };
      }

      try {
        return JSON.parse(text);
      } catch {
        return {
          success: false,
          message: text,
        };
      }
    }

    return response.data;
  } catch (error) {
    if (error.response) {
      const data = error.response.data;
      const text = typeof data === "string" ? data : JSON.stringify(data);

      if (text && text.includes("Sign in - Google Accounts")) {
        return {
          success: false,
          message: "Apps Script requires Google Workspace sign-in",
        };
      }

      return typeof data === "string"
        ? {
            success: false,
            message: data,
          }
        : data;
    }

    throw error;
  }
}
// update data gốc và data code
async function updateAll(req, res) {
  try {
    const data = await callAppsScript({
      action: "updateAll",
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Cannot connect to Apps Script",
      error: error.message,
    });
  }
}
// gọi sheet tổng hợp chị Thanh
async function getSheetSummary(req, res) {
  try {
    const data = await callAppsScript({
      action: "getSheetSummary",
      getSheetSummary: req.query.getSheetSummary,
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Cannot connect to Apps Script",
      error: error.message,
    });
  }
}
// gọi sheet tổng hợp Folder
async function getSheetTotal(req, res) {
  try {
    const data = await callAppsScript({
      action: "getSheetTotal",
      getSheetTotal: req.query.getSheetTotal,
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Cannot connect to Apps Script",
      error: error.message,
    });
  }
}
// truy ngược người dùng dựa vào PI rồi gửi email thông báo cho người dùng
async function getPIFiles(req, res) {
  try {
    const data = await callAppsScript({
      action: "getPIFiles",
      getPIFiles: req.query.getPIFiles,
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Cannot connect to Apps Script",
      error: error.message,
    });
  }
}
// gọi check drive và update gọi bằng post man
async function checkDriveAndUpdate(req, res) {
  try {
    const data = await callAppsScript({
      action: "checkDriveAndUpdate",
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Cannot connect to Apps Script",
      error: error.message,
    });
  }
}
// gọi real time 
async function runCheckDriveAndUpdateJob() {
  const result = await callAppsScript({
    action: "checkDriveAndUpdate",
  });

  if (!result || result.success === false || result.changed !== true) {
    return {
      ...result,
      notificationChanged: false,
    };
  }

  const notificationSource = await callAppsScript({
    action: "getSheetNoti",
  });

  const snapshot = hasNotificationChanged(notificationSource);

  if (!snapshot.changed && !snapshot.notifications.length) {
    return {
      ...result,
      notificationChanged: false,
      notifications: [],
    };
  }

  setLastNotificationSignature(snapshot.signature);

  return {
    ...result,
    notificationChanged: snapshot.changed,
    notifications: snapshot.notifications,
  };
}

async function seedNotificationSnapshot() {
  const notificationSource = await callAppsScript({
    action: "getSheetNoti",
  });

  return primeNotificationSignature(notificationSource);
}
// gọi sheet thông báo
async function sendNotification(req, res) {
  try {
    const source = await callAppsScript({
      action: "getSheetNoti",
    });

    const notifications = normalizeNotifications(source);

    if (notifications.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No notifications found",
        data: source,
      });
    }

    const parseCreatedAt = (value) => {
      if (!value) return 0;

      const text = String(value).trim();
      const [datePart, timePart = "00:00:00"] = text.split(" ");
      const [day, month, year] = datePart.split("/").map(Number);
      const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);

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
      message: "Notifications loaded successfully",
      total: sortedNotifications.length,
      latest_count: latestNotifications.length,
      latest_notifications: latestNotifications,
      all_notifications: sortedNotifications,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Cannot load notifications",
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
      },
    });
  }
}
// Gửi email bằng EmailJS khi có tài liệu bị thiếu
async function sendMissingDocumentEmail(req, res) {
  try {
    const { to_email, to_name, order_code, missing_docs } = req.body;

    if (!to_email || !order_code || !missing_docs) {
      return res.status(400).json({
        success: false,
        message: "Missing to_email, to_name, order_code, or missing_docs",
      });
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (!serviceId || !templateId || !publicKey || !privateKey) {
      return res.status(500).json({
        success: false,
        message: "Missing EmailJS environment variables",
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
      message: "Email sent successfully",
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
      message: "Cannot send email",
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
  seedNotificationSnapshot,
  sendNotification,
  sendMissingDocumentEmail,
};
