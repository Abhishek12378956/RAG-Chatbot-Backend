# RAG-Powered Chatbot Backend

A Node.js + Express backend for a RAG (Retrieval-Augmented Generation) powered chatbot that provides intelligent responses about news articles.

## Features

- **RAG Pipeline**: Ingest news articles, generate embeddings, and retrieve relevant context
- **Vector Database**: Qdrant integration for similarity search
- **LLM Integration**: Google Gemini API for response generation
- **Caching**: Redis for session management and embedding caching
- **News Ingestion**: RSS feed parsing and web scraping
- **RESTful API**: Clean endpoints for chat, history, and administration
- **Production Ready**: Security, rate limiting, logging, and error handling

## Tech Stack

- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **Vector DB**: Qdrant
- **Cache**: Redis
- **LLM**: Google Gemini API
- **Embeddings**: Jina Embeddings API
- **News Sources**: RSS feeds, web scraping

## Prerequisites

Before running the application, ensure you have:

1. **Node.js 16+** installed
2. **Redis** server running (local or cloud)
3. **Qdrant** server running (local or cloud)
4. **API Keys**:
   - Google Gemini API key
   - Jina Embeddings API key (free tier available)
   - Qdrant API key (if using cloud)

## Installation

1. **Clone and navigate to the backend directory**:

   ```bash
   cd chatbot-backend
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:

   ```bash
   cp .env.example .env
   ```

4. **Configure your `.env` file**:

   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development

   # Gemini API Configuration
   GEMINI_API_KEY=your_gemini_api_key_here

   # Redis Configuration
   REDIS_URL=redis://localhost:6379
   REDIS_TTL=86400

   # Qdrant Configuration
   QDRANT_URL=http://localhost:6333
   QDRANT_API_KEY=your_qdrant_api_key_here
   QDRANT_COLLECTION_NAME=news_articles

   # Jina Embeddings Configuration
   JINA_API_KEY=your_jina_api_key_here
   JINA_MODEL=jina-embeddings-v2-base-en

   # News Ingestion Configuration
   RSS_FEEDS=https://feeds.reuters.com/reuters/topNews,https://rss.cnn.com/rss/edition.rss
   MAX_ARTICLES=50

   # CORS Configuration
   FRONTEND_URL=http://localhost:3000
   ```

## Getting API Keys

### Google Gemini API

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to your `.env` file

### Jina Embeddings API

1. Visit [Jina AI](https://jina.ai/)
2. Sign up for a free account
3. Get your API key from the dashboard
4. Copy the key to your `.env` file

### Qdrant (Optional - for cloud)

1. Visit [Qdrant Cloud](https://cloud.qdrant.io/)
2. Create a cluster
3. Get your API key and URL
4. Update your `.env` file

## Running Dependencies

### Local Redis (using Docker)

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### Local Qdrant (using Docker)

```bash
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
```

## Running the Application

1. **Start the server**:

   ```bash
   npm start
   ```

2. **For development (with auto-reload)**:

   ```bash
   npm run dev
   ```

3. **Ingest news articles**:

   ```bash
   # Ingest from RSS feeds
   npm run ingest

   # Create sample articles for testing
   npm run ingest -- --sample

   # Clear all articles
   npm run ingest -- --clear

   # Show statistics
   npm run ingest -- --stats
   ```

## API Endpoints

### Chat Endpoints

- `POST /api/chat` - Send a message and get bot response
- `GET /api/history/:sessionId` - Get chat history for a session
- `DELETE /api/reset/:sessionId` - Clear chat history for a session
- `GET /api/sessions` - Get all active sessions

### Admin Endpoints

- `GET /api/admin/stats` - Get system statistics
- `POST /api/admin/ingest` - Trigger news ingestion
- `DELETE /api/admin/clear` - Clear all documents
- `POST /api/admin/test` - Test RAG system

### Health Check

- `GET /health` - Server health status

## API Usage Examples

### Send a Chat Message

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the latest news about AI?",
    "sessionId": "optional-session-id"
  }'
```

### Get Chat History

```bash
curl http://localhost:3001/api/history/your-session-id
```

### Get System Statistics

```bash
curl http://localhost:3001/api/admin/stats
```

## Project Structure

```
chatbot-backend/
├── routes/
│   ├── chat.js          # Chat API endpoints
│   └── admin.js         # Admin API endpoints
├── services/
│   ├── initialization.js # Service initialization
│   ├── redis.js         # Redis service
│   ├── qdrant.js        # Qdrant vector database
│   ├── embeddings.js    # Jina embeddings service
│   ├── rag.js           # RAG pipeline
│   ├── gemini.js        # Google Gemini LLM
│   └── newsIngestion.js # News ingestion service
├── scripts/
│   └── ingestNews.js    # News ingestion script
├── server.js            # Main server file
├── package.json         # Dependencies and scripts
├── .env.example         # Environment variables template
└── README.md           # This file
```

## Configuration Options

### Redis Configuration

- `REDIS_URL`: Redis connection URL
- `REDIS_PASSWORD`: Redis password (if required)
- `REDIS_TTL`: Session TTL in seconds (default: 86400 = 24 hours)

### Qdrant Configuration

- `QDRANT_URL`: Qdrant server URL
- `QDRANT_API_KEY`: API key for Qdrant Cloud
- `QDRANT_COLLECTION_NAME`: Collection name for storing embeddings

### News Ingestion

- `RSS_FEEDS`: Comma-separated list of RSS feed URLs
- `MAX_ARTICLES`: Maximum number of articles to ingest

## Deployment

### Deploy to Render.com

1. **Create a new Web Service** on [Render](https://render.com)

2. **Connect your GitHub repository**

3. **Configure the service**:

   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

4. **Add environment variables** in Render dashboard:

   - All variables from your `.env` file
   - Set `NODE_ENV=production`

5. **Add Redis and Qdrant**:
   - Use Render's Redis add-on or external Redis service
   - Use Qdrant Cloud or deploy Qdrant separately

### Environment Variables for Production

```env
NODE_ENV=production
PORT=10000
GEMINI_API_KEY=your_production_gemini_key
JINA_API_KEY=your_production_jina_key
REDIS_URL=your_production_redis_url
QDRANT_URL=your_production_qdrant_url
QDRANT_API_KEY=your_production_qdrant_key
FRONTEND_URL=https://your-frontend-domain.com
```

## Testing

### Test the RAG System

```bash
npm run ingest -- --test
```

### Test Individual Services

```bash
# Test with sample data
npm run ingest -- --sample

# Check system stats
curl http://localhost:3001/api/admin/stats

# Test chat endpoint
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about recent AI developments"}'
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**

   - Ensure Redis is running: `docker ps`
   - Check Redis URL in `.env`
   - Verify network connectivity

2. **Qdrant Connection Failed**

   - Ensure Qdrant is running: `docker ps`
   - Check Qdrant URL in `.env`
   - Verify API key (if using cloud)

3. **Gemini API Errors**

   - Verify API key is correct
   - Check API quotas and limits
   - Ensure billing is set up (if required)

4. **Jina Embeddings Errors**

   - Verify API key is correct
   - Check free tier limits
   - Ensure network connectivity

5. **No Articles Ingested**
   - Check RSS feed URLs
   - Verify network connectivity
   - Use sample articles: `npm run ingest -- --sample`

### Debug Mode

Set `NODE_ENV=development` in your `.env` file for detailed error messages.

### Logs

The application uses Morgan for HTTP logging and console logging for application events.

## Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

### System Statistics

```bash
curl http://localhost:3001/api/admin/stats
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

##  License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review the logs for error messages
3. Ensure all environment variables are set correctly
4. Verify all services (Redis, Qdrant) are running
