const { analyzeDocument } = require('../services/pythonOcrService');

async function analyze(req, res) {
  try {
    const input = req.file
      ? { ...(req.body || {}), fileName: req.file.originalname, fileData: req.file.buffer.toString('base64') }
      : req.body || {};
    return res.status(200).json(await analyzeDocument(input));
  } catch (error) {
    const status = /missing|thiếu|phải là|chỉ hỗ trợ|không phải|vượt quá/i.test(error.message) ? 400 : 502;
    return res.status(status).json({ success: false, message: error.message });
  }
}

module.exports = { analyze };
