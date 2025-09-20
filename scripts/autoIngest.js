const newsIngestionService = require('../services/newsIngestion');
const ragService = require('../services/rag');

/**
 * Automatically ingest news articles to populate the RAG system
 */
async function autoIngestNews() {
    try {
        console.log('Starting automatic news ingestion...');

        // Check if we already have articles
        const stats = await ragService.getStats();
        if (stats.totalDocuments > 0) {
            console.log(`Found ${stats.totalDocuments} existing articles, skipping ingestion`);
            return;
        }

        console.log('No articles found, ingesting news...');

        let articles = [];

        // Try NewsAPI first
        try {
            if (process.env.NEWSAPI_KEY) {
                console.log('Trying NewsAPI ingestion...');
                articles = await newsIngestionService.ingestFromNewsAPI({
                    category: 'technology',
                    pageSize: 20
                });
                console.log(` NewsAPI: Ingested ${articles.length} articles`);
            }
        } catch (error) {
            console.log('NewsAPI failed, trying alternatives...');
        }

        // If NewsAPI didn't work, try RSS feeds
        if (articles.length === 0) {
            try {
                console.log('Trying RSS feeds...');
                articles = await newsIngestionService.ingestFromRSSFeeds();
                console.log(`RSS: Ingested ${articles.length} articles`);
            } catch (error) {
                console.log('RSS feeds failed, using sample articles...');
            }
        }

        // If nothing worked, create sample articles
        if (articles.length === 0) {
            console.log('Creating sample articles...');
            articles = await newsIngestionService.ingestSampleArticles();
            console.log(` Sample: Created ${articles.length} articles`);
        }

        // Show final stats
        const finalStats = await ragService.getStats();
        console.log(`Auto-ingestion complete! Total articles: ${finalStats.totalDocuments}`);

        return articles;

    } catch (error) {
        console.error(' Auto-ingestion failed:', error);

        // Fallback: create basic sample articles
        try {
            console.log('Creating fallback sample articles...');
            const fallbackArticles = await newsIngestionService.ingestSampleArticles();
            console.log(`Fallback: Created ${fallbackArticles.length} sample articles`);
            return fallbackArticles;
        } catch (fallbackError) {
            console.error(' Even fallback failed:', fallbackError);
            return [];
        }
    }
}

module.exports = {
    autoIngestNews
};
