const redisService = require('./redis');
const qdrantService = require('./qdrant');
const geminiService = require('./gemini');

/**
 * Initialize all services required for the application
 */
async function initializeServices() {
  try {
    console.log('Connecting to Redis...');
    await redisService.connect();
    console.log('Redis connected successfully');

    console.log('Connecting to Qdrant...');
    await qdrantService.initialize();
    console.log('Qdrant initialized successfully');

    console.log('Initializing Gemini AI...');
    await geminiService.initialize();
    console.log('Gemini AI initialized successfully');

    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Service initialization failed:', error);
    throw error;
  }
}

module.exports = {
  initializeServices
};
