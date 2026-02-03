"""Utility functions for benchmarking."""
import tiktoken
import json
from typing import Dict, List, Any
import os
from dotenv import load_dotenv

load_dotenv()

def count_tokens(text: str, model: str = "gpt-4") -> int:
    """Count tokens in text using tiktoken."""
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base")
    return len(encoding.encode(text))

def format_search_results(results: List[Dict[str, Any]]) -> str:
    """Format search results into a readable string."""
    output = []
    for i, result in enumerate(results, 1):
        output.append(f"\n[{i}] {result.get('title', 'No title')}")
        output.append(f"URL: {result.get('url', 'No URL')}")
        output.append(f"Content: {result.get('content', 'No content')}")
    return "\n".join(output)

def calculate_information_density(content: str, relevance_score: float = 1.0) -> float:
    """
    Calculate information density as relevance per token.
    Higher is better - more relevant information per token.
    """
    tokens = count_tokens(content)
    if tokens == 0:
        return 0.0
    return relevance_score / tokens * 1000  # Scale to make numbers readable

def save_results(results: Dict[str, Any], filename: str):
    """Save benchmark results to JSON file."""
    os.makedirs("results", exist_ok=True)
    filepath = os.path.join("results", filename)
    with open(filepath, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to {filepath}")

def load_results(filename: str) -> Dict[str, Any]:
    """Load benchmark results from JSON file."""
    filepath = os.path.join("results", filename)
    if not os.path.exists(filepath):
        return {}
    with open(filepath, 'r') as f:
        return json.load(f)
