const express = require('express');
const multer = require('multer');
const ocrController = require('../controllers/ocrController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const validMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/tiff'];
    const valid = validMimeTypes.includes(file.mimetype) || /\.(pdf|png|jpe?g|webp|tiff?)$/i.test(file.originalname);
    callback(valid ? null : new Error('OCR chỉ hỗ trợ PDF, PNG, JPG, JPEG, WEBP, TIF hoặc TIFF.'), valid);
  },
});

function uploadPdf(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message });
    return next();
  });
}

router.post('/analyze', uploadPdf, ocrController.analyze);
module.exports = router;
