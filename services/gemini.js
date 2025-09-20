const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = null;
    this.modelName = 'gemini-1.5-flash';
  }

  async initialize() {
    try {
      if (!this.apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
      }

      const genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = genAI.getGenerativeModel({ 
        model: this.modelName,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      });

      console.log('Gemini service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini service:', error);
      throw error;
    }
  }

  /**
   * Generate response using Gemini with RAG context
   */
  async generateResponse(userQuery, relevantDocs = [], chatHistory = []) {
    try {
      if (!this.model) {
        await this.initialize();
      }

      // Build context from relevant documents
      const contextParts = [];
      
      if (relevantDocs && relevantDocs.length > 0) {
        contextParts.push('RELEVANT NEWS ARTICLES:');
        contextParts.push('');
        
        relevantDocs.forEach((doc, index) => {
          contextParts.push(`Article ${index + 1}:`);
          contextParts.push(`Title: ${doc.title}`);
          contextParts.push(`Source: ${doc.source || 'Unknown'}`);
          contextParts.push(`Published: ${doc.publishedAt || 'Unknown'}`);
          contextParts.push(`URL: ${doc.url || 'N/A'}`);
          
          if (doc.summary) {
            contextParts.push(`Summary: ${doc.summary}`);
          }
          
          // Limit content length for context
          const maxContentLength = 1000;
          const content = doc.content && doc.content.length > maxContentLength 
            ? doc.content.substring(0, maxContentLength) + '...'
            : doc.content;
          
          if (content) {
            contextParts.push(`Content: ${content}`);
          }
          
          contextParts.push('---');
        });
        
        contextParts.push('');
      }

      // Build chat history context
      const historyContext = [];
      if (chatHistory && chatHistory.length > 0) {
        historyContext.push('PREVIOUS CONVERSATION:');
        
        // Limit history to last 10 messages to avoid token limits
        const recentHistory = chatHistory.slice(-10);
        
        recentHistory.forEach(msg => {
          if (msg.role === 'user') {
            historyContext.push(`User: ${msg.content}`);
          } else if (msg.role === 'assistant') {
            historyContext.push(`Assistant: ${msg.content}`);
          }
        });
        
        historyContext.push('');
      }

      // Create the prompt
      const systemPrompt = `You are a helpful AI assistant specialized in providing accurate, informative responses about news and current events. You have access to recent news articles and should use them to provide well-informed answers.

INSTRUCTIONS:
1. Use the provided news articles to answer the user's question accurately
2. If the articles contain relevant information, cite them naturally in your response
3. If the articles don't contain relevant information, acknowledge this and provide a general response
4. Be conversational and helpful while maintaining accuracy
5. Include source attribution when referencing specific articles
6. Keep responses concise but informative (aim for 2-3 paragraphs)
7. If asked about very recent events not in the articles, mention that your information might not be up to date

${contextParts.join('\n')}

${historyContext.join('\n')}

USER QUESTION: ${userQuery}

Please provide a helpful response based on the available information:`;

      const result = await this.model.generateContent(systemPrompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      console.log(`Generated response (${text.length} characters)`);
      return text;

    } catch (error) {
      console.error('Error generating Gemini response:', error);
      
      // Provide fallback response
      if (relevantDocs && relevantDocs.length > 0) {
        return `I found some relevant news articles about your query, but I'm having trouble generating a response right now. Here are the key articles I found:\n\n${relevantDocs.map((doc, i) => `${i + 1}. ${doc.title} (${doc.source})`).join('\n')}`;
      }
      
      return "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.";
    }
  }

  /**
   * Generate a summary for a news article
   */
  async generateSummary(article) {
    try {
      if (!this.model) {
        await this.initialize();
      }

      const prompt = `Please provide a concise 2-3 sentence summary of the following news article:

Title: ${article.title}
Content: ${article.content}

Summary:`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const summary = response.text();

      return summary || 'Summary not available';
    } catch (error) {
      console.error('Error generating article summary:', error);
      return 'Summary not available';
    }
  }

  /**
   * Test the Gemini service
   */
  async testService() {
    try {
      console.log('Testing Gemini service...');
      
      const testResponse = await this.generateResponse(
        'Hello, can you tell me about recent news?',
        [],
        []
      );

      if (testResponse && testResponse.length > 0) {
        console.log(' Gemini service test successful');
        return true;
      } else {
        throw new Error('Empty test response');
      }
    } catch (error) {
      console.error('Gemini service test failed:', error);
      throw error;
    }
  }
}

module.exports = new GeminiService();
