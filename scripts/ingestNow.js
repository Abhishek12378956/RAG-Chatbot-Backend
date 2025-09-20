require('dotenv').config();
const { initializeServices } = require('../services/initialization');
const newsIngestionService = require('../services/newsIngestion');

async function ingestNewsNow() {
    try {
        console.log('Manual news ingestion starting...');

        // Initialize services first
        await initializeServices();

        // Ingest from NewsAPI
        console.log('Ingesting from NewsAPI...');
        const articles = await newsIngestionService.ingestFromNewsAPI({
            category: 'technology',
            pageSize: 25
        });

        console.log(` Successfully ingested ${articles.length} articles!`);
        console.log('Your RAG chatbot now has real news data!');

        process.exit(0);
    } catch (error) {
        console.error('Ingestion failed:', error);

        // Try sample articles as fallback
        try {
            console.log('Trying sample articles as fallback...');
            const sampleArticles = await newsIngestionService.ingestSampleArticles();
            console.log(`Created ${sampleArticles.length} sample articles!`);
            process.exit(0);
        } catch (fallbackError) {
            console.error('Even sample articles failed:', fallbackError);
            process.exit(1);
        }
    }
}

// Run the ingestion
ingestNewsNow();
