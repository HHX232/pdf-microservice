const pdfService = require('../services/pdf.service');

class PdfController {
  /**
   * Extract text from PDF by URL
   */
  async extractFromUrl(req, res, next) {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'URL is required'
        });
      }

      try {
        new URL(url);
      } catch (error) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid URL format'
        });
      }

      const result = await pdfService.extractTextFromUrl(url);

      res.json({
        success: true,
        data: {
          text: result.text,
          pageCount: result.pageCount,
          characterCount: result.text.length,
          source: 'url',
          url: url
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extract text from uploaded PDF file
   */
  async extractFromUpload(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'PDF file is required'
        });
      }

      console.log(`📄 Extracting text: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
      const result = await pdfService.extractTextFromBuffer(req.file.buffer);
      console.log(`✅ Extracted ${result.pageCount} pages, ${result.text.length} chars`);

      res.json({
        success: true,
        data: {
          text: result.text,
          pageCount: result.pageCount,
          characterCount: result.text.length,
          source: 'upload',
          fileName: req.file.originalname,
          fileSize: req.file.size
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extract text from base64 encoded PDF
   */
  async extractFromBase64(req, res, next) {
    try {
      const { base64 } = req.body;

      if (!base64) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Base64 data is required'
        });
      }

      let base64Data = base64;
      if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid base64 format'
          });
        }
        base64Data = matches[2];
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const result = await pdfService.extractTextFromBuffer(buffer);

      res.json({
        success: true,
        data: {
          text: result.text,
          pageCount: result.pageCount,
          characterCount: result.text.length,
          source: 'base64'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download PDF from URL and return as base64
   */
  async downloadPdf(req, res, next) {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'URL is required'
        });
      }

      const buffer = await pdfService.downloadPdf(url);

      res.json({
        success: true,
        data: {
          base64: buffer.toString('base64'),
          size: buffer.length,
          url: url
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extract tables from base64 encoded PDF
   */
  async extractTablesFromBase64(req, res, next) {
    try {
      const { base64 } = req.body;

      if (!base64) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Base64 data is required'
        });
      }

      let base64Data = base64;
      if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid base64 format'
          });
        }
        base64Data = matches[2];
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const result = await pdfService.extractTablesFromBuffer(buffer);

      res.json({
        success: true,
        data: {
          tables: result.tables,
          count: result.count,
          summary: result.summary
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extract tables from uploaded PDF file
   */
  async extractTablesFromUpload(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'PDF file is required'
        });
      }

      console.log(`📊 Extracting tables: ${req.file.originalname}`);
      const result = await pdfService.extractTablesFromBuffer(req.file.buffer);
      console.log(`✅ Found ${result.count} tables`);

      res.json({
        success: true,
        data: {
          tables: result.tables,
          count: result.count,
          summary: result.summary,
          fileName: req.file.originalname,
          fileSize: req.file.size
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extract tables from PDF by URL
   */
  async extractTablesFromUrl(req, res, next) {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'URL is required'
        });
      }

      try {
        new URL(url);
      } catch (error) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid URL format'
        });
      }

      const result = await pdfService.extractTablesFromUrl(url);

      res.json({
        success: true,
        data: {
          tables: result.tables,
          count: result.count,
          summary: result.summary,
          url: url
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async tablesToExcel(req, res, next) {
  try {
    const { tablesJson } = req.body;
    if (!tablesJson) {
      return res.status(400).json({ error: 'Bad Request', message: 'Tables JSON is required' });
    }
    
    const tablesData = JSON.parse(tablesJson);
    const buffer = await pdfService.generateExcelFromTables(tablesData);
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="extracted_tables.xlsx"',
      'Content-Length': buffer.length
    });
    
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

  /**
   * Extract images from base64 encoded PDF
   */
  async extractImagesFromBase64(req, res, next) {
    try {
      const { base64 } = req.body;

      if (!base64) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Base64 data is required'
        });
      }

      let base64Data = base64;
      if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid base64 format'
          });
        }
        base64Data = matches[2];
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const result = await pdfService.extractImagesFromBuffer(buffer);

      res.json({
        success: true,
        data: {
          images: result.images,
          count: result.count,
          summary: result.summary
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extract images from uploaded PDF file
   */
  async extractImagesFromUpload(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'PDF file is required'
        });
      }

      const result = await pdfService.extractImagesFromBuffer(req.file.buffer);

      res.json({
        success: true,
        data: {
          images: result.images,
          count: result.count,
          summary: result.summary,
          fileName: req.file.originalname,
          fileSize: req.file.size
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Extract images from PDF by URL
   */
  async extractImagesFromUrl(req, res, next) {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'URL is required'
        });
      }

      try {
        new URL(url);
      } catch (error) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid URL format'
        });
      }

      const result = await pdfService.extractImagesFromUrl(url);

      res.json({
        success: true,
        data: {
          images: result.images,
          count: result.count,
          summary: result.summary,
          url: url
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate screenshots from base64 encoded PDF
   */
  async generateScreenshotsFromBase64(req, res, next) {
    try {
      const { base64, scale, pages } = req.body;

      if (!base64) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Base64 data is required'
        });
      }

      let base64Data = base64;
      if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid base64 format'
          });
        }
        base64Data = matches[2];
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const result = await pdfService.generateScreenshotsFromBuffer(buffer, { scale, pages });

      res.json({
        success: true,
        data: {
          screenshots: result.screenshots,
          count: result.count,
          summary: result.summary
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate screenshots from uploaded PDF file
   */
  async generateScreenshotsFromUpload(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'PDF file is required'
        });
      }

      const scale = req.body.scale ? parseFloat(req.body.scale) : undefined;
      const pages = req.body.pages ? JSON.parse(req.body.pages) : undefined;

      const result = await pdfService.generateScreenshotsFromBuffer(req.file.buffer, { scale, pages });

      res.json({
        success: true,
        data: {
          screenshots: result.screenshots,
          count: result.count,
          summary: result.summary,
          fileName: req.file.originalname,
          fileSize: req.file.size
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate screenshots from PDF by URL
   */
  async generateScreenshotsFromUrl(req, res, next) {
    try {
      const { url, scale, pages } = req.body;

      if (!url) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'URL is required'
        });
      }

      try {
        new URL(url);
      } catch (error) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid URL format'
        });
      }

      const result = await pdfService.generateScreenshotsFromUrl(url, { scale, pages });

      res.json({
        success: true,
        data: {
          screenshots: result.screenshots,
          count: result.count,
          summary: result.summary,
          url: url
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PdfController();