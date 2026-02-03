# Tavily Information Density Benchmarks

This directory contains benchmarks to measure and compare token usage and information density across different search providers.

## Benchmarks

### 1. SimpleQA Benchmark
Evaluates search performance on the SimpleQA dataset, measuring:
- Token usage per query
- Information density (relevant info per token)
- Answer accuracy

### 2. Document Relevance Benchmark
Measures how well search results match query intent:
- Token count of returned content
- Relevance scores
- Information density metrics

## Setup

```bash
pip install -r requirements.txt
```

## Environment Variables

Create a `.env` file in the benchmarks directory:

```bash
TAVILY_API_KEY=your_tavily_key
OPENAI_API_KEY=your_openai_key  # Optional, for competitor comparison
PERPLEXITY_API_KEY=your_perplexity_key  # Optional, for competitor comparison
```

## Running Benchmarks

```bash
# Run all benchmarks
python run_benchmarks.py

# Run specific benchmark
python simpleqa_benchmark.py
python document_relevance_benchmark.py
```

## Results

Results are saved in the `results/` directory with timestamps.
