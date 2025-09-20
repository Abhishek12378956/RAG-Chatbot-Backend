const embeddingsService = require('./embeddings');
const qdrantService = require('./qdrant');
const redisService = require('./redis');

class RAGService {
  constructor() {
    this.defaultTopK = 5;
    this.defaultScoreThreshold = 0.7;
  }

  /**
   * Retrieve relevant documents for a query
   */
  async retrieveRelevantDocuments(query, topK = this.defaultTopK, scoreThreshold = this.defaultScoreThreshold) {
    try {
      console.log(`Processing query: "${query}"`);

      // Generate embedding for the query
      const queryEmbedding = await embeddingsService.generateEmbedding(query);

      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      console.log(`Query embedding generated (dimension: ${queryEmbedding.length})`);

      // Search for similar documents in Qdrant
      const similarDocs = await qdrantService.searchSimilar(
        queryEmbedding,
        topK,
        scoreThreshold
      );

      console.log(`Found ${similarDocs.length} relevant documents`);

      // Log document scores for debugging
      similarDocs.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.title} (score: ${doc.score.toFixed(3)})`);
      });

      return similarDocs;
    } catch (error) {
      console.error('Error retrieving relevant documents:', error);
      throw error;
    }
  }

  /**
   * Process and store a document in the RAG system
   */
  async processAndStoreDocument(document) {
    try {
      // Check if embedding is already cached
      const cachedEmbedding = await redisService.getCachedEmbedding(document.id);

      let embedding;
      if (cachedEmbedding) {
        console.log(` Using cached embedding for: ${document.title}`);
        embedding = cachedEmbedding;
      } else {
        // Generate embedding text
        const embeddingText = embeddingsService.createEmbeddingText(document);

        // Generate embedding
        embedding = await embeddingsService.generateEmbedding(embeddingText);

        // Cache the embedding
        await redisService.cacheEmbedding(document.id, embedding);
        console.log(`Generated and cached embedding for: ${document.title}`);
      }

      // Store document with embedding in Qdrant
      const documentWithEmbedding = {
        ...document,
        embedding
      };

      await qdrantService.storeDocument(documentWithEmbedding);

      return true;
    } catch (error) {
      console.error(`Error processing document "${document.title}":`, error);
      throw error;
    }
  }

  /**
   * Process and store multiple documents in batch
   */
  async processAndStoreDocuments(documents) {
    try {
      console.log(`Processing ${documents.length} documents...`);

      const documentsWithEmbeddings = [];

      for (const document of documents) {
        try {
          // Check if embedding is already cached
          const cachedEmbedding = await redisService.getCachedEmbedding(document.id);

          let embedding;
          if (cachedEmbedding) {
            embedding = cachedEmbedding;
          } else {
            // Generate embedding text
            const embeddingText = embeddingsService.createEmbeddingText(document);

            // Generate embedding
            embedding = await embeddingsService.generateEmbedding(embeddingText);

            // Cache the embedding
            await redisService.cacheEmbedding(document.id, embedding);
          }

          documentsWithEmbeddings.push({
            ...document,
            embedding
          });

          console.log(`Processed: ${document.title}`);
        } catch (error) {
          console.error(`Failed to process document "${document.title}":`, error);
          // Continue with other documents
        }
      }

      // Store all documents in batch
      if (documentsWithEmbeddings.length > 0) {
        await qdrantService.storeDocuments(documentsWithEmbeddings);
        console.log(`Successfully stored ${documentsWithEmbeddings.length} documents`);
      }

      return documentsWithEmbeddings.length;
    } catch (error) {
      console.error('Error processing documents in batch:', error);
      throw error;
    }
  }

  /**
   * Add a single document to the RAG system (alias for processAndStoreDocument)
   */
  async addDocument(document) {
    return await this.processAndStoreDocument(document);
  }

  /**
   * Add multiple documents to the RAG system (alias for processAndStoreDocuments)
   */
  async addDocuments(documents) {
    return await this.processAndStoreDocuments(documents);
  }

  /**
   * Get RAG system statistics
   */
  async getStats() {
    try {
      const documentCount = await qdrantService.countDocuments();
      const collectionInfo = await qdrantService.getCollectionInfo();

      return {
        documentCount,
        collectionName: qdrantService.collectionName,
        vectorSize: qdrantService.vectorSize,
        collectionStatus: collectionInfo.status,
        indexedVectors: collectionInfo.indexed_vectors_count || 0
      };
    } catch (error) {
      console.error(' Error getting RAG stats:', error);
      return {
        documentCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Clear all documents from the RAG system
   */
  async clearAllDocuments() {
    try {
      console.log('Clearing all documents from RAG system...');
      await qdrantService.clearCollection();
      await redisService.clearAllEmbeddings();
      console.log('All documents cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing documents:', error);
      throw error;
    }
  }

  /**
   * Test the RAG system
   */
  async testSystem() {
    try {
      console.log('Testing RAG system...');

      // Test embeddings service
      await embeddingsService.testService();

      // Test document retrieval with a sample query
      const testQuery = 'latest news about technology';
      const results = await this.retrieveRelevantDocuments(testQuery, 3, 0.5);

      console.log(`RAG system test completed. Found ${results.length} documents for test query.`);
      return true;
    } catch (error) {
      console.error('RAG system test failed:', error);
      throw error;
    }
  }
}

module.exports = new RAGService();
