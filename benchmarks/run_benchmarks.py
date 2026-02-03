"""
Main script to run all benchmarks and generate comprehensive reports.
"""
import os
import sys
import json
from datetime import datetime
from typing import Dict, Any

from simpleqa_benchmark import SimpleQABenchmark
from document_relevance_benchmark import DocumentRelevanceBenchmark
from utils import save_results

def generate_markdown_report(simpleqa_results: Dict[str, Any], doc_rel_results: Dict[str, Any]) -> str:
    """Generate a markdown report from benchmark results."""
    
    report = []
    report.append("# Tavily Information Density Benchmark Results\n")
    report.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    report.append("---\n")
    
    # Executive Summary
    report.append("## Executive Summary\n")
    report.append("This report presents benchmark results measuring information density and token efficiency ")
    report.append("for Tavily search API across two key benchmarks: SimpleQA and Document Relevance.\n\n")
    
    # SimpleQA Results
    report.append("## SimpleQA Benchmark\n")
    report.append("**Purpose:** Evaluate factual question answering efficiency\n\n")
    
    report.append("### Results\n")
    report.append("| Configuration | Total Questions | Total Tokens | Avg Tokens/Question | Avg Info Density | Success Rate |\n")
    report.append("|--------------|----------------|--------------|---------------------|------------------|-------------|\n")
    
    for provider_name, provider_data in simpleqa_results.get("providers", {}).items():
        total_q = provider_data.get("total_questions", 0)
        total_t = provider_data.get("total_tokens", 0)
        avg_t = provider_data.get("avg_tokens_per_question", 0)
        avg_d = provider_data.get("avg_information_density", 0)
        successful = sum(1 for q in provider_data.get('questions', []) if 'error' not in q)
        success_rate = (successful / total_q * 100) if total_q > 0 else 0
        
        report.append(f"| {provider_name} | {total_q} | {total_t:,} | {avg_t:.2f} | {avg_d:.4f} | {success_rate:.1f}% |\n")
    
    report.append("\n")
    
    # Document Relevance Results
    report.append("## Document Relevance Benchmark\n")
    report.append("**Purpose:** Evaluate search result relevance and token efficiency\n\n")
    
    report.append("### Results\n")
    report.append("| Configuration | Total Queries | Total Tokens | Avg Tokens/Query | Avg Relevance | Avg Info Density | Success Rate |\n")
    report.append("|--------------|--------------|--------------|------------------|---------------|------------------|-------------|\n")
    
    for provider_name, provider_data in doc_rel_results.get("providers", {}).items():
        total_q = provider_data.get("total_queries", 0)
        total_t = provider_data.get("total_tokens", 0)
        avg_t = provider_data.get("avg_tokens_per_query", 0)
        avg_r = provider_data.get("avg_relevance_score", 0)
        avg_d = provider_data.get("avg_information_density", 0)
        successful = sum(1 for q in provider_data.get('queries', []) if 'error' not in q)
        success_rate = (successful / total_q * 100) if total_q > 0 else 0
        
        report.append(f"| {provider_name} | {total_q} | {total_t:,} | {avg_t:.2f} | {avg_r:.4f} | {avg_d:.4f} | {success_rate:.1f}% |\n")
    
    report.append("\n")
    
    # Key Findings
    report.append("## Key Findings\n\n")
    
    # Compare basic vs advanced for SimpleQA
    if "tavily_basic" in simpleqa_results.get("providers", {}) and "tavily_advanced" in simpleqa_results.get("providers", {}):
        basic = simpleqa_results["providers"]["tavily_basic"]
        advanced = simpleqa_results["providers"]["tavily_advanced"]
        
        report.append("### SimpleQA: Basic vs Advanced\n")
        report.append(f"- **Basic mode** uses {basic.get('avg_tokens_per_question', 0):.2f} tokens/question on average\n")
        report.append(f"- **Advanced mode** uses {advanced.get('avg_tokens_per_question', 0):.2f} tokens/question on average\n")
        
        if basic.get('avg_tokens_per_question', 0) > 0:
            savings = ((advanced.get('avg_tokens_per_question', 0) - basic.get('avg_tokens_per_question', 0)) / 
                      basic.get('avg_tokens_per_question', 1)) * 100
            if savings > 0:
                report.append(f"- Advanced mode uses {savings:.1f}% more tokens for potentially deeper answers\n")
            else:
                report.append(f"- Basic mode uses {abs(savings):.1f}% more tokens\n")
        report.append("\n")
    
    # Compare basic vs advanced for Document Relevance
    if "tavily_basic" in doc_rel_results.get("providers", {}) and "tavily_advanced" in doc_rel_results.get("providers", {}):
        basic = doc_rel_results["providers"]["tavily_basic"]
        advanced = doc_rel_results["providers"]["tavily_advanced"]
        
        report.append("### Document Relevance: Basic vs Advanced\n")
        report.append(f"- **Basic mode** achieves {basic.get('avg_relevance_score', 0):.4f} relevance score\n")
        report.append(f"- **Advanced mode** achieves {advanced.get('avg_relevance_score', 0):.4f} relevance score\n")
        report.append(f"- **Basic mode** information density: {basic.get('avg_information_density', 0):.4f}\n")
        report.append(f"- **Advanced mode** information density: {advanced.get('avg_information_density', 0):.4f}\n")
        report.append("\n")
    
    # Methodology
    report.append("## Methodology\n\n")
    report.append("### SimpleQA Benchmark\n")
    report.append("- **Dataset:** 20 factual questions across multiple domains\n")
    report.append("- **Metrics:** Token count, information density (relevance per token)\n")
    report.append("- **Configuration:** Default parameters, max_results=5\n\n")
    
    report.append("### Document Relevance Benchmark\n")
    report.append("- **Dataset:** 15 queries across various domains\n")
    report.append("- **Metrics:** Token count, relevance score, information density\n")
    report.append("- **Configuration:** Default parameters, max_results=5\n\n")
    
    report.append("### Information Density Calculation\n")
    report.append("Information Density = (Relevance Score / Token Count) × 1000\n\n")
    report.append("Higher values indicate more relevant information per token used.\n\n")
    
    # Footer
    report.append("---\n")
    report.append("*Generated by Tavily Benchmark Suite*\n")
    
    return "".join(report)

def main():
    """Run all benchmarks and generate reports."""
    print("\n" + "="*70)
    print(" "*15 + "TAVILY INFORMATION DENSITY BENCHMARKS")
    print("="*70 + "\n")
    
    # Check for API key
    if not os.getenv("TAVILY_API_KEY"):
        print("ERROR: TAVILY_API_KEY environment variable not set!")
        print("Please set it in your .env file or environment.")
        sys.exit(1)
    
    # Run SimpleQA Benchmark
    print("\n[1/2] Running SimpleQA Benchmark...")
    simpleqa_bench = SimpleQABenchmark()
    simpleqa_results = simpleqa_bench.run_all()
    
    # Run Document Relevance Benchmark
    print("\n[2/2] Running Document Relevance Benchmark...")
    doc_rel_bench = DocumentRelevanceBenchmark()
    doc_rel_results = doc_rel_bench.run_all()
    
    # Generate combined results
    combined_results = {
        "timestamp": datetime.now().isoformat(),
        "benchmarks": {
            "simpleqa": simpleqa_results,
            "document_relevance": doc_rel_results
        }
    }
    
    # Save combined results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    save_results(combined_results, f"combined_results_{timestamp}.json")
    
    # Generate markdown report
    report = generate_markdown_report(simpleqa_results, doc_rel_results)
    
    # Save markdown report
    os.makedirs("results", exist_ok=True)
    report_path = f"results/benchmark_report_{timestamp}.md"
    with open(report_path, 'w') as f:
        f.write(report)
    print(f"\nMarkdown report saved to: {report_path}")
    
    # Print report to console
    print("\n" + "="*70)
    print(report)
    print("="*70 + "\n")
    
    print("✅ All benchmarks completed successfully!")
    print(f"📊 Results saved in the 'results/' directory")
    
    return combined_results

if __name__ == "__main__":
    main()
