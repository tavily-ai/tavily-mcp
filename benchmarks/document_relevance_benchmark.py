"""
Document Relevance Benchmark for Information Density

This benchmark evaluates search engines on document relevance,
measuring how efficiently they return relevant information.
"""
import json
import time
from datetime import datetime
from typing import Dict, List, Any
from tqdm import tqdm

from tavily_client import TavilyBenchmarkClient
from utils import count_tokens, format_search_results, calculate_information_density, save_results

# Document relevance queries covering various domains
RELEVANCE_QUERIES = [
    {
        "query": "climate change impacts on agriculture",
        "domain": "environment",
        "expected_topics": ["climate change", "agriculture", "crops", "farming"]
    },
    {
        "query": "machine learning algorithms for image recognition",
        "domain": "technology",
        "expected_topics": ["machine learning", "neural networks", "computer vision", "image classification"]
    },
    {
        "query": "benefits of mediterranean diet",
        "domain": "health",
        "expected_topics": ["mediterranean diet", "health benefits", "nutrition", "heart health"]
    },
    {
        "query": "renewable energy sources comparison",
        "domain": "energy",
        "expected_topics": ["solar", "wind", "renewable energy", "sustainability"]
    },
    {
        "query": "effective remote work strategies",
        "domain": "business",
        "expected_topics": ["remote work", "productivity", "communication", "work from home"]
    },
    {
        "query": "quantum computing applications",
        "domain": "technology",
        "expected_topics": ["quantum computing", "algorithms", "cryptography", "applications"]
    },
    {
        "query": "ancient Egyptian civilization",
        "domain": "history",
        "expected_topics": ["Egypt", "pharaohs", "pyramids", "ancient civilization"]
    },
    {
        "query": "cryptocurrency market trends 2024",
        "domain": "finance",
        "expected_topics": ["cryptocurrency", "bitcoin", "market", "blockchain"]
    },
    {
        "query": "artificial intelligence ethics",
        "domain": "technology",
        "expected_topics": ["AI", "ethics", "bias", "responsible AI"]
    },
    {
        "query": "sustainable urban planning",
        "domain": "urban_development",
        "expected_topics": ["urban planning", "sustainability", "green cities", "infrastructure"]
    },
    {
        "query": "deep learning frameworks comparison",
        "domain": "technology",
        "expected_topics": ["TensorFlow", "PyTorch", "deep learning", "frameworks"]
    },
    {
        "query": "electric vehicle battery technology",
        "domain": "automotive",
        "expected_topics": ["electric vehicles", "battery", "lithium-ion", "EV technology"]
    },
    {
        "query": "genomics and personalized medicine",
        "domain": "healthcare",
        "expected_topics": ["genomics", "personalized medicine", "DNA", "genetics"]
    },
    {
        "query": "space exploration missions 2024",
        "domain": "science",
        "expected_topics": ["space", "NASA", "missions", "exploration"]
    },
    {
        "query": "cybersecurity best practices for businesses",
        "domain": "security",
        "expected_topics": ["cybersecurity", "data protection", "security", "threat prevention"]
    }
]

class DocumentRelevanceBenchmark:
    """Run document relevance benchmark on search providers."""
    
    def __init__(self):
        self.tavily_client = TavilyBenchmarkClient()
        self.results = {
            "benchmark": "Document Relevance",
            "timestamp": datetime.now().isoformat(),
            "providers": {}
        }
    
    def calculate_relevance_score(self, content: str, expected_topics: List[str]) -> float:
        """
        Calculate simple relevance score based on topic coverage.
        Returns value between 0 and 1.
        """
        content_lower = content.lower()
        matches = sum(1 for topic in expected_topics if topic.lower() in content_lower)
        return matches / len(expected_topics) if expected_topics else 0.0
    
    def run_tavily(self, search_depth: str = "basic", max_results: int = 5) -> Dict[str, Any]:
        """Run benchmark on Tavily."""
        print(f"\n{'='*60}")
        print(f"Running Document Relevance Benchmark on Tavily (depth={search_depth})")
        print(f"{'='*60}\n")
        
        provider_results = {
            "provider": "Tavily",
            "search_depth": search_depth,
            "max_results": max_results,
            "queries": [],
            "total_tokens": 0,
            "total_queries": len(RELEVANCE_QUERIES),
            "avg_tokens_per_query": 0,
            "avg_relevance_score": 0,
            "avg_information_density": 0
        }
        
        total_tokens = 0
        total_relevance = 0
        total_density = 0
        
        for query_data in tqdm(RELEVANCE_QUERIES, desc="Processing queries"):
            query = query_data["query"]
            expected_topics = query_data["expected_topics"]
            
            try:
                # Call Tavily API
                start_time = time.time()
                response = self.tavily_client.search(
                    query=query,
                    search_depth=search_depth,
                    max_results=max_results
                )
                latency = time.time() - start_time
                
                # Extract results
                results = response.get("results", [])
                answer = response.get("answer", "")
                
                # Format content for analysis
                content = answer if answer else format_search_results(results)
                
                # Calculate metrics
                tokens = count_tokens(content)
                relevance_score = self.calculate_relevance_score(content, expected_topics)
                density = calculate_information_density(content, relevance_score)
                
                total_tokens += tokens
                total_relevance += relevance_score
                total_density += density
                
                query_result = {
                    "query": query,
                    "domain": query_data["domain"],
                    "expected_topics": expected_topics,
                    "answer": answer,
                    "num_results": len(results),
                    "tokens": tokens,
                    "relevance_score": relevance_score,
                    "information_density": density,
                    "latency_seconds": latency,
                    "topics_covered": [topic for topic in expected_topics if topic.lower() in content.lower()]
                }
                
                provider_results["queries"].append(query_result)
                
                # Rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                print(f"Error processing query '{query}': {e}")
                provider_results["queries"].append({
                    "query": query,
                    "error": str(e)
                })
        
        # Calculate averages
        successful_queries = [q for q in provider_results["queries"] if "error" not in q]
        num_successful = len(successful_queries)
        
        if num_successful > 0:
            provider_results["total_tokens"] = total_tokens
            provider_results["avg_tokens_per_query"] = total_tokens / num_successful
            provider_results["avg_relevance_score"] = total_relevance / num_successful
            provider_results["avg_information_density"] = total_density / num_successful
        
        return provider_results
    
    def run_all(self):
        """Run benchmark on all providers with default parameters."""
        print("\n" + "="*60)
        print("Document Relevance Information Density Benchmark")
        print("="*60)
        
        # Run Tavily with basic depth (default)
        tavily_basic = self.run_tavily(search_depth="basic", max_results=5)
        self.results["providers"]["tavily_basic"] = tavily_basic
        
        # Run Tavily with advanced depth for comparison
        tavily_advanced = self.run_tavily(search_depth="advanced", max_results=5)
        self.results["providers"]["tavily_advanced"] = tavily_advanced
        
        # Print summary
        self.print_summary()
        
        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"document_relevance_results_{timestamp}.json"
        save_results(self.results, filename)
        
        return self.results
    
    def print_summary(self):
        """Print benchmark summary."""
        print("\n" + "="*60)
        print("BENCHMARK SUMMARY")
        print("="*60 + "\n")
        
        for provider_name, provider_data in self.results["providers"].items():
            print(f"\n{provider_name.upper()}")
            print("-" * 40)
            print(f"Total Queries: {provider_data['total_queries']}")
            print(f"Total Tokens: {provider_data['total_tokens']:,}")
            print(f"Avg Tokens/Query: {provider_data['avg_tokens_per_query']:.2f}")
            print(f"Avg Relevance Score: {provider_data['avg_relevance_score']:.4f}")
            print(f"Avg Information Density: {provider_data['avg_information_density']:.4f}")
            
            # Calculate success rate
            successful = sum(1 for q in provider_data['queries'] if 'error' not in q)
            success_rate = (successful / provider_data['total_queries']) * 100
            print(f"Success Rate: {success_rate:.1f}%")
        
        print("\n" + "="*60 + "\n")

def main():
    """Main entry point."""
    benchmark = DocumentRelevanceBenchmark()
    results = benchmark.run_all()
    return results

if __name__ == "__main__":
    main()
