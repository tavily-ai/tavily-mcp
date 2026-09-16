export interface TavilyResponse {
  // Response structure from Tavily API
  query: string;
  request_id?: string;
  follow_up_questions?: Array<string>;
  answer?: string;
  images?: Array<string | {
    url: string;
    description?: string;
  }>;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
    raw_content?: string;
    favicon?: string;
    id: string;
  }>;
}

export interface TavilyExtractResponse {
  request_id?: string;
  results: Array<{
    url: string;
    title?: string;
    raw_content: string;
    images?: string[];
    favicon?: string;
  }>;
  failed_results: Array<{ url: string; error: string }>;
  response_time: number;
}

export function formatResults(response: TavilyResponse | TavilyExtractResponse): string {
  // Format API response into human-readable text
  const output: string[] = [];

  // Preserve the upstream ID for request-scoped feedback.
  if (response.request_id) {
    output.push(`Request ID: ${response.request_id}`);
  }

  // Include answer if available
  if ('answer' in response && response.answer) {
    output.push(`Answer: ${response.answer}`);
  }

  // Format detailed search results
  output.push('Detailed Results:');
  response.results.forEach(result => {
    output.push('');
    if (result.title) {
      output.push(`Title: ${result.title}`);
    }
    if ('id' in result && result.id) {
      output.push(`ID: ${result.id}`);
    }
    output.push(`URL: ${result.url}`);
    if ('content' in result && result.content != null) {
      output.push(`Content: ${result.content}`);
    }
    if (result.raw_content) {
      output.push(`Raw Content: ${result.raw_content}`);
    }
    if (result.favicon) {
      output.push(`Favicon: ${result.favicon}`);
    }
  });

    // Add images section if available
    if ('images' in response && response.images && response.images.length > 0) {
      output.push('\nImages:');
      response.images.forEach((image, index) => {
        if (typeof image === 'string') {
          output.push(`\n[${index + 1}] URL: ${image}`);
        } else {
          output.push(`\n[${index + 1}] URL: ${image.url}`);
          if (image.description) {
            output.push(`   Description: ${image.description}`);
          }
        }
      });
    }

  return output.join('\n');
}
