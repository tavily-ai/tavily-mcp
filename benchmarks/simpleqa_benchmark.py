"""
SimpleQA Benchmark for Information Density

This benchmark evaluates search engines on factual question answering,
measuring token efficiency and information density.
"""
import json
import time
from datetime import datetime
from typing import Dict, List, Any
from tqdm import tqdm

from tavily_client import TavilyBenchmarkClient
from utils import count_tokens, format_search_results, calculate_information_density, save_results

# Sample questions from SimpleQA-style dataset
# In production, this would load from the official SimpleQA dataset
SAMPLE_QUESTIONS = [
    {
        "question": "What is the capital of France?",
        "expected_answer": "Paris",
        "category": "geography"
    },
    {
        "question": "Who wrote the novel '1984'?",
        "expected_answer": "George Orwell",
        "category": "literature"
    },
    {
        "question": "What is the speed of light in vacuum?",
        "expected_answer": "299,792,458 meters per second",
        "category": "science"
    },
    {
        "question": "When did World War II end?",
        "expected_answer": "1945",
        "category": "history"
    },
    {
        "question": "What is the largest planet in our solar system?",
        "expected_answer": "Jupiter",
        "category": "science"
    },
    {
        "question": "Who painted the Mona Lisa?",
        "expected_answer": "Leonardo da Vinci",
        "category": "art"
    },
    {
        "question": "What is the chemical formula for water?",
        "expected_answer": "H2O",
        "category": "science"
    },
    {
        "question": "What is the tallest mountain in the world?",
        "expected_answer": "Mount Everest",
        "category": "geography"
    },
    {
        "question": "Who was the first person to walk on the moon?",
        "expected_answer": "Neil Armstrong",
        "category": "history"
    },
    {
        "question": "What programming language was created by Guido van Rossum?",
        "expected_answer": "Python",
        "category": "technology"
    },
    {
        "question": "What is the smallest prime number?",
        "expected_answer": "2",
        "category": "mathematics"
    },
    {
        "question": "In which year did the Titanic sink?",
        "expected_answer": "1912",
        "category": "history"
    },
    {
        "question": "What is the longest river in the world?",
        "expected_answer": "Nile River",
        "category": "geography"
    },
    {
        "question": "Who developed the theory of relativity?",
        "expected_answer": "Albert Einstein",
        "category": "science"
    },
    {
        "question": "What is the most spoken language in the world?",
        "expected_answer": "Mandarin Chinese",
        "category": "linguistics"
    },
    {
        "question": "What is the boiling point of water at sea level in Celsius?",
        "expected_answer": "100 degrees",
        "category": "science"
    },
    {
        "question": "Who is the author of Harry Potter series?",
        "expected_answer": "J.K. Rowling",
        "category": "literature"
    },
    {
        "question": "What is the smallest country in the world?",
        "expected_answer": "Vatican City",
        "category": "geography"
    },
    {
        "question": "What year was the iPhone first released?",
        "expected_answer": "2007",
        "category": "technology"
    },
    {
        "question": "What is the main ingredient in guacamole?",
        "expected_answer": "Avocado",
        "category": "food"
    }
]

class SimpleQABenchmark:
    """Run SimpleQA benchmark on search providers."""
    
    def __init__(self):
        self.tavily_client = TavilyBenchmarkClient()
        self.results = {
            "benchmark": "SimpleQA",
            "timestamp": datetime.now().isoformat(),
            "providers": {}
        }
    
    def run_tavily(self, search_depth: str = "basic", max_results: int = 5) -> Dict[str, Any]:
        """Run benchmark on Tavily."""
        print(f"\n{'='*60}")
        print(f"Running SimpleQA Benchmark on Tavily (depth={search_depth})")
        print(f"{'='*60}\n")
        
        provider_results = {
            "provider": "Tavily",
            "search_depth": search_depth,
            "max_results": max_results,
            "questions": [],
            "total_tokens": 0,
            "total_questions": len(SAMPLE_QUESTIONS),
            "avg_tokens_per_question": 0,
            "avg_information_density": 0
        }
        
        total_tokens = 0
        total_density = 0
        
        for q_data in tqdm(SAMPLE_QUESTIONS, desc="Processing questions"):
            question = q_data["question"]
            
            try:
                # Call Tavily API
                start_time = time.time()
                response = self.tavily_client.search(
                    query=question,
                    search_depth=search_depth,
                    max_results=max_results
                )
                latency = time.time() - start_time
                
                # Extract results
                results = response.get("results", [])
                answer = response.get("answer", "")
                
                # Format content for token counting
                content = answer if answer else format_search_results(results)
                
                # Calculate metrics
                tokens = count_tokens(content)
                density = calculate_information_density(content, relevance_score=1.0)
                
                total_tokens += tokens
                total_density += density
                
                question_result = {
                    "question": question,
                    "category": q_data["category"],
                    "expected_answer": q_data["expected_answer"],
                    "answer": answer,
                    "num_results": len(results),
                    "tokens": tokens,
                    "information_density": density,
                    "latency_seconds": latency
                }
                
                provider_results["questions"].append(question_result)
                
                # Rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                print(f"Error processing question '{question}': {e}")
                provider_results["questions"].append({
                    "question": question,
                    "error": str(e)
                })
        
        # Calculate averages
        provider_results["total_tokens"] = total_tokens
        provider_results["avg_tokens_per_question"] = total_tokens / len(SAMPLE_QUESTIONS)
        provider_results["avg_information_density"] = total_density / len(SAMPLE_QUESTIONS)
        
        return provider_results
    
    def run_all(self):
        """Run benchmark on all providers with default parameters."""
        print("\n" + "="*60)
        print("SimpleQA Information Density Benchmark")
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
        filename = f"simpleqa_results_{timestamp}.json"
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
            print(f"Total Questions: {provider_data['total_questions']}")
            print(f"Total Tokens: {provider_data['total_tokens']:,}")
            print(f"Avg Tokens/Question: {provider_data['avg_tokens_per_question']:.2f}")
            print(f"Avg Information Density: {provider_data['avg_information_density']:.4f}")
            
            # Calculate success rate (questions without errors)
            successful = sum(1 for q in provider_data['questions'] if 'error' not in q)
            success_rate = (successful / provider_data['total_questions']) * 100
            print(f"Success Rate: {success_rate:.1f}%")
        
        print("\n" + "="*60 + "\n")

def main():
    """Main entry point."""
    benchmark = SimpleQABenchmark()
    results = benchmark.run_all()
    return results

if __name__ == "__main__":
    main()
