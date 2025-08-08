const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const ddosProtection = require('./middleware/ddosProtection');
require('dotenv').config();

const db = require('./config/database');
const { initScheduledTasks } = require('./utils/scheduler');
const authRoutes = require('./routes/auth');
const familyRoutes = require('./routes/families');
const userRoutes = require('./routes/users');
const choreRoutes = require('./routes/chores');
const recurringRoutes = require('./routes/recurring');
const uploadRoutes = require('./routes/uploads');
const achievementRoutes = require('./routes/achievements');
const backupRoutes = require('./routes/backups');
const notificationRoutes = require('./routes/notifications');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { logActivity } = require('./middleware/activityLogger');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for proper IP detection behind nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://family.bananas4life.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Enhanced DDOS Protection
app.use(ddosProtection.createIPBlocker());
app.use(ddosProtection.createPatternAnalyzer());
app.use(ddosProtection.createSizeLimiter());
app.use(ddosProtection.createSpeedLimiter());
app.use(ddosProtection.createGeneralLimiter());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (frontend)
app.use(express.static('/app/frontend'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Activity logging middleware
app.use(logActivity);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: require('./package.json').version,
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      database: 'disconnected'
    });
  }
});

// DDOS Protection status endpoint
app.get('/security/status', (req, res) => {
  const stats = ddosProtection.getStats();
  res.json({
    status: 'success',
    data: {
      ddosProtection: {
        ...stats,
        features: [
          'IP Blocking',
          'Pattern Analysis',
          'Request Size Limiting',
          'Speed Limiting',
          'Rate Limiting',
          'Authentication Protection',
          'Upload Protection'
        ]
      }
    }
  });
});

// API routes with enhanced protection
app.use('/api/auth', ddosProtection.createAuthLimiter(), authRoutes);
app.use('/api/families', familyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chores', choreRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/uploads', ddosProtection.createUploadLimiter(), uploadRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/notifications', notificationRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Family Chores API',
    version: require('./package.json').version,
    description: 'Enhanced Family Chore Management System',
    endpoints: {
      auth: '/api/auth',
      families: '/api/families',
      users: '/api/users',
      chores: '/api/chores',
      recurring: '/api/recurring',
      uploads: '/api/uploads',
      achievements: '/api/achievements',
      backups: '/api/backups',
      notifications: '/api/notifications'
    },
    documentation: 'https://family.bananas4life.com/docs',
    health: '/health'
  });
});

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
  // Don't serve frontend for API routes
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return res.status(404).json({
      status: 'fail',
      message: `Can't find ${req.originalUrl} on this server!`
    });
  }
  
  res.sendFile('/app/frontend/index.html');
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Family Chores API v${require('./package.json').version} running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API info: http://localhost:${PORT}/api`);
  
  // Initialize scheduled tasks
  initScheduledTasks();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;
