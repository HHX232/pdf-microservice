const { PDFParse } = require('pdf-parse');
const axios = require('axios');
const XLSX = require('xlsx');
const { createWorker } = require('tesseract.js');
const mammoth = require('mammoth');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Chars-per-page threshold below which we consider the PDF a scanned image
const OCR_FALLBACK_THRESHOLD = 50;

class PdfService {
  async generateExcelFromTables(tablesData) {
  try {
    const workbook = XLSX.utils.book_new();
    
    tablesData.tables.forEach((table, index) => {
      const wsData = table.rows.map(row => row.map(cell => cell || ''));
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Авто-размер колонок
      const colWidths = table.rows[0]?.map((_, colIdx) => 
        Math.max(10, ...table.rows.map(row => (row[colIdx] || '').length))
      ) || [];
      ws['!cols'] = colWidths.map(w => ({ w }));
      
      XLSX.utils.book_append_sheet(workbook, ws, 
        `Table_${table.page}_${table.tableIndex} (${table.rowCount}x${table.columnCount})`);
    });
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  } catch (error) {
    throw new Error(`Failed to generate Excel: ${error.message}`);
  }
}
  /**
   * Extract text from PDF buffer — falls back to OCR for scanned PDFs
   */
  async extractTextFromBuffer(buffer) {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();

      const pageCount = result.total || result.pages?.length || 0;
      const text = result.text?.trim() ?? '';

      // Detect scanned PDF: very little text per page → use OCR on page screenshots
      const charsPerPage = pageCount > 0 ? text.length / pageCount : text.length;
      if (charsPerPage < OCR_FALLBACK_THRESHOLD) {
        console.log(`📷 Scanned PDF detected (${Math.round(charsPerPage)} chars/page) — running OCR`);
        try {
          const ocrText = await this._ocrFromBuffer(buffer, pageCount);
          if (ocrText.trim().length > text.length) {
            return { text: ocrText.trim(), pageCount, ocr: true };
          }
        } catch (ocrErr) {
          console.warn('⚠️  OCR failed, returning raw text:', ocrErr.message);
        }
      }

      if (!text) throw new Error('No text content found in PDF');
      return { text, pageCount };
    } catch (error) {
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  /**
   * Run Tesseract OCR on a PDF buffer.
   * Converts pages to JPEG via pdftoppm (poppler), then runs tesseract.js on each.
   */
  async _ocrFromBuffer(buffer) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-ocr-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');

    try {
      await fs.writeFile(pdfPath, buffer);

      // Convert all pages to JPEG at 200 dpi
      await execFileAsync('pdftoppm', ['-r', '200', '-jpeg', pdfPath, path.join(tmpDir, 'page')]);

      const pageFiles = (await fs.readdir(tmpDir))
        .filter(f => f.startsWith('page') && f.endsWith('.jpg'))
        .sort()
        .map(f => path.join(tmpDir, f));

      if (pageFiles.length === 0) throw new Error('pdftoppm produced no images');

      console.log(`  OCR: ${pageFiles.length} pages via pdftoppm`);

      const worker = await createWorker(['rus', 'eng'], 1, { logger: () => {} });
      const texts = [];

      for (let i = 0; i < pageFiles.length; i++) {
        try {
          const imageData = await fs.readFile(pageFiles[i]);
          const { data: { text } } = await worker.recognize(imageData);
          const trimmed = text.trim();
          if (trimmed) texts.push(trimmed);
          console.log(`  OCR page ${i + 1}/${pageFiles.length}: ${trimmed.length} chars`);
        } catch (e) {
          console.warn(`  OCR page ${i + 1} failed:`, e.message);
        }
      }

      await worker.terminate();
      return texts.join('\n\n');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Extract tables from PDF buffer using BOTH methods
   */
  async extractTablesFromBuffer(buffer) {
    try {
      // Метод 1: Используем библиотеку pdf-parse
      const libraryTables = await this._extractTablesWithLibrary(buffer);
      
      // Метод 2: Используем текстовый алгоритм
      const textTables = await this._extractTablesWithTextAlgorithm(buffer);

      // Возвращаем результат метода, который нашел больше таблиц
      if (libraryTables.count > 0 && textTables.count > 0) {
        return libraryTables.count >= textTables.count ? libraryTables : textTables;
      } else if (libraryTables.count > 0) {
        return libraryTables;
      } else if (textTables.count > 0) {
        return textTables;
      }

      // Both methods found nothing — try OCR fallback for scanned PDFs
      console.log('📷 No tables found via standard methods — trying OCR fallback');
      try {
        const ocrText = await this._ocrFromBuffer(buffer);
        if (ocrText.trim().length > 0) {
          const lines = ocrText.split('\n').map(l => l.trimEnd());
          const rawTables = this._extractTablesFromLines(lines);
          const validTables = rawTables.filter(t => t.rows.length >= 2 &&
            Math.max(...t.rows.map(r => r.length)) >= 2);
          if (validTables.length > 0) {
            console.log(`  OCR found ${validTables.length} table(s)`);
            return {
              tables: validTables,
              count: validTables.length,
              ocr: true,
              summary: {
                totalRows: validTables.reduce((s, t) => s + t.rowCount, 0),
                totalColumns: validTables.reduce((s, t) => s + t.columnCount, 0),
                averageColumns: Math.round(validTables.reduce((s, t) => s + t.columnCount, 0) / validTables.length * 10) / 10,
                pagesWithTables: validTables.length
              }
            };
          }
        }
      } catch (ocrErr) {
        console.warn('⚠️  OCR table fallback failed:', ocrErr.message);
      }

      return {
        tables: [],
        count: 0,
        summary: { totalRows: 0, totalColumns: 0, averageColumns: 0, pagesWithTables: 0 }
      };
    } catch (error) {
      throw new Error(`Failed to extract tables from PDF: ${error.message}`);
    }
  }

  /**
   * Method 1: Extract tables using pdf-parse library
   */
  async _extractTablesWithLibrary(buffer) {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getTable();
      await parser.destroy();

      const tables = [];
      
      if (result.pages && Array.isArray(result.pages)) {
        result.pages.forEach((page, pageIndex) => {
          if (page.tables && Array.isArray(page.tables)) {
            page.tables.forEach((table, tableIndex) => {
              if (Array.isArray(table) && table.length > 0) {
                const columnCount = Math.max(...table.map(row => 
                  Array.isArray(row) ? row.length : 0
                ));

                const rows = table.map(row => {
                  if (Array.isArray(row)) {
                    const paddedRow = [...row];
                    while (paddedRow.length < columnCount) {
                      paddedRow.push('');
                    }
                    return paddedRow.map(cell => 
                      cell !== null && cell !== undefined ? String(cell).trim() : ''
                    );
                  }
                  return new Array(columnCount).fill('');
                });

                if (rows.length > 0) {
                  tables.push({
                    page: pageIndex + 1,
                    tableIndex: tableIndex + 1,
                    rowCount: rows.length,
                    columnCount: columnCount,
                    rows: rows
                  });
                }
              }
            });
          }
        });
      }

      return {
        tables: tables,
        count: tables.length,
        summary: {
          totalRows: tables.reduce((sum, t) => sum + t.rowCount, 0),
          totalColumns: tables.reduce((sum, t) => sum + t.columnCount, 0),
          averageColumns: tables.length > 0 
            ? Math.round(tables.reduce((sum, t) => sum + t.columnCount, 0) / tables.length * 10) / 10
            : 0,
          pagesWithTables: Array.from(new Set(tables.map(t => t.page))).length
        }
      };
    } catch (error) {
      console.error('Library method failed:', error.message);
      return {
        tables: [],
        count: 0,
        summary: { totalRows: 0, totalColumns: 0, averageColumns: 0, pagesWithTables: 0 }
      };
    }
  }

  /**
   * Method 2: Extract tables using simple text algorithm
   */
  async _extractTablesWithTextAlgorithm(buffer) {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();

      const text = result.text || '';
      const lines = text.split('\n').map(l => l.trimEnd());

      const rawTables = this._extractTablesFromLines(lines);
      
      const validTables = rawTables.filter(table => {
        if (table.rows.length < 2) return false;
        
        const columnCounts = table.rows.map(r => r.length);
        const mostCommon = columnCounts.sort((a, b) => a - b)[Math.floor(columnCounts.length / 2)];
        
        return mostCommon >= 2;
      });

      return {
        tables: validTables,
        count: validTables.length,
        summary: {
          totalRows: validTables.reduce((sum, t) => sum + t.rowCount, 0),
          totalColumns: validTables.reduce((sum, t) => sum + t.columnCount, 0),
          averageColumns: validTables.length > 0 
            ? Math.round(validTables.reduce((sum, t) => sum + t.columnCount, 0) / validTables.length * 10) / 10
            : 0,
          pagesWithTables: validTables.length
        }
      };
    } catch (error) {
      console.error('Text algorithm failed:', error.message);
      return {
        tables: [],
        count: 0,
        summary: { totalRows: 0, totalColumns: 0, averageColumns: 0, pagesWithTables: 0 }
      };
    }
  }

  /**
   * Split line into columns (2+ spaces = column separator)
   */
  _splitColumns(line) {
    return line.split(/\s{2,}/).map(c => c.trim()).filter(c => c.length > 0);
  }

  /**
   * Extract tables from text lines
   */
  _extractTablesFromLines(lines) {
    const tables = [];
    let currentTable = [];
    let currentPage = 1;
    let linesSinceLastTable = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const columns = this._splitColumns(line);

      if (columns.length < 2) {
        linesSinceLastTable++;
        
        if (currentTable.length >= 2) {
          const columnCount = Math.max(...currentTable.map(r => r.length));
          
          const normalizedRows = currentTable.map(row => {
            const normalized = [...row];
            while (normalized.length < columnCount) {
              normalized.push('');
            }
            return normalized;
          });

          tables.push({
            page: currentPage,
            tableIndex: tables.length + 1,
            rowCount: normalizedRows.length,
            columnCount: columnCount,
            rows: normalizedRows
          });
        }
        
        currentTable = [];
        
        if (linesSinceLastTable > 50) {
          currentPage++;
          linesSinceLastTable = 0;
        }
      } else {
        currentTable.push(columns);
        linesSinceLastTable = 0;
      }
    }

    if (currentTable.length >= 2) {
      const columnCount = Math.max(...currentTable.map(r => r.length));
      const normalizedRows = currentTable.map(row => {
        const normalized = [...row];
        while (normalized.length < columnCount) {
          normalized.push('');
        }
        return normalized;
      });

      tables.push({
        page: currentPage,
        tableIndex: tables.length + 1,
        rowCount: normalizedRows.length,
        columnCount: columnCount,
        rows: normalizedRows
      });
    }

    return tables;
  }

  /**
   * Extract images from PDF buffer
   */
  /**
 * ИСПРАВЛЕНИЕ для pdf.service.js
 * Замените метод extractImagesFromBuffer на этот код
 */

/**
 * Extract images from PDF buffer
 */
async extractImagesFromBuffer(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getImage();
    await parser.destroy();

    const images = [];

    if (result.pages && Array.isArray(result.pages)) {
      result.pages.forEach((page, pageIndex) => {
        if (page.images && Array.isArray(page.images)) {
          page.images.forEach((image, imageIndex) => {
            if (image.data) {
              // ИСПРАВЛЕНИЕ: Проверяем что image.data это Buffer
              let base64Data;
              
              if (Buffer.isBuffer(image.data)) {
                // Правильно: конвертируем Buffer в base64 строку
                base64Data = image.data.toString('base64');
              } else if (image.data instanceof Uint8Array) {
                // Если это Uint8Array, конвертируем через Buffer
                base64Data = Buffer.from(image.data).toString('base64');
              } else if (typeof image.data === 'string') {
                // Если уже строка, используем как есть
                base64Data = image.data;
              } else {
                // Неизвестный тип - пропускаем
                console.warn(`Unknown image data type for page ${pageIndex + 1}, image ${imageIndex + 1}`);
                return;
              }

              images.push({
                page: pageIndex + 1,
                imageIndex: imageIndex + 1,
                width: image.width || null,
                height: image.height || null,
                format: image.format || 'png',
                data: base64Data, // Теперь это точно base64 строка
                size: image.data.length
              });
            }
          });
        }
      });
    }

    return {
      images: images,
      count: images.length,
      summary: {
        totalSize: images.reduce((sum, img) => sum + img.size, 0),
        pagesWithImages: Array.from(new Set(images.map(img => img.page))).length
      }
    };
  } catch (error) {
    throw new Error(`Failed to extract images from PDF: ${error.message}`);
  }
}

  /**
   * Generate screenshots of PDF pages
   */
  async generateScreenshotsFromBuffer(buffer, options = {}) {
    try {
      const scale = options.scale || 1.0;
      const pages = options.pages || null; // null = все страницы, или массив номеров страниц [1, 3, 5]

      const parser = new PDFParse({ data: buffer });
      const result = await parser.getScreenshot({ scale });
      await parser.destroy();

      const screenshots = [];

      if (result.pages && Array.isArray(result.pages)) {
        result.pages.forEach((page, pageIndex) => {
          const pageNumber = pageIndex + 1;
          
          // Если указаны конкретные страницы, проверяем
          if (pages && !pages.includes(pageNumber)) {
            return;
          }

          if (page.data) {
            screenshots.push({
              page: pageNumber,
              width: page.width || null,
              height: page.height || null,
              scale: scale,
              format: 'png',
              data: page.data.toString('base64'), // Конвертируем Buffer в base64
              size: page.data.length
            });
          }
        });
      }

      return {
        screenshots: screenshots,
        count: screenshots.length,
        summary: {
          scale: scale,
          totalSize: screenshots.reduce((sum, s) => sum + s.size, 0),
          pages: screenshots.map(s => s.page)
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate screenshots from PDF: ${error.message}`);
    }
  }

  /**
   * Download PDF from URL
   */
  async downloadPdf(url) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/pdf,*/*'
        }
      });

      const buffer = Buffer.from(response.data);

      if (buffer.length < 100) {
        throw new Error('Downloaded file is too small to be a valid PDF');
      }

      const signature = buffer.toString('utf8', 0, 4);
      if (signature !== '%PDF') {
        throw new Error('Downloaded file is not a valid PDF');
      }

      return buffer;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Download timeout - file may be too large');
        } else if (error.response) {
          throw new Error(`Download failed: HTTP ${error.response.status}`);
        } else if (error.request) {
          throw new Error(`Network error: Could not reach ${url}`);
        }
      }
      throw error;
    }
  }

  /**
   * Extract text from PDF URL
   */
  async extractTextFromUrl(url) {
    const buffer = await this.downloadPdf(url);
    return await this.extractTextFromBuffer(buffer);
  }

  /**
   * Extract tables from PDF URL
   */
  async extractTablesFromUrl(url) {
    const buffer = await this.downloadPdf(url);
    return await this.extractTablesFromBuffer(buffer);
  }

  /**
   * Extract images from PDF URL
   */
  async extractImagesFromUrl(url) {
    const buffer = await this.downloadPdf(url);
    return await this.extractImagesFromBuffer(buffer);
  }

  /**
   * Generate screenshots from PDF URL
   */
  async generateScreenshotsFromUrl(url, options = {}) {
    const buffer = await this.downloadPdf(url);
    return await this.generateScreenshotsFromBuffer(buffer, options);
  }

  // ── Universal document text extractor ──────────────────────────

  /**
   * Detect document format from buffer magic bytes + MIME type hint
   */
  _detectFormat(buffer, mimeType) {
    const mime = (mimeType || '').toLowerCase();
    // DOCX: ZIP signature (PK\x03\x04) + Office MIME
    if (
      mime.includes('wordprocessingml') ||
      mime.includes('docx') ||
      (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
    ) return 'docx';
    // RTF: starts with {\rtf
    if (
      mime.includes('rtf') ||
      buffer.slice(0, 5).toString('ascii') === '{\\rtf'
    ) return 'rtf';
    // PDF: starts with %PDF
    if (
      mime.includes('pdf') ||
      buffer.slice(0, 4).toString('ascii') === '%PDF'
    ) return 'pdf';
    // ODT: ZIP + oasis MIME
    if (mime.includes('opendocument')) return 'odt';
    // Plain text fallback
    return 'txt';
  }

  /**
   * Strip RTF markup — returns plain text without external deps
   */
  _stripRtf(buffer) {
    const raw = buffer.toString('latin1');
    let out = '';
    let depth = 0;
    let skip = false;
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '{') { depth++; i++; continue; }
      if (ch === '}') { depth--; skip = false; i++; continue; }
      if (ch === '\\') {
        i++;
        // Unicode escape \uN
        if (raw[i] === 'u' && /\d/.test(raw[i + 1])) {
          i++;
          let num = '';
          while (/\d/.test(raw[i])) { num += raw[i++]; }
          if (raw[i] === ' ') i++;
          const code = parseInt(num, 10);
          out += code > 0 ? String.fromCharCode(code) : '';
          continue;
        }
        // Control word
        let word = '';
        while (i < raw.length && /[a-zA-Z]/.test(raw[i])) word += raw[i++];
        let param = '';
        if (raw[i] === '-' || /\d/.test(raw[i])) {
          if (raw[i] === '-') { param += '-'; i++; }
          while (/\d/.test(raw[i])) param += raw[i++];
        }
        if (raw[i] === ' ') i++;
        // Skip hidden groups
        if (word === '*') { skip = true; continue; }
        if (['pntext','fonttbl','colortbl','stylesheet','info','header','footer','footnote','object','pict'].includes(word)) skip = true;
        if (word === 'par' || word === 'line') out += '\n';
        if (word === 'tab') out += '\t';
        continue;
      }
      if (!skip && depth > 0) out += ch;
      i++;
    }
    return out.replace(/\r?\n\r?\n+/g, '\n\n').trim();
  }

  /**
   * Extract plain text from any supported document format.
   * Supports: PDF, DOCX, TXT, RTF.
   * Returns { text, pageCount, format }.
   */
  async extractTextFromAnyBuffer(buffer, mimeType) {
    const format = this._detectFormat(buffer, mimeType);
    console.log(`📄 extractTextFromAnyBuffer: format=${format} size=${buffer.length}`);

    switch (format) {
      case 'pdf':
        return this.extractTextFromBuffer(buffer);

      case 'docx': {
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value.trim();
        if (!text) throw new Error('DOCX не содержит текстового контента');
        // Approximate page count: ~3000 chars per page
        const pageCount = Math.max(1, Math.ceil(text.length / 3000));
        return { text, pageCount, format: 'docx' };
      }

      case 'rtf': {
        const text = this._stripRtf(buffer);
        if (!text) throw new Error('RTF не содержит текстового контента');
        const pageCount = Math.max(1, Math.ceil(text.length / 3000));
        return { text, pageCount, format: 'rtf' };
      }

      case 'odt': {
        // ODT is a ZIP — extract content.xml and strip tags
        // Simple approach: find XML text nodes
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(buffer);
          const entry = zip.getEntry('content.xml');
          if (!entry) throw new Error('content.xml не найден в ODT');
          const xml = entry.getData().toString('utf-8');
          const text = xml
            .replace(/<text:p[^>]*>/g, '\n')
            .replace(/<text:line-break\/>/g, '\n')
            .replace(/<text:tab\/>/g, '\t')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
            .trim();
          const pageCount = Math.max(1, Math.ceil(text.length / 3000));
          return { text, pageCount, format: 'odt' };
        } catch (e) {
          throw new Error(`Не удалось прочитать ODT: ${e.message}`);
        }
      }

      case 'txt':
      default: {
        // Try UTF-8, fall back to latin1
        let text;
        try {
          text = buffer.toString('utf-8').trim();
        } catch {
          text = buffer.toString('latin1').trim();
        }
        if (!text) throw new Error('Файл пустой');
        const pageCount = Math.max(1, Math.ceil(text.length / 3000));
        return { text, pageCount, format: 'txt' };
      }
    }
  }
}

module.exports = new PdfService();