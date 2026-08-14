const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const APPSCRIPT_URL = process.env.APPSCRIPT_URL;

app.use(express.json());

function buildAppScriptUrl(baseUrl, query = {}) {
  const url = new URL(baseUrl);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function fetchAppScript(query = {}) {
  if (!APPSCRIPT_URL) {
    return {
      status: 500,
      body: {
        success: false,
        message: 'Missing APPSCRIPT_URL environment variable'
      }
    };
  }

  const upstreamUrl = buildAppScriptUrl(APPSCRIPT_URL, query);
  const response = await fetch(upstreamUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : { success: false, message: await response.text() };

  return {
    status: response.status,
    body
  };
}

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Web server Node.js is running.',
    routes: [
      'GET /api/drive-data',
      'GET /api/sheet',
      'GET /api/order-folder/:orderCode',
      'GET /api/documents/:orderCode',
      'GET /api/file/:fileId',
      'GET /health'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ok'
  });
});

app.get('/api/drive-data', async (req, res) => {
  try {
    const action = req.query.action || 'sheet';
    const result = await fetchAppScript({
      action,
      folderId: req.query.folderId,
      orderCode: req.query.orderCode,
      fileId: req.query.fileId
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/sheet', async (req, res) => {
  const result = await fetchAppScript({ action: 'sheet' });
  return res.status(result.status).json(result.body);
});

app.get('/api/order-folder/:orderCode', async (req, res) => {
  const result = await fetchAppScript({
    action: 'order-folder',
    orderCode: req.params.orderCode
  });
  return res.status(result.status).json(result.body);
});

app.get('/api/documents/:orderCode', async (req, res) => {
  const result = await fetchAppScript({
    action: 'documents',
    orderCode: req.params.orderCode
  });
  return res.status(result.status).json(result.body);
});

app.get('/api/file/:fileId', async (req, res) => {
  const result = await fetchAppScript({
    action: 'document-type',
    fileId: req.params.fileId
  });
  return res.status(result.status).json(result.body);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
