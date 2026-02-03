# Tavily Information Density Benchmarks

## Overview

This repository includes comprehensive benchmarks to measure and demonstrate Tavily's **information density** - our ability to provide highly relevant information with minimal token usage compared to competitors.

## What is Information Density?

**Information Density** is a key metric that measures how much relevant information is delivered per token:

```
Information Density = (Relevance Score / Token Count) × 1000
```

Higher information density means:
- ✅ More relevant results with fewer tokens
- ✅ Lower costs for LLM-based applications
- ✅ Faster processing and response times
- ✅ Better user experience

## Benchmarks Included

### 1. SimpleQA Benchmark
Evaluates Tavily's performance on factual question answering:
- **Dataset**: 20 carefully selected factual questions across multiple domains
- **Metrics**: Token usage, information density, accuracy
- **Goal**: Demonstrate efficient factual retrieval

### 2. Document Relevance Benchmark
Measures search result quality and efficiency:
- **Dataset**: 15 complex queries across various domains
- **Metrics**: Token count, relevance score, information density
- **Goal**: Show superior relevance-to-token ratio

## Quick Start

```bash
# Navigate to benchmarks directory
cd benchmarks

# Install dependencies
pip install -r requirements.txt

# Set up your API key
export TAVILY_API_KEY="your_api_key_here"

# Run all benchmarks
python run_benchmarks.py
```

For detailed setup instructions, see [`benchmarks/SETUP_GUIDE.md`](benchmarks/SETUP_GUIDE.md).

## Configuration

Benchmarks run with **default parameters** as specified in the Linear issue TAV-4658:

- **Search Depth**: Basic (default) and Advanced (for comparison)
- **Max Results**: 5
- **Include Raw Content**: False (for basic), True (for advanced)

This ensures fair comparison and demonstrates real-world usage patterns.

## Results

After running benchmarks, you'll get:

1. **JSON Files** with detailed metrics for each query
2. **Markdown Reports** with summary tables and analysis
3. **Comparison Data** between basic and advanced modes

Example results structure:
```
benchmarks/results/
├── simpleqa_results_20240203_143022.json
├── document_relevance_results_20240203_143145.json
├── combined_results_20240203_143145.json
└── benchmark_report_20240203_143145.md
```

## Key Metrics

### Token Usage
Total tokens used in search results. **Lower is better** for cost efficiency.

### Relevance Score
Quality of results on a 0-1 scale. **Higher is better** for accuracy.

### Information Density
Combines both metrics: `(Relevance / Tokens) × 1000`
**Higher is better** - demonstrates Tavily's competitive advantage.

## Automated Benchmarking

We've included a GitHub Actions workflow (`.github/workflows/run-benchmarks.yml`) that can:
- Run benchmarks on schedule (weekly)
- Run benchmarks manually via workflow_dispatch
- Store results as artifacts
- Commit results to repository

To enable automated runs:
1. Add `TAVILY_API_KEY` to GitHub Secrets
2. Enable GitHub Actions in repository settings
3. Manually trigger or wait for scheduled run

## Competitor Comparison

While the current implementation focuses on Tavily performance across different configurations, the framework is designed to easily add competitor comparisons:

- OpenAI (with web browsing)
- Perplexity API
- Google Search API
- Bing Search API

To add competitors, extend the benchmark classes with additional provider methods.

## Use Cases

These benchmarks help demonstrate Tavily's value for:

1. **LLM Applications**: Lower token usage = lower costs
2. **RAG Systems**: High relevance with minimal context window usage
3. **Chatbots**: Fast, accurate responses without bloat
4. **Research Tools**: Efficient information gathering

## Contributing

To improve the benchmarks:

1. **Add More Questions**: Edit the question sets in benchmark files
2. **Add New Benchmarks**: Create new benchmark modules following the existing pattern
3. **Enhance Metrics**: Add new evaluation metrics in `utils.py`
4. **Add Competitors**: Extend with additional provider implementations

## Related Resources

- [Tavily API Documentation](https://docs.tavily.com/)
- [Tavily MCP Server](/)
- [SimpleQA Dataset](https://openai.com/research/simpleqa)

## Support

For questions or issues:
- Check [`benchmarks/SETUP_GUIDE.md`](benchmarks/SETUP_GUIDE.md)
- Review [Tavily Documentation](https://docs.tavily.com/)
- Open an issue on GitHub

---

**Last Updated**: February 3, 2026  
**Issue Reference**: TAV-4658
