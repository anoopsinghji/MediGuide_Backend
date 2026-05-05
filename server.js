const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
require('dotenv').config();

// Import database connection and middleware
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const initWebRTCSignaling = require('./realtime/webrtcSignaling');

// Initialize app
const app = express();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is required in production.');
  process.exit(1);
}

const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  // Non-browser clients (curl/mobile/native) typically send no Origin header.
  if (!origin) return true;

  // Keep development permissive if CORS_ORIGIN is not configured.
  if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') return true;

  return allowedOrigins.includes(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
};

// Connect to database and only start the HTTP/Socket server after DB is ready.
// This prevents the app appearing healthy when the DB is down.

// Note: connectDB will exit the process in production on failure.
// We `await` it here so non-production flows can still fall back to DEMO_MODE.
let dbConnected = false;

const startServer = async () => {
  await connectDB();
  dbConnected = true;
};

// =====================
// MIDDLEWARE
// =====================
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const doctorAppPath = path.join(__dirname, '../doctor-app');
const adminAppPath = path.join(__dirname, '../admin-app');
const shouldServeBundledFrontends = process.env.SERVE_FRONTEND_ASSETS === 'true' || process.env.NODE_ENV !== 'production';
const doctorIndexPath = path.join(doctorAppPath, 'index.html');
const adminIndexPath = path.join(adminAppPath, 'index.html');

const canServeDoctorApp = shouldServeBundledFrontends && fs.existsSync(doctorIndexPath);
const canServeAdminApp = shouldServeBundledFrontends && fs.existsSync(adminIndexPath);

if (canServeDoctorApp) {
  app.use('/doctor', express.static(doctorAppPath));
}

if (canServeAdminApp) {
  app.use('/admin', express.static(adminAppPath));
}

const uploadRoot = path.resolve(__dirname, process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadRoot, { recursive: true });
app.use('/uploads', express.static(uploadRoot));

const uploadsOnLocalFilesystem = true;
const uploadsPersistenceWarning = process.env.NODE_ENV === 'production' && uploadsOnLocalFilesystem;

if (uploadsPersistenceWarning) {
  console.warn('⚠️  Uploads are stored on local filesystem. Ensure your host provides persistent disk or use object storage.');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'MediGuide NextGen Backend is running',
    timestamp: new Date(),
    uploads: {
      storage: 'local-filesystem',
      path: uploadRoot,
      persistentStorageRecommended: uploadsPersistenceWarning,
    },
  });
});

// API Status
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'API is operational',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// =====================
// ROUTES
// =====================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consultation', require('./routes/consultation'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/symptoms', require('./routes/symptoms'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/doctor', require('./routes/doctor'));
app.use('/api/admin', require('./routes/admin'));
// app.use('/api/ai', require('./routes/ai'));
// app.use('/api/patient', require('./routes/patient'));

if (canServeDoctorApp) {
  app.get('/doctor/*', (req, res) => {
    res.sendFile(doctorIndexPath);
  });
}

if (canServeAdminApp) {
  app.get('/admin/*', (req, res) => {
    res.sendFile(adminIndexPath);
  });
}

// =====================
// ERROR HANDLING
// =====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use(errorHandler);

// =====================
// SERVER START (deferred until DB ready)
// =====================
const PORT = process.env.PORT || 5000;

startServer()
  .then(() => {
    const httpServer = http.createServer(app);
    const io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (isOriginAllowed(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error('Socket.IO CORS: origin not allowed'));
        },
        credentials: true,
      },
      path: process.env.SOCKET_IO_PATH || '/socket.io',
    });

    initWebRTCSignaling(io);

    httpServer.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🏥 MediGuide NextGen Backend v2.0.0');
      console.log('='.repeat(60));
      console.log(`\n📡 Server running on http://localhost:${PORT}`);
      console.log(`🛰️  Socket signaling: http://localhost:${PORT}${process.env.SOCKET_IO_PATH || '/socket.io'}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: ${process.env.MONGO_URI || 'mongodb://localhost:27017/mediaguide-nextgen'}`);
      console.log(`\n✅ API ready at http://localhost:${PORT}/api`);
      console.log(`📊 Health check: http://localhost:${PORT}/health\n`);
      console.log('='.repeat(60) + '\n');
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

module.exports = app;
