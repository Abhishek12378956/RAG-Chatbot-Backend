const { QdrantClient } = require('@qdrant/js-client-rest');
const fetch = require('node-fetch');

class QdrantService {
  constructor() {
    this.client = null;
    this.collectionName = process.env.QDRANT_COLLECTION_NAME || 'news_articles';
    this.vectorSize = 768; // Jina embeddings dimension
    this.fallback = false; // use in-memory store when true
    this.memoryStore = []; // { id, vector, payload }
  }

  async testConnection(url) {
    try {
      console.log(`Testing connection to Qdrant at ${url}...`);
      const response = await fetch(`${url}/collections`, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.QDRANT_API_KEY ? { 'api-key': process.env.QDRANT_API_KEY } : {})
        }
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      console.log('Qdrant connection test successful:', data);
      return true;
    } catch (error) {
      console.error('Qdrant connection test failed:', {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack
      });
      throw error;
    }
  }

  ensureSecureUrl(url) {
    // Don't enforce HTTPS for localhost
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      // Ensure we're using http:// for localhost
      if (url.startsWith('https://')) {
        url = url.replace('https://', 'http://');
        console.log('Switched to HTTP for localhost connection');
      }
      return url;
    }

    // For non-localhost with API key, ensure HTTPS
    if (process.env.QDRANT_API_KEY) {
      if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
        console.log('Switched to HTTPS for secure API key connection');
      } else if (!url.startsWith('https://')) {
        url = `https://${url}`;
        console.log('Added HTTPS for secure API key connection');
      }
    }
    return url;
  }

  async initialize() {
    try {
      let qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';

      // Ensure secure connection if using API key
      qdrantUrl = this.ensureSecureUrl(qdrantUrl);

      console.log(`Initializing Qdrant client with URL: ${qdrantUrl}`);

      // First test the raw connection
      await this.testConnection(qdrantUrl);

      const config = {
        url: qdrantUrl,
        checkCompatibility: false,
        // Use a simple fetch implementation
        fetch: async (url, options = {}) => {
          try {
            const response = await fetch(url, {
              ...options,
              headers: {
                ...options.headers,
                'Content-Type': 'application/json',
                ...(process.env.QDRANT_API_KEY ? { 'api-key': process.env.QDRANT_API_KEY } : {})
              },
              timeout: 5000,
              rejectUnauthorized: qdrantUrl.startsWith('https')
            });
            return response;
          } catch (error) {
            console.error('Fetch error:', {
              url,
              error: error.message,
              code: error.code,
              stack: error.stack
            });
            throw error;
          }
        }
      };

      if (process.env.QDRANT_API_KEY) {
        config.apiKey = process.env.QDRANT_API_KEY;
        console.log('Using Qdrant with API key');
      } else {
        console.log('Using Qdrant without API key');
      }

      this.client = new QdrantClient(config);

      // Test the client connection
      console.log('Testing Qdrant client...');
      const collections = await this.client.getCollections();
      console.log('Qdrant client initialized successfully. Collections:', collections);

      await this.ensureCollection();
      return this.client;

    } catch (error) {
      console.error('Failed to initialize Qdrant:', {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack
      });

      if (error.code === 'ECONNREFUSED') {
        console.error(`\n Cannot connect to Qdrant at ${process.env.QDRANT_URL || 'http://localhost:6333'}. Please check:`);
        console.error('1. Is Qdrant server running?');
        console.error('2. Is the URL correct?');
        console.error('3. Are there any firewall rules blocking the connection?');
      }

      console.log('\n  Switching to in-memory fallback mode. Data will not persist after restart.\n');
      this.fallback = true;
      this.client = null;
      return null;
    }
  }

  async ensureCollection() {
    try {
      if (this.fallback) return; // no-op in fallback mode
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        col => col.name === this.collectionName
      );

      if (!collectionExists) {
        console.log(`Creating collection: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine'
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });
        console.log(`Collection ${this.collectionName} created successfully`);
      } else {
        console.log(`Collection ${this.collectionName} already exists`);
      }
    } catch (error) {
      console.error('Error ensuring collection exists:', error);
      throw error;
    }
  }

  /**
   * Store document with embedding in Qdrant
   */
  async storeDocument(document) {
    try {
      const point = {
        id: document.id,
        vector: document.embedding,
        payload: {
          title: document.title,
          content: document.content,
          url: document.url,
          publishedAt: document.publishedAt,
          source: document.source,
          summary: document.summary || '',
          createdAt: new Date().toISOString()
        }
      };

      if (this.fallback) {
        // replace if exists
        this.memoryStore = this.memoryStore.filter(p => p.id !== point.id);
        this.memoryStore.push(point);
      } else {
        await this.client.upsert(this.collectionName, {
          wait: true,
          points: [point]
        });
      }

      console.log(`Document stored: ${document.title}`);
      return true;
    } catch (error) {
      console.error('Error storing document:', error);
      throw error;
    }
  }

  /**
   * Store multiple documents in batch
   */
  async storeDocuments(documents) {
    try {
      const points = documents.map(doc => ({
        id: doc.id,
        vector: doc.embedding,
        payload: {
          title: doc.title,
          content: doc.content,
          url: doc.url,
          publishedAt: doc.publishedAt,
          source: doc.source,
          summary: doc.summary || '',
          createdAt: new Date().toISOString()
        }
      }));

      if (this.fallback) {
        const ids = new Set(points.map(p => p.id));
        this.memoryStore = this.memoryStore.filter(p => !ids.has(p.id));
        this.memoryStore.push(...points);
      } else {
        await this.client.upsert(this.collectionName, {
          wait: true,
          points
        });
      }

      console.log(`Stored ${documents.length} documents in ${this.fallback ? 'memory' : 'Qdrant'}`);
      return true;
    } catch (error) {
      console.error('Error storing documents in batch:', error);
      throw error;
    }
  }

  /**
   * Search for similar documents
   */
  async searchSimilar(queryEmbedding, limit = 5, scoreThreshold = 0.7) {
    try {
      if (this.fallback) {
        // compute cosine similarity in memory
        const results = this.memoryStore
          .map(p => ({
            id: p.id,
            score: this.cosineSimilarity(queryEmbedding, p.vector),
            payload: p.payload
          }))
          .filter(r => r.score >= scoreThreshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(result => ({
            id: result.id,
            score: result.score,
            title: result.payload.title,
            content: result.payload.content,
            url: result.payload.url,
            publishedAt: result.payload.publishedAt,
            source: result.payload.source,
            summary: result.payload.summary
          }));
        return results;
      }

      const searchResult = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true
      });

      return searchResult.map(result => ({
        id: result.id,
        score: result.score,
        title: result.payload.title,
        content: result.payload.content,
        url: result.payload.url,
        publishedAt: result.payload.publishedAt,
        source: result.payload.source,
        summary: result.payload.summary
      }));
    } catch (error) {
      console.error('Error searching similar documents:', error);
      throw error;
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo() {
    try {
      if (this.fallback) {
        return {
          status: 'yellow',
          points_count: this.memoryStore.length,
          indexed_vectors_count: this.memoryStore.length,
          vectors_count: this.memoryStore.length
        };
      }
      const info = await this.client.getCollection(this.collectionName);
      return info;
    } catch (error) {
      console.error('Error getting collection info:', error);
      throw error;
    }
  }

  /**
   * Count documents in collection
   */
  async countDocuments() {
    try {
      const info = await this.getCollectionInfo();
      return info.points_count || 0;
    } catch (error) {
      console.error('Error counting documents:', error);
      return 0;
    }
  }

  /**
   * Delete document by ID
   */
  async deleteDocument(docId) {
    try {
      if (this.fallback) {
        this.memoryStore = this.memoryStore.filter(p => p.id !== docId);
      } else {
        await this.client.delete(this.collectionName, {
          wait: true,
          points: [docId]
        });
      }
      console.log(`Document deleted: ${docId}`);
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Clear all documents from collection
   */
  async clearCollection() {
    try {
      if (this.fallback) {
        this.memoryStore = [];
      } else {
        await this.client.delete(this.collectionName, {
          wait: true,
          filter: {}
        });
      }
      console.log(`Collection ${this.collectionName} cleared`);
      return true;
    } catch (error) {
      console.error('Error clearing collection:', error);
      throw error;
    }
  }

  // Utilities
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
}

module.exports = new QdrantService();
