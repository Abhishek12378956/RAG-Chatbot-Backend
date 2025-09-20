const express = require('express');
const ragService = require('../services/rag');
const newsIngestionService = require('../services/newsIngestion');
const redisService = require('../services/redis');

const router = express.Router();

// Index route to list available admin endpoints
router.get('/', (req, res) => {
  res.json({
    message: 'Admin API',
    endpoints: [
      { method: 'GET', path: '/api/admin', description: 'This help index' },
      { method: 'GET', path: '/api/admin/stats', description: 'Get system statistics' },
      { method: 'POST', path: '/api/admin/ingest', description: 'Trigger news ingestion (body: { type: "rss" | "sample" | "newsapi" })' },
      { method: 'POST', path: '/api/admin/ingest/newsapi', description: 'Trigger NewsAPI ingestion (body: { category?, q?, sources? })' },
      { method: 'DELETE', path: '/api/admin/clear', description: 'Clear all documents from RAG system' },
      { method: 'POST', path: '/api/admin/test', description: 'Run RAG system self-test' },
      { method: 'GET', path: '/api/admin/debug', description: 'Simple debug endpoint' }
    ]
  });
});

/**
 * GET /api/admin/stats
 * Get system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const ragStats = await ragService.getStats();
    const ingestionStats = newsIngestionService.getStats();
    const redisConnected = redisService.isReady();

    res.json({
      rag: ragStats,
      ingestion: ingestionStats,
      redis: {
        connected: redisConnected
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(' Error getting admin stats:', error);
    res.status(500).json({
      error: 'Failed to get system statistics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/ingest
 * Trigger news ingestion
 */
router.post('/ingest', async (req, res) => {
  try {
    const { type = 'rss' } = req.body;

    let result;
    if (type === 'sample') {
      result = await newsIngestionService.ingestSampleArticles();
    } else if (type === 'newsapi') {
      result = await newsIngestionService.ingestFromNewsAPI();
    } else {
      result = await newsIngestionService.ingestFromRSSFeeds();

      // If no articles from RSS, create samples
      if (result.length === 0) {
        result = await newsIngestionService.ingestSampleArticles();
      }
    }

    const stats = await ragService.getStats();

    res.json({
      message: 'Ingestion completed successfully',
      articlesProcessed: result.length,
      type,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(' Error in admin ingestion:', error);
    res.status(500).json({
      error: 'Failed to ingest articles',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/ingest/newsapi
 * Trigger NewsAPI ingestion with specific parameters
 */
router.post('/ingest/newsapi', async (req, res) => {
  try {
    const { category, q, sources, country = 'us' } = req.body;

    const options = {};
    if (category) options.category = category;
    if (q) options.q = q;
    if (sources) options.sources = sources;
    if (country) options.country = country;

    const result = await newsIngestionService.ingestFromNewsAPI(options);
    const stats = await ragService.getStats();

    res.json({
      message: 'NewsAPI ingestion completed successfully',
      articlesProcessed: result.length,
      options,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(' Error in NewsAPI ingestion:', error);
    res.status(500).json({
      error: 'Failed to ingest from NewsAPI',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/admin/clear
 * Clear all documents from RAG system
 */
router.delete('/clear', async (req, res) => {
  try {
    await ragService.clearAllDocuments();

    res.json({
      message: 'All documents cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(' Error clearing documents:', error);
    res.status(500).json({
      error: 'Failed to clear documents',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/test
 * Test RAG system
 */
router.post('/test', async (req, res) => {
  try {
    await ragService.testSystem();

    res.json({
      message: 'RAG system test completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(' Error testing RAG system:', error);
    res.status(500).json({
      error: 'RAG system test failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/debug
 * Simple debug endpoint to test if admin routes work
 */
router.get('/debug', (req, res) => {
  console.log(' Debug endpoint called');
  res.json({
    message: 'Admin debug endpoint working',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
