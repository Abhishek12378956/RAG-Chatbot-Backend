const redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redisConfig = {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      };

      if (process.env.REDIS_PASSWORD) {
        redisConfig.password = process.env.REDIS_PASSWORD;
      }

      this.client = redis.createClient(redisConfig);

      this.client.on('error', (err) => {
        console.error(' Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis Client Ready');
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Add a message to chat history
   */
  async addToHistory(sessionId, message) {
    try {
      const key = `chat:${sessionId}`;
      const messageStr = JSON.stringify(message);

      await this.client.lPush(key, messageStr);

      // Set TTL for the session
      const ttl = parseInt(process.env.REDIS_TTL) || 86400; // 24 hours default
      await this.client.expire(key, ttl);

      return true;
    } catch (error) {
      console.error('Error adding to chat history:', error);
      throw error;
    }
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(sessionId) {
    try {
      const key = `chat:${sessionId}`;
      const messages = await this.client.lRange(key, 0, -1);

      // Reverse to get chronological order (oldest first)
      return messages.reverse().map(msg => JSON.parse(msg));
    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Clear chat history for a session
   */
  async clearHistory(sessionId) {
    try {
      const key = `chat:${sessionId}`;
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      throw error;
    }
  }

  /**
   * Get all active sessions (for debugging)
   */
  async getAllSessions() {
    try {
      const keys = await this.client.keys('chat:*');
      return keys.map(key => key.replace('chat:', ''));
    } catch (error) {
      console.error('Error getting all sessions:', error);
      return [];
    }
  }

  /**
   * Cache embeddings for a document
   */
  async cacheEmbedding(docId, embedding) {
    try {
      const key = `embedding:${docId}`;
      const embeddingStr = JSON.stringify(embedding);

      await this.client.setEx(key, 7 * 24 * 60 * 60, embeddingStr); // 7 days TTL
      return true;
    } catch (error) {
      console.error('Error caching embedding:', error);
      throw error;
    }
  }

  /**
   * Get cached embedding for a document
   */
  async getCachedEmbedding(docId) {
    try {
      const key = `embedding:${docId}`;
      const embeddingStr = await this.client.get(key);

      return embeddingStr ? JSON.parse(embeddingStr) : null;
    } catch (error) {
      console.error('Error getting cached embedding:', error);
      return null;
    }
  }

  /**
   * Clear all cached embeddings
   */
  async clearAllEmbeddings() {
    try {
      const keys = await this.client.keys('embedding:*');
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(` Cleared ${keys.length} cached embeddings`);
      }
      return keys.length;
    } catch (error) {
      console.error('Error clearing cached embeddings:', error);
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady() {
    return this.isConnected && this.client && this.client.isReady;
  }
}

module.exports = new RedisService();
