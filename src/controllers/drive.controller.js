function buildAppScriptUrl(baseUrl, query = {}) {
  const url = new URL(baseUrl);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function callAppScript(query = {}) {
  const appScriptUrl = process.env.APPSCRIPT_URL;

  if (!appScriptUrl) {
    return {
      status: 500,
      body: {
        success: false,
        message: 'Missing APPSCRIPT_URL environment variable'
      }
    };
  }

  const upstreamUrl = buildAppScriptUrl(appScriptUrl, query);
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

async function getDriveData(req, res) {
  try {
    const result = await callAppScript({
      action: req.query.action,
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
}

async function getSheet(req, res) {
  try {
    const result = await callAppScript({
      action: 'sheet'
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function getOrderFolder(req, res) {
  try {
    const result = await callAppScript({
      action: 'order-folder',
      orderCode: req.params.orderCode
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function getDocuments(req, res) {
  try {
    const result = await callAppScript({
      action: 'documents',
      orderCode: req.params.orderCode
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function getFileType(req, res) {
  try {
    const result = await callAppScript({
      action: 'document-type',
      fileId: req.params.fileId
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  getDriveData,
  getSheet,
  getOrderFolder,
  getDocuments,
  getFileType
};
