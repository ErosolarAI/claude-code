/**
 * Web Tools - Web search and content extraction capabilities
 *
 * Provides:
 * - WebSearch: Search the web using Tavily, Brave, or SerpAPI
 * - WebExtract: Extract and summarize content from URLs
 */

import type { ToolDefinition } from '../core/toolRuntime.js';
import { getSecretValue } from '../core/secretStore.js';
import { buildError } from '../core/errors.js';

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
}

interface TavilySearchResponse {
  results: TavilySearchResult[];
  answer?: string;
  query: string;
}

interface TavilyExtractResponse {
  results: Array<{
    url: string;
    raw_content: string;
  }>;
}

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  profile?: { name: string };
  publishedDate?: string;
}

interface BraveSearchResponse {
  web?: {
    results: BraveSearchResult[];
  };
}

interface SerpAPIResult {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  date?: string;
}

interface SerpAPIResponse {
  organic_results?: SerpAPIResult[];
}

type SearchProvider = 'tavily' | 'brave' | 'serpapi';

/**
 * Create web tools for search and extraction.
 */
export function createWebTools(): ToolDefinition[] {
  return [
    {
      name: 'WebSearch',
      description: 'Search the web for information. Returns relevant results from search engines. Requires TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or SERPAPI_API_KEY.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5, max: 10)',
          },
          searchDepth: {
            type: 'string',
            enum: ['basic', 'advanced'],
            description: 'Search depth for Tavily: basic (fast) or advanced (thorough). Default: basic',
          },
          includeAnswer: {
            type: 'boolean',
            description: 'For Tavily: include AI-generated answer summary. Default: true',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      handler: async (args) => {
        const query = args['query'];
        if (typeof query !== 'string' || !query.trim()) {
          return 'Error: query is required';
        }

        const maxResults = Math.min(
          typeof args['maxResults'] === 'number' ? args['maxResults'] : 5,
          10
        );
        const searchDepth = args['searchDepth'] === 'advanced' ? 'advanced' : 'basic';
        const includeAnswer = args['includeAnswer'] !== false;

        try {
          // Try providers in order of preference
          const tavilyKey = getSecretValue('TAVILY_API_KEY');
          if (tavilyKey) {
            return await searchTavily(query, tavilyKey, { maxResults, searchDepth, includeAnswer });
          }

          const braveKey = getSecretValue('BRAVE_SEARCH_API_KEY');
          if (braveKey) {
            return await searchBrave(query, braveKey, { maxResults });
          }

          const serpKey = getSecretValue('SERPAPI_API_KEY');
          if (serpKey) {
            return await searchSerpAPI(query, serpKey, { maxResults });
          }

          return 'WebSearch requires either TAVILY_API_KEY (recommended), BRAVE_SEARCH_API_KEY, or SERPAPI_API_KEY to be configured. Use /secrets set to configure.';
        } catch (error) {
          return buildError('WebSearch', error, { query });
        }
      },
    },
    {
      name: 'WebExtract',
      description: 'Extract and summarize content from one or more URLs. Uses Tavily for high-quality extraction. Requires TAVILY_API_KEY.',
      parameters: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'URLs to extract content from (max 5)',
          },
          url: {
            type: 'string',
            description: 'Single URL to extract content from (alternative to urls array)',
          },
        },
        additionalProperties: false,
      },
      handler: async (args) => {
        let urls: string[] = [];

        if (Array.isArray(args['urls'])) {
          urls = args['urls'].filter((u): u is string => typeof u === 'string');
        } else if (typeof args['url'] === 'string') {
          urls = [args['url']];
        }

        if (urls.length === 0) {
          return 'Error: at least one URL is required';
        }

        // Limit to 5 URLs
        urls = urls.slice(0, 5);

        const tavilyKey = getSecretValue('TAVILY_API_KEY');
        if (!tavilyKey) {
          return 'WebExtract requires TAVILY_API_KEY to be configured. Use /secrets set TAVILY_API_KEY to configure.';
        }

        try {
          return await extractTavily(urls, tavilyKey);
        } catch (error) {
          return buildError('WebExtract', error, { urls: urls.join(', ') });
        }
      },
    },
  ];
}

/**
 * Search using Tavily API (recommended provider)
 */
async function searchTavily(
  query: string,
  apiKey: string,
  options: { maxResults: number; searchDepth: string; includeAnswer: boolean }
): Promise<string> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: options.searchDepth,
      include_answer: options.includeAnswer,
      max_results: options.maxResults,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TavilySearchResponse;
  return formatTavilyResults(data, 'Tavily');
}

/**
 * Search using Brave Search API
 */
async function searchBrave(
  query: string,
  apiKey: string,
  options: { maxResults: number }
): Promise<string> {
  const params = new URLSearchParams({
    q: query,
    count: String(options.maxResults),
  });

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Brave Search API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as BraveSearchResponse;
  return formatBraveResults(data, 'Brave Search');
}

/**
 * Search using SerpAPI
 */
async function searchSerpAPI(
  query: string,
  apiKey: string,
  options: { maxResults: number }
): Promise<string> {
  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    num: String(options.maxResults),
  });

  const response = await fetch(`https://serpapi.com/search?${params}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SerpAPI error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as SerpAPIResponse;
  return formatSerpAPIResults(data, 'SerpAPI');
}

/**
 * Extract content using Tavily Extract API
 */
async function extractTavily(urls: string[], apiKey: string): Promise<string> {
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      urls,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily Extract API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TavilyExtractResponse;
  return formatExtractResults(data);
}

/**
 * Format Tavily search results
 */
function formatTavilyResults(data: TavilySearchResponse, provider: string): string {
  const lines: string[] = [`[WebSearch via ${provider}]`, ''];

  if (data.answer) {
    lines.push('Summary:', data.answer, '');
  }

  if (!data.results || data.results.length === 0) {
    lines.push('No results found.');
    return lines.join('\n');
  }

  lines.push(`Results for "${data.query}":`);
  lines.push('');

  for (const result of data.results) {
    lines.push(`**${result.title}**`);
    lines.push(result.url);
    if (result.content) {
      const snippet = result.content.length > 300
        ? result.content.slice(0, 300) + '...'
        : result.content;
      lines.push(snippet);
    }
    if (result.published_date) {
      lines.push(`Published: ${result.published_date}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format Brave search results
 */
function formatBraveResults(data: BraveSearchResponse, provider: string): string {
  const lines: string[] = [`[WebSearch via ${provider}]`, ''];

  const results = data.web?.results || [];
  if (results.length === 0) {
    lines.push('No results found.');
    return lines.join('\n');
  }

  for (const result of results) {
    lines.push(`**${result.title}**`);
    lines.push(result.url);
    if (result.description) {
      lines.push(result.description);
    }
    if (result.profile?.name) {
      lines.push(`Source: ${result.profile.name}`);
    }
    if (result.publishedDate) {
      lines.push(`Published: ${result.publishedDate}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format SerpAPI results
 */
function formatSerpAPIResults(data: SerpAPIResponse, provider: string): string {
  const lines: string[] = [`[WebSearch via ${provider}]`, ''];

  const results = data.organic_results || [];
  if (results.length === 0) {
    lines.push('No results found.');
    return lines.join('\n');
  }

  for (const result of results) {
    lines.push(`**${result.title}**`);
    lines.push(result.link);
    if (result.snippet) {
      lines.push(result.snippet);
    }
    if (result.source) {
      lines.push(`Source: ${result.source}`);
    }
    if (result.date) {
      lines.push(`Date: ${result.date}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format Tavily extract results
 */
function formatExtractResults(data: TavilyExtractResponse): string {
  const lines: string[] = ['[WebExtract via Tavily]', ''];

  if (!data.results || data.results.length === 0) {
    lines.push('No content extracted.');
    return lines.join('\n');
  }

  for (const result of data.results) {
    lines.push(`**${result.url}**`);
    lines.push('');
    if (result.raw_content) {
      // Truncate very long content
      const content = result.raw_content.length > 5000
        ? result.raw_content.slice(0, 5000) + '\n\n[Content truncated...]'
        : result.raw_content;
      lines.push(content);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// Export types for testing
export type { SearchProvider, TavilySearchResponse, BraveSearchResponse, SerpAPIResponse };
