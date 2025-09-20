const express = require('express');
const { v4: uuidv4 } = require('uuid');
const redisService = require('../services/redis');
const ragService = require('../services/rag');
const geminiService = require('../services/gemini');
const embeddingsService = require('../services/embeddings');

const router = express.Router();

/**
 * POST /api/chat
 * Process user query and return bot response
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    const currentSessionId = sessionId || uuidv4();

    // Get chat history for context
    const chatHistory = await redisService.getChatHistory(currentSessionId);

    // Retrieve relevant documents using RAG
    console.log(`Retrieving relevant documents for query: "${message}"`);
    const relevantDocs = await ragService.retrieveRelevantDocuments(message);

    // Generate response using Gemini
    console.log(' Generating response with Gemini...');
    const botResponse = await geminiService.generateResponse(message, relevantDocs, chatHistory);

    // Update chat history
    const userMessage = {
      id: uuidv4(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };

    const assistantMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: botResponse,
      timestamp: new Date().toISOString(),
      sources: relevantDocs.map(doc => ({
        title: doc.title,
        url: doc.url,
        score: doc.score
      }))
    };

    await redisService.addToHistory(currentSessionId, userMessage);
    await redisService.addToHistory(currentSessionId, assistantMessage);

    res.json({
      sessionId: currentSessionId,
      response: botResponse,
      sources: assistantMessage.sources,
      timestamp: assistantMessage.timestamp
    });

  } catch (error) {
    console.error(' Error in /chat endpoint:', error);
    res.status(500).json({
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/history/:sessionId
 * Retrieve chat history for a session
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const history = await redisService.getChatHistory(sessionId);

    res.json({
      sessionId,
      messages: history,
      count: history.length
    });

  } catch (error) {
    console.error(' Error in /history endpoint:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/reset/:sessionId
 * Clear chat history for a session
 */
router.delete('/reset/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    await redisService.clearHistory(sessionId);

    res.json({
      message: 'Chat history cleared successfully',
      sessionId
    });

  } catch (error) {
    console.error(' Error in /reset endpoint:', error);
    res.status(500).json({
      error: 'Failed to clear chat history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/sessions
 * Get all active sessions (for debugging)
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await redisService.getAllSessions();

    res.json({
      sessions,
      count: sessions.length
    });

  } catch (error) {
    console.error(' Error in /sessions endpoint:', error);
    res.status(500).json({
      error: 'Failed to retrieve sessions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/test-embeddings
 * Test embeddings service directly
 */
router.post('/test-embeddings', async (req, res) => {
  try {
    const { text } = req.body;
    const testText = text || 'This is a test message for embeddings';

    console.log(`Testing embeddings with text: "${testText}"`);
    const embedding = await embeddingsService.generateEmbedding(testText);

    res.json({
      success: true,
      text: testText,
      embeddingLength: embedding ? embedding.length : 0,
      embedding: embedding ? embedding.slice(0, 5) : null // Show first 5 values only
    });
  } catch (error) {
    console.error(' Embeddings test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

module.exports = router;
