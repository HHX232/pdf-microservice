const { PDFParse } = require('pdf-parse');
const axios = require('axios');
const XLSX = require('xlsx');

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
   * Extract text from PDF buffer
   */
  async extractTextFromBuffer(buffer) {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();

      if (!result.text || result.text.trim().length === 0) {
        throw new Error('No text content found in PDF');
      }

      return {
        text: result.text.trim(),
        pageCount: result.numpages || 0
      };
    } catch (error) {
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
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
      } else {
        return {
          tables: [],
          count: 0,
          summary: {
            totalRows: 0,
            totalColumns: 0,
            averageColumns: 0,
            pagesWithTables: 0
          }
        };
      }
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
}

module.exports = new PdfService();