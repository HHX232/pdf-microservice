# PDF Processing Microservice

Отдельный Node.js микросервис для обработки PDF файлов с REST API.

## 🏗️ Архитектура

```
┌─────────────────┐         HTTP API        ┌──────────────────┐
│   Next.js App   │ ◄──────────────────────► │  PDF Service     │
│   (Frontend)    │                          │  (Node.js)       │
└─────────────────┘                          └──────────────────┘
                                                      │
                                                      ↓
                                              ┌──────────────┐
                                              │  pdf2json    │
                                              │  Processing  │
                                              └──────────────┘
```

## 📦 Структура проекта

```
pdf-service/
├── src/
│   ├── index.js                 # Главный файл сервера
│   ├── routes/
│   │   └── pdf.routes.js        # API роуты
│   ├── controllers/
│   │   └── pdf.controller.js    # Контроллеры запросов
│   ├── services/
│   │   └── pdf.service.js       # Бизнес-логика PDF
│   └── middleware/
│       └── errorHandler.js      # Обработка ошибок
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Установка и запуск

### Вариант 1: Локальный запуск

```bash
cd pdf-service

# Установка зависимостей
npm install

# Создать .env файл
cp .env.example .env

# Запуск в режиме разработки
npm run dev

# Или в продакшене
npm start
```

Сервис будет доступен на `http://localhost:3001`

### Вариант 2: Docker

```bash
cd pdf-service

# Запуск с docker-compose
docker-compose up -d

# Или сборка и запуск вручную
docker build -t pdf-service .
docker run -p 3001:3001 pdf-service
```

### Вариант 3: Docker + Next.js

```bash
# В docker-compose.yml добавьте ваш Next.js сервис
# И подключите их к одной сети
```

---

## 🔌 API Endpoints

### Health Check
```http
GET /health

Response:
{
  "status": "ok",
  "service": "pdf-processing-service",
  "timestamp": "2024-02-03T10:30:00.000Z"
}
```

### Extract Text from URL
```http
POST /api/pdf/extract-from-url
Content-Type: application/json

{
  "url": "https://example.com/document.pdf"
}

Response:
{
  "success": true,
  "data": {
    "text": "Extracted text content...",
    "pageCount": 5,
    "characterCount": 1234,
    "source": "url",
    "url": "https://example.com/document.pdf"
  }
}
```

### Extract Text from Upload
```http
POST /api/pdf/extract-from-upload
Content-Type: multipart/form-data

FormData: file=document.pdf

Response:
{
  "success": true,
  "data": {
    "text": "Extracted text content...",
    "pageCount": 5,
    "characterCount": 1234,
    "source": "upload",
    "fileName": "document.pdf",
    "fileSize": 524288
  }
}
```

### Extract Text from Base64
```http
POST /api/pdf/extract-from-base64
Content-Type: application/json

{
  "base64": "data:application/pdf;base64,JVBERi0xLjQ..."
}

Response:
{
  "success": true,
  "data": {
    "text": "Extracted text content...",
    "pageCount": 5,
    "characterCount": 1234,
    "source": "base64"
  }
}
```

### Download PDF
```http
POST /api/pdf/download
Content-Type: application/json

{
  "url": "https://example.com/document.pdf"
}

Response:
{
  "success": true,
  "data": {
    "base64": "JVBERi0xLjQ...",
    "size": 524288,
    "url": "https://example.com/document.pdf"
  }
}
```

---

## 🔧 Интеграция с Next.js

### 1. Установка клиента

Скопируйте `pdfServiceClient.ts` в ваш Next.js проект:
```
nextjs-app/
├── lib/
│   └── pdfServiceClient.ts
```

### 2. Настройка переменных окружения

```bash
# .env.local
NEXT_PUBLIC_PDF_SERVICE_URL=http://localhost:3001
```

### 3. Использование в executors

```typescript
import { pdfServiceClient } from '@/lib/pdfServiceClient'

// Скачивание PDF
const base64 = await pdfServiceClient.downloadPdf(url)

// Извлечение текста
const text = await pdfServiceClient.extractFromBase64(base64)
```

### 4. Обновление блоков

Замените executors:
- `DownloadPdfExecutor.ts` → использует `pdfServiceClient.downloadPdf()`
- `ExtractTextFromPdfExecutor.ts` → использует `pdfServiceClient.extractFromBase64()`

---

## 🛡️ Безопасность

- **CORS**: Настроен для разрешенных доменов (см. `.env`)
- **Rate Limiting**: 100 запросов за 15 минут
- **Helmet.js**: Защита HTTP заголовков
- **File Size Limit**: Максимум 50MB
- **Timeout**: 60 секунд для скачивания, 30 для парсинга

---

## 🔍 Мониторинг и логирование

### Health Check
```bash
curl http://localhost:3001/health
```

### Просмотр логов (Docker)
```bash
docker-compose logs -f pdf-service
```

### Метрики
Добавьте prometheus/grafana для мониторинга в production

---

## 📊 Производительность

- **Скорость**: ~1-2 секунды на PDF средних размеров
- **Память**: ~100-200MB RAM в idle
- **Параллелизм**: Node.js event loop обрабатывает множество запросов
- **Масштабирование**: Легко масштабируется горизонтально

---

## 🧪 Тестирование

### Ручное тестирование

```bash
# Проверка health
curl http://localhost:3001/health

# Извлечение текста из URL
curl -X POST http://localhost:3001/api/pdf/extract-from-url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"}'
```

### Unit тесты (TODO)
```bash
npm test
```

---

## 🚀 Деплой

### Heroku
```bash
heroku create your-pdf-service
git push heroku main
```

### Railway
```bash
railway up
```

### DigitalOcean/AWS/GCP
1. Создайте Docker registry
2. Push image
3. Deploy container

---

## 🔄 Workflow в Next.js

### Теперь блоки работают так:

```typescript
// Download PDF Block
URL (STRING) → [Download PDF] → PDF file (base64 STRING)

// Extract Text Block  
PDF file (base64 STRING) → [Extract Text] → Text (STRING)
```

### Преимущества микросервиса:

✅ **Разделение ответственности** - PDF обработка отдельно от Next.js  
✅ **Масштабируемость** - можно запустить несколько инстансов  
✅ **Независимость** - можно использовать из любого приложения  
✅ **Легкий деплой** - Docker-контейнер  
✅ **Производительность** - Node.js оптимизирован для I/O  
✅ **Простота** - REST API понятен всем  

---

## 🛠️ Troubleshooting

### Сервис не запускается
- Проверьте порт 3001 свободен: `lsof -i :3001`
- Проверьте .env файл существует

### CORS ошибки
- Добавьте ваш домен в `ALLOWED_ORIGINS` в `.env`

### Timeout ошибки
- Увеличьте таймауты в клиенте и сервере
- Проверьте размер PDF файла

### Ошибки парсинга PDF
- Проверьте что файл действительно PDF
- Некоторые PDF могут быть защищены или повреждены

---

## 📝 TODO

- [ ] Добавить аутентификацию (JWT/API Keys)
- [ ] Добавить кеширование результатов
- [ ] Добавить поддержку OCR для сканированных PDF
- [ ] Добавить batch processing
- [ ] Добавить WebSocket для прогресса больших файлов
- [ ] Добавить метрики и мониторинг
- [ ] Добавить unit/integration тесты
