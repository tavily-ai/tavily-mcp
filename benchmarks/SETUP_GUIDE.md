# Tavily Information Density Benchmarks - Setup Guide

## Overview

This benchmark suite measures token usage and information density for Tavily search API, comparing different configurations to demonstrate efficiency in returning relevant information with minimal token usage.

## Prerequisites

1. **Python 3.8+** (Python 3.12.3 confirmed working)
2. **Tavily API Key** - Get one from [tavily.com](https://www.tavily.com/)
3. **pip** package manager

## Quick Start

### 1. Install Dependencies

```bash
cd benchmarks
pip install -r requirements.txt
```

### 2. Configure API Key

**Option A: Using .env file (Local Development)**

```bash
cp .env.example .env
# Edit .env and add your TAVILY_API_KEY
```

**Option B: Using Environment Variable**

```bash
export TAVILY_API_KEY="your_api_key_here"
```

**Option C: Cursor Cloud Agents (CI/CD)**

Add `TAVILY_API_KEY` as a secret in Cursor Dashboard:
- Go to Cursor Dashboard > Cloud Agents > Secrets
- Add secret: `TAVILY_API_KEY`
- Scope: User/Team and Repo scoped

### 3. Run Benchmarks

**Run all benchmarks:**
```bash
python run_benchmarks.py
```

**Run individual benchmarks:**
```bash
# SimpleQA benchmark
python simpleqa_benchmark.py

# Document Relevance benchmark
python document_relevance_benchmark.py
```

## Benchmark Details

### SimpleQA Benchmark
- **Purpose**: Evaluate factual question answering efficiency
- **Dataset**: 20 factual questions across multiple domains
- **Metrics**:
  - Total tokens used
  - Average tokens per question
  - Information density (relevance/token × 1000)
  - Success rate

### Document Relevance Benchmark
- **Purpose**: Evaluate search result relevance and efficiency
- **Dataset**: 15 queries across various domains
- **Metrics**:
  - Total tokens used
  - Average tokens per query
  - Relevance score (0-1 based on topic coverage)
  - Information density
  - Success rate

## Configuration Options

Both benchmarks test multiple configurations:

1. **Basic Mode** (default)
   - `search_depth: "basic"`
   - `max_results: 5`
   - Optimized for speed and token efficiency

2. **Advanced Mode**
   - `search_depth: "advanced"`
   - `max_results: 5`
   - More thorough search, potentially more tokens

## Output

### Results Directory Structure
```
results/
├── simpleqa_results_YYYYMMDD_HHMMSS.json
├── document_relevance_results_YYYYMMDD_HHMMSS.json
├── combined_results_YYYYMMDD_HHMMSS.json
└── benchmark_report_YYYYMMDD_HHMMSS.md
```

### Files Generated
- **Individual JSON files**: Detailed results for each benchmark
- **Combined JSON**: All results in one file
- **Markdown report**: Human-readable summary with tables

## Understanding the Metrics

### Token Count
Total number of tokens in the response content. Lower is better for efficiency.

### Information Density
Calculated as: `(Relevance Score / Token Count) × 1000`

This metric combines relevance and efficiency:
- Higher values = more relevant information per token
- Demonstrates Tavily's ability to provide quality results concisely

### Relevance Score
For Document Relevance benchmark, measures how well results cover expected topics (0-1 scale).

## Troubleshooting

### "TAVILY_API_KEY environment variable is required"
- Make sure you've set the API key in .env file or environment
- Check that .env file is in the benchmarks directory
- Verify the key is valid

### Rate Limiting
- Benchmarks include 0.5s delays between requests
- Adjust in the code if you experience rate limits

### Dependencies Not Found
```bash
pip install --upgrade -r requirements.txt
```

## Next Steps

After running benchmarks:
1. Review the generated markdown report
2. Compare basic vs advanced configurations
3. Use results to highlight information density advantages
4. Update GitHub repository with latest results

## Contributing

To add new benchmark queries or questions:
- Edit `SAMPLE_QUESTIONS` in `simpleqa_benchmark.py`
- Edit `RELEVANCE_QUERIES` in `document_relevance_benchmark.py`

## Support

For issues or questions:
- Check the main README.md
- Review Tavily documentation at [docs.tavily.com](https://docs.tavily.com/)
