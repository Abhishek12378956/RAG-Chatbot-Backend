const axios = require('axios');

class EmbeddingsService {
  constructor() {
    this.jinaApiKey = process.env.JINA_API_KEY;
    this.jinaModel = process.env.JINA_MODEL || 'jina-embeddings-v3';
    this.jinaApiUrl = 'https://api.jina.ai/v1/embeddings';
  }

  /**
   * Generate embeddings using Jina API
   */
  async generateEmbeddings(texts) {
    try {
      console.log(' Starting generateEmbeddings...');
      console.log(' API Key present:', !!this.jinaApiKey);
      console.log(' API Key length:', this.jinaApiKey ? this.jinaApiKey.length : 0);
      console.log(' Model:', this.jinaModel);
      console.log(' API URL:', this.jinaApiUrl);

      if (!this.jinaApiKey) {
        throw new Error('JINA_API_KEY is not configured');
      }

      // Ensure texts is an array
      const inputTexts = Array.isArray(texts) ? texts : [texts];

      // Validate input texts
      const validTexts = inputTexts.filter(text => text && typeof text === 'string' && text.trim().length > 0);
      if (validTexts.length === 0) {
        throw new Error('No valid text inputs provided for embedding generation');
      }

      console.log(`Generating embeddings for ${validTexts.length} text(s) using model: ${this.jinaModel}`);
      console.log('Input texts:', validTexts.map(t => t.substring(0, 100) + '...'));

      const requestPayload = {
        model: this.jinaModel,
        input: validTexts
      };

      console.log(' Request payload:', JSON.stringify(requestPayload, null, 2));

      const response = await axios.post(
        this.jinaApiUrl,
        requestPayload,
        {
          headers: {
            'Authorization': `Bearer ${this.jinaApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      console.log(' Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.data || !response.data.data) {
        console.error('Invalid response structure:', response.data);
        throw new Error('Invalid response from Jina API');
      }

      const embeddings = response.data.data.map(item => item.embedding);
      console.log('Successfully generated embeddings, count:', embeddings.length);

      // Return single embedding if single text was provided
      return Array.isArray(texts) ? embeddings : embeddings[0];
    } catch (error) {
      console.error(' Error generating embeddings:', error.message);
      console.error('Error type:', error.constructor.name);
      console.error('Error code:', error.code);

      if (error.response) {
        console.error('Jina API Response Status:', error.response.status);
        console.error('Jina API Response Headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('Jina API Response Data:', JSON.stringify(error.response.data, null, 2));
        throw new Error(`Jina API error: ${error.response.status} - ${error.response.data.message || error.response.data.detail || error.response.data.error || JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        console.error(' No response received from Jina API');
        console.error(' Request details:', error.request);
        throw new Error('No response received from Jina API - check network connection');
      } else {
        console.error('Error setting up request:', error.message);
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  }

  /**
   * Generate embedding for a single text with caching
   */
  async generateEmbedding(text) {
    try {
      const embeddings = await this.generateEmbeddings([text]);
      return embeddings[0];
    } catch (error) {
      console.error('❌ Error generating single embedding:', error);
      throw error;
    }
  }

  /**
   * Prepare text for embedding (clean and truncate)
   */
  prepareTextForEmbedding(text, maxLength = 8192) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Clean the text
    let cleanText = text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n+/g, ' ') // Replace newlines with space
      .trim();

    // Truncate if too long
    if (cleanText.length > maxLength) {
      cleanText = cleanText.substring(0, maxLength) + '...';
    }

    return cleanText;
  }

  /**
   * Create embedding text from document
   */
  createEmbeddingText(document) {
    const parts = [];

    if (document.title) {
      parts.push(`Title: ${document.title}`);
    }

    if (document.summary) {
      parts.push(`Summary: ${document.summary}`);
    }

    if (document.content) {
      // Limit content length
      const maxContentLength = 6000;
      const content = document.content.length > maxContentLength
        ? document.content.substring(0, maxContentLength) + '...'
        : document.content;
      parts.push(`Content: ${content}`);
    }

    return this.prepareTextForEmbedding(parts.join('\n\n'));
  }

  /**
   * Test the embeddings service
   */
  async testService() {
    try {
      console.log('🧪 Testing Jina embeddings service...');
      const testText = 'This is a test sentence for embedding generation.';
      const embedding = await this.generateEmbedding(testText);

      if (embedding && Array.isArray(embedding) && embedding.length > 0) {
        console.log(`✅ Embeddings service working. Vector dimension: ${embedding.length}`);
        return true;
      } else {
        throw new Error('Invalid embedding response');
      }
    } catch (error) {
      console.error('❌ Embeddings service test failed:', error);
      throw error;
    }
  }
}

module.exports = new EmbeddingsService();
