const axios = require('axios');

function getAppsScriptUrl() {
  const url = process.env.APPSCRIPT_URL;

  if (!url) {
    throw new Error('Missing APPSCRIPT_URL in .env');
  }

  return url;
}

async function callAppsScript(params = {}) {
  const url = new URL(getAppsScriptUrl());

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await axios.get(url.toString(), {
      responseType: 'text'
    });

    if (typeof response.data === 'string') {
      const text = response.data;

      if (text.includes('Sign in - Google Accounts')) {
        return {
          success: false,
          message: 'Apps Script requires Google Workspace sign-in'
        };
      }

      try {
        return JSON.parse(text);
      } catch {
        return {
          success: false,
          message: text
        };
      }
    }

    return response.data;
  } catch (error) {
    if (error.response) {
      const data = error.response.data;
      const text = typeof data === 'string' ? data : JSON.stringify(data);

      if (text && text.includes('Sign in - Google Accounts')) {
        return {
          success: false,
          message: 'Apps Script requires Google Workspace sign-in'
        };
      }

      return typeof data === 'string'
        ? {
            success: false,
            message: data
          }
        : data;
    }

    throw error;
  }
}

async function updateAll(req, res) {
  try {
    const data = await callAppsScript({
      action: 'updateAll'
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message
    });
  }
}

async function getSheetSummary(req, res) {
  try {
    const data = await callAppsScript({
      action: 'getSheetSummary',
      getSheetSummary: req.query.getSheetSummary
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message
    });
  }
}

async function getSheetTotal(req, res) {
  try {
    const data = await callAppsScript({
      action: 'getSheetTotal',
      getSheetTotal: req.query.getSheetTotal
    });

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Cannot connect to Apps Script',
      error: error.message
    });
  }
}

module.exports = {
  updateAll,
  getSheetSummary,
  getSheetTotal
};
