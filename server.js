const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const { initializeServices } = require('./services/initialization');
const { autoIngestNews } = require('./scripts/autoIngest');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting (when behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Logging
app.use(morgan('combined'));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root route - API documentation
app.get('/', (req, res) => {
  res.json({
    name: 'RAG Chatbot API',
    version: '1.0.0',
    description: 'A RAG (Retrieval-Augmented Generation) chatbot API with news ingestion capabilities',
    endpoints: {
      health: {
        method: 'GET',
        path: '/health',
        description: 'Health check endpoint'
      },
      chat: {
        method: 'POST',
        path: '/api/chat',
        description: 'Send a message to the chatbot',
        body: { message: 'string', sessionId: 'string (optional)' }
      },
      history: {
        method: 'GET',
        path: '/api/history/:sessionId',
        description: 'Get chat history for a session'
      },
      reset: {
        method: 'DELETE',
        path: '/api/reset/:sessionId',
        description: 'Clear chat history for a session'
      },
      sessions: {
        method: 'GET',
        path: '/api/sessions',
        description: 'Get all active sessions (debugging)'
      },
      testEmbeddings: {
        method: 'POST',
        path: '/api/test-embeddings',
        description: 'Test embeddings service',
        body: { text: 'string (optional)' }
      },
      admin: {
        method: 'GET',
        path: '/api/admin',
        description: 'Admin panel with system management endpoints'
      }
    },
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize services and start server
async function startServer() {
  try {
    console.log('Initializing services...');
    await initializeServices();

    // Auto-ingest news articles if none exist
    console.log('Checking for news articles...');
    await autoIngestNews();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Chat API: http://localhost:${PORT}/api/chat`);
      console.log(`Admin API: http://localhost:${PORT}/api/admin`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(' SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
