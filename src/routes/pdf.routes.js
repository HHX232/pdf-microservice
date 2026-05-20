const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfController = require('../controllers/pdf.controller');

// Configure multer for file uploads (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// ==================== TEXT EXTRACTION ROUTES ====================

/**
 * POST /api/pdf/extract-from-url
 * Extract text from PDF by URL
 * Body: { url: string }
 */
router.post('/extract-from-url', pdfController.extractFromUrl);
router.post('/tables-to-excel', pdfController.tablesToExcel);

/**
 * POST /api/pdf/extract-from-upload
 * Extract text from uploaded PDF file
 * FormData: file (PDF file)
 */
router.post('/extract-from-upload', upload.single('file'), pdfController.extractFromUpload);

/**
 * POST /api/pdf/extract-from-base64
 * Extract text from base64 encoded PDF
 * Body: { base64: string }
 */
router.post('/extract-from-base64', pdfController.extractFromBase64);

// ==================== TABLE EXTRACTION ROUTES ====================

/**
 * POST /api/pdf/extract-tables-from-url
 * Extract tables from PDF by URL
 * Body: { url: string }
 */
router.post('/extract-tables-from-url', pdfController.extractTablesFromUrl);

/**
 * POST /api/pdf/extract-tables-from-upload
 * Extract tables from uploaded PDF file
 * FormData: file (PDF file)
 */
router.post('/extract-tables-from-upload', upload.single('file'), pdfController.extractTablesFromUpload);

/**
 * POST /api/pdf/extract-tables-from-base64
 * Extract tables from base64 encoded PDF
 * Body: { base64: string }
 */
router.post('/extract-tables-from-base64', pdfController.extractTablesFromBase64);

// ==================== IMAGE EXTRACTION ROUTES ====================

/**
 * POST /api/pdf/extract-images-from-url
 * Extract images from PDF by URL
 * Body: { url: string }
 */
router.post('/extract-images-from-url', pdfController.extractImagesFromUrl);

/**
 * POST /api/pdf/extract-images-from-upload
 * Extract images from uploaded PDF file
 * FormData: file (PDF file)
 */
router.post('/extract-images-from-upload', upload.single('file'), pdfController.extractImagesFromUpload);

/**
 * POST /api/pdf/extract-images-from-base64
 * Extract images from base64 encoded PDF
 * Body: { base64: string }
 */
router.post('/extract-images-from-base64', pdfController.extractImagesFromBase64);

// ==================== SCREENSHOT GENERATION ROUTES ====================

/**
 * POST /api/pdf/generate-screenshots-from-url
 * Generate screenshots from PDF by URL
 * Body: { url: string, scale?: number, pages?: number[] }
 */
router.post('/generate-screenshots-from-url', pdfController.generateScreenshotsFromUrl);

/**
 * POST /api/pdf/generate-screenshots-from-upload
 * Generate screenshots from uploaded PDF file
 * FormData: file (PDF file), scale (optional), pages (optional JSON array)
 */
router.post('/generate-screenshots-from-upload', upload.single('file'), pdfController.generateScreenshotsFromUpload);

/**
 * POST /api/pdf/generate-screenshots-from-base64
 * Generate screenshots from base64 encoded PDF
 * Body: { base64: string, scale?: number, pages?: number[] }
 */
router.post('/generate-screenshots-from-base64', pdfController.generateScreenshotsFromBase64);

// ==================== UTILITY ROUTES ====================

/**
 * POST /api/pdf/download
 * Download PDF from URL and return as base64
 * Body: { url: string }
 */
router.post('/download', pdfController.downloadPdf);

module.exports = router;