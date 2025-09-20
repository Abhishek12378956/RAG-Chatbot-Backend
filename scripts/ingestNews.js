#!/usr/bin/env node

/**
 * News Ingestion Script
 * 
 * This script ingests news articles from RSS feeds and stores them in the RAG system.
 * 
 * Usage:
 *   npm run ingest                    # Ingest from RSS feeds
 *   npm run ingest -- --sample        # Create sample articles for testing
 *   npm run ingest -- --clear         # Clear all existing articles
 *   npm run ingest -- --stats         # Show RAG system statistics
 */

require('dotenv').config();
const newsIngestionService = require('../services/newsIngestion');
const ragService = require('../services/rag');
const { initializeServices } = require('../services/initialization');

async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];

    console.log('Starting news ingestion script...');
    
    // Initialize services
    await initializeServices();

    switch (command) {
      case '--sample':
        console.log('Creating sample articles...');
        await newsIngestionService.ingestSampleArticles();
        break;
        
      case '--clear':
        console.log('Clearing all articles...');
        await ragService.clearAllDocuments();
        console.log('All articles cleared');
        break;
        
      case '--stats':
        console.log('Getting RAG system statistics...');
        const stats = await ragService.getStats();
        console.log('Statistics:', JSON.stringify(stats, null, 2));
        break;
        
      case '--test':
        console.log('Testing RAG system...');
        await ragService.testSystem();
        break;
        
      default:
        console.log('Ingesting from RSS feeds...');
        const articles = await newsIngestionService.ingestFromRSSFeeds();
        
        if (articles.length === 0) {
          console.log('No articles were ingested. Creating sample articles instead...');
          await newsIngestionService.ingestSampleArticles();
        }
        
        // Show final statistics
        const finalStats = await ragService.getStats();
        console.log('Final Statistics:', JSON.stringify(finalStats, null, 2));
        break;
    }

    console.log('News ingestion completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('News ingestion failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n Ingestion interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n Ingestion terminated');
  process.exit(0);
});

// Run the script
main();
