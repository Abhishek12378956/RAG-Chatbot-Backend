const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const NewsAPI = require('newsapi');
const { v4: uuidv4 } = require('uuid');
const ragService = require('./rag');
const geminiService = require('./gemini');

class NewsIngestionService {
  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      customFields: {
        item: ['media:content', 'media:thumbnail', 'description', 'content:encoded']
      }
    });
    this.maxArticles = parseInt(process.env.MAX_ARTICLES) || 50;
    this.processedUrls = new Set();

    // Initialize NewsAPI if key is provided
    this.newsapi = process.env.NEWSAPI_KEY ? new NewsAPI(process.env.NEWSAPI_KEY) : null;
    if (this.newsapi) {
      console.log(' NewsAPI initialized successfully');
    } else {
      console.log(' NewsAPI key not found - RSS feeds only');
    }
  }

  /**
   * Ingest news from RSS feeds
   */
  async ingestFromRSSFeeds() {
    try {
      const rssFeeds = (process.env.RSS_FEEDS || '').split(',').filter(url => url.trim());

      if (rssFeeds.length === 0) {
        console.log(' No RSS feeds configured');
        return [];
      }

      console.log(` Ingesting from ${rssFeeds.length} RSS feeds...`);

      const allArticles = [];

      for (const feedUrl of rssFeeds) {
        try {
          console.log(` Processing feed: ${feedUrl.trim()}`);
          const articles = await this.processFeed(feedUrl.trim());
          allArticles.push(...articles);

          if (allArticles.length >= this.maxArticles) {
            break;
          }
        } catch (error) {
          console.error(` Error processing feed ${feedUrl}:`, error.message);
        }
      }

      // Limit to max articles
      const limitedArticles = allArticles.slice(0, this.maxArticles);

      console.log(`Collected ${limitedArticles.length} articles`);

      // Process and store articles
      if (limitedArticles.length > 0) {
        const storedCount = await ragService.processAndStoreDocuments(limitedArticles);
        console.log(`Successfully stored ${storedCount} articles in RAG system`);
      }

      return limitedArticles;
    } catch (error) {
      console.error(' Error in RSS ingestion:', error);
      throw error;
    }
  }

  /**
   * Process a single RSS feed
   */
  async processFeed(feedUrl) {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      const articles = [];

      console.log(` Found ${feed.items.length} items in feed: ${feed.title}`);

      for (const item of feed.items) {
        try {
          // Skip if already processed
          if (this.processedUrls.has(item.link)) {
            continue;
          }

          const article = await this.processRSSItem(item, feed);
          if (article) {
            articles.push(article);
            this.processedUrls.add(item.link);
          }

          // Respect rate limits
          await this.delay(500);

        } catch (error) {
          console.error(` Error processing item ${item.title}:`, error.message);
        }
      }

      return articles;
    } catch (error) {
      console.error(` Error parsing feed ${feedUrl}:`, error);
      return [];
    }
  }

  /**
   * Process a single RSS item
   */
  async processRSSItem(item, feed) {
    try {
      // Extract basic information
      const article = {
        id: uuidv4(),
        title: this.cleanText(item.title),
        url: item.link,
        publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
        source: feed.title || 'Unknown Source',
        description: this.cleanText(item.description || item.summary || ''),
        content: '',
        summary: ''
      };

      // Try to get full content
      let fullContent = '';

      // First try content:encoded (full content)
      if (item['content:encoded']) {
        fullContent = this.extractTextFromHTML(item['content:encoded']);
      }

      // If no full content, try to scrape the article
      if (!fullContent && item.link) {
        fullContent = await this.scrapeArticleContent(item.link);
      }

      // Fallback to description
      if (!fullContent) {
        fullContent = article.description;
      }

      article.content = this.cleanText(fullContent);

      // Generate summary if content is long
      if (article.content.length > 500) {
        try {
          article.summary = await geminiService.generateSummary(article);
        } catch (error) {
          console.error(` Error generating summary for ${article.title}:`, error.message);
          // Use first 200 characters as fallback summary
          article.summary = article.content.substring(0, 200) + '...';
        }
      } else {
        article.summary = article.content;
      }

      // Validate article
      if (!article.title || !article.content || article.content.length < 100) {
        console.log(` Skipping article with insufficient content: ${article.title}`);
        return null;
      }

      console.log(` Processed: ${article.title}`);
      return article;

    } catch (error) {
      console.error(` Error processing RSS item:`, error);
      return null;
    }
  }

  /**
   * Scrape article content from URL
   */
  async scrapeArticleContent(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);

      // Remove unwanted elements
      $('script, style, nav, header, footer, aside, .advertisement, .ads, .social-share').remove();

      // Try common article selectors
      const selectors = [
        'article',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.content',
        'main',
        '.story-body',
        '.article-body'
      ];

      let content = '';

      for (const selector of selectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text();
          break;
        }
      }

      // Fallback to body if no specific content found
      if (!content) {
        content = $('body').text();
      }

      return this.cleanText(content);

    } catch (error) {
      console.error(` Error scraping ${url}:`, error.message);
      return '';
    }
  }

  /**
   * Extract text from HTML
   */
  extractTextFromHTML(html) {
    try {
      const $ = cheerio.load(html);
      $('script, style').remove();
      return $.text();
    } catch (error) {
      return html.replace(/<[^>]*>/g, ''); // Simple HTML tag removal
    }
  }

  /**
   * Clean and normalize text
   */
  cleanText(text) {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n+/g, ' ') // Replace newlines with space
      .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, '') // Remove non-printable characters
      .trim();
  }

  /**
   * Delay function for rate limiting
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ingest sample news articles (for testing)
   */
  async ingestSampleArticles() {
    try {
      console.log(' Creating sample news articles...');

      const sampleArticles = [
        {
          id: uuidv4(),
          title: 'Artificial Intelligence Breakthrough in Healthcare',
          content: 'Researchers have developed a new AI system that can diagnose diseases with 95% accuracy. The system uses advanced machine learning algorithms to analyze medical images and patient data. This breakthrough could revolutionize healthcare by providing faster and more accurate diagnoses. The AI system has been tested on thousands of cases and shows promising results across various medical conditions.',
          url: 'https://example.com/ai-healthcare-breakthrough',
          publishedAt: new Date().toISOString(),
          source: 'Tech News Daily',
          summary: 'New AI system achieves 95% accuracy in disease diagnosis, potentially revolutionizing healthcare with faster and more accurate medical analysis.'
        },
        {
          id: uuidv4(),
          title: 'Climate Change Summit Reaches Historic Agreement',
          content: 'World leaders have reached a historic agreement at the latest climate summit to reduce global carbon emissions by 50% within the next decade. The agreement includes commitments from major economies to invest in renewable energy and phase out fossil fuels. Environmental groups have praised the deal as a significant step forward in combating climate change. The implementation will require unprecedented international cooperation and technological innovation.',
          url: 'https://example.com/climate-summit-agreement',
          publishedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          source: 'Global News Network',
          summary: 'World leaders agree to reduce global carbon emissions by 50% in the next decade through renewable energy investments and fossil fuel phase-out.'
        },
        {
          id: uuidv4(),
          title: 'Space Exploration Mission Discovers Water on Mars',
          content: 'NASA\'s latest Mars rover has discovered significant water deposits beneath the planet\'s surface. The discovery was made using advanced ground-penetrating radar technology. Scientists believe this water could support future human missions to Mars and potentially indicate past or present microbial life. The water appears to be in the form of ice and is located at depths accessible by future drilling missions.',
          url: 'https://example.com/mars-water-discovery',
          publishedAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
          source: 'Space Science Today',
          summary: 'NASA rover discovers significant water deposits beneath Mars surface, potentially supporting future human missions and indicating possible microbial life.'
        }
      ];

      const storedCount = await ragService.processAndStoreDocuments(sampleArticles);
      console.log(`Successfully stored ${storedCount} sample articles`);

      return sampleArticles;
    } catch (error) {
      console.error('Error creating sample articles:', error);
      throw error;
    }
  }

  /**
   * Ingest news from NewsAPI
   */
  async ingestFromNewsAPI(options = {}) {
    if (!this.newsapi) {
      throw new Error('NewsAPI key not configured');
    }

    try {
      console.log('Fetching articles from NewsAPI...');

      const params = {
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: Math.min(this.maxArticles, 100), // NewsAPI max is 100
        ...options
      };

      // Get top headlines by default, or everything if query is provided
      let response;
      if (options.q || options.sources) {
        response = await this.newsapi.v2.everything(params);
      } else {
        response = await this.newsapi.v2.topHeadlines({
          ...params,
          country: 'us', // Default to US headlines
          category: options.category || 'general'
        });
      }

      console.log(`Found ${response.articles.length} articles from NewsAPI`);

      const processedArticles = [];

      for (const article of response.articles) {
        try {
          // Skip if already processed
          if (this.processedUrls.has(article.url)) {
            continue;
          }

          const processedArticle = await this.processNewsAPIArticle(article);
          if (processedArticle) {
            processedArticles.push(processedArticle);
            this.processedUrls.add(article.url);
          }

          if (processedArticles.length >= this.maxArticles) {
            break;
          }
        } catch (error) {
          console.error(` Error processing NewsAPI article ${article.url}:`, error.message);
        }
      }

      console.log(`Successfully processed ${processedArticles.length} articles from NewsAPI`);
      return processedArticles;

    } catch (error) {
      console.error(' NewsAPI ingestion failed:', error);
      throw error;
    }
  }

  /**
   * Process a single NewsAPI article
   */
  async processNewsAPIArticle(article) {
    try {
      // Skip articles without content
      if (!article.title || !article.description) {
        return null;
      }

      // Create structured article object
      const structuredArticle = {
        id: uuidv4(),
        title: article.title,
        url: article.url,
        source: article.source?.name || 'NewsAPI',
        author: article.author || 'Unknown',
        publishedAt: new Date(article.publishedAt),
        description: article.description,
        content: article.content || article.description,
        imageUrl: article.urlToImage,
        category: 'news'
      };

      // Generate summary using Gemini if content is long
      if (structuredArticle.content && structuredArticle.content.length > 500) {
        try {
          structuredArticle.summary = await geminiService.generateSummary(structuredArticle.content);
        } catch (error) {
          console.warn(`Could not generate summary for ${structuredArticle.title}:`, error.message);
          structuredArticle.summary = structuredArticle.description;
        }
      } else {
        structuredArticle.summary = structuredArticle.description;
      }

      // Add to RAG system
      await ragService.addDocument(structuredArticle);

      return structuredArticle;

    } catch (error) {
      console.error(' Error processing NewsAPI article:', error);
      return null;
    }
  }

  /**
   * Get ingestion statistics
   */
  getStats() {
    return {
      processedUrls: this.processedUrls.size,
      maxArticles: this.maxArticles
    };
  }
}

module.exports = new NewsIngestionService();
