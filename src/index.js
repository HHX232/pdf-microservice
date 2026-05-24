const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const pdfRoutes = require('./routes/pdf.routes');
const emailRoutes = require('./routes/email.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Railway / any single reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}${req.method}\x1b[0m ${req.url} \x1b[90m${res.statusCode} ${ms}ms\x1b[0m`);
  });
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(compression());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    services: ['pdf', 'email'],
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/pdf', pdfRoutes);
app.use('/api/email', emailRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.url} not found` 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 PDF + Email Service running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️  RESEND_API_KEY not set — email sending will fail');
  }
});

module.exports = app;
