"""
Quick test to verify benchmark setup without running full benchmarks.
"""
import os
import sys
from dotenv import load_dotenv

def test_dependencies():
    """Test that all dependencies are available."""
    print("Testing dependencies...")
    
    try:
        import requests
        print("✓ requests")
    except ImportError:
        print("✗ requests not found")
        return False
    
    try:
        import tiktoken
        print("✓ tiktoken")
    except ImportError:
        print("✗ tiktoken not found")
        return False
    
    try:
        from dotenv import load_dotenv
        print("✓ python-dotenv")
    except ImportError:
        print("✗ python-dotenv not found")
        return False
    
    try:
        import tqdm
        print("✓ tqdm")
    except ImportError:
        print("✗ tqdm not found")
        return False
    
    try:
        import pandas
        print("✓ pandas")
    except ImportError:
        print("✗ pandas not found")
        return False
    
    try:
        import numpy
        print("✓ numpy")
    except ImportError:
        print("✗ numpy not found")
        return False
    
    return True

def test_api_key():
    """Test that API key is available."""
    print("\nTesting API key...")
    
    load_dotenv()
    api_key = os.getenv("TAVILY_API_KEY")
    
    if not api_key:
        print("✗ TAVILY_API_KEY not found in environment")
        print("\nPlease set your API key:")
        print("  1. Copy .env.example to .env")
        print("  2. Add your TAVILY_API_KEY to the .env file")
        print("  OR")
        print("  export TAVILY_API_KEY='your_key_here'")
        return False
    
    if api_key == "your_tavily_api_key_here":
        print("✗ TAVILY_API_KEY still has placeholder value")
        print("  Please update the .env file with your actual API key")
        return False
    
    print(f"✓ API key found (length: {len(api_key)})")
    return True

def test_modules():
    """Test that benchmark modules can be imported."""
    print("\nTesting benchmark modules...")
    
    try:
        from utils import count_tokens
        print("✓ utils module")
    except ImportError as e:
        print(f"✗ utils module: {e}")
        return False
    
    try:
        from tavily_client import TavilyBenchmarkClient
        print("✓ tavily_client module")
    except ImportError as e:
        print(f"✗ tavily_client module: {e}")
        return False
    
    return True

def test_token_counting():
    """Test token counting functionality."""
    print("\nTesting token counting...")
    
    try:
        from utils import count_tokens
        
        test_text = "Hello, world! This is a test."
        token_count = count_tokens(test_text)
        
        print(f"✓ Token counting works")
        print(f"  Example: '{test_text}' = {token_count} tokens")
        return True
    except Exception as e:
        print(f"✗ Token counting failed: {e}")
        return False

def main():
    """Run all tests."""
    print("="*60)
    print("Tavily Benchmark Setup Test")
    print("="*60 + "\n")
    
    all_passed = True
    
    # Test dependencies
    if not test_dependencies():
        print("\n⚠ Some dependencies are missing. Install them with:")
        print("  pip install -r requirements.txt")
        all_passed = False
    
    # Test API key
    if not test_api_key():
        all_passed = False
    
    # Test modules
    if not test_modules():
        all_passed = False
    
    # Test token counting
    if not test_token_counting():
        all_passed = False
    
    # Summary
    print("\n" + "="*60)
    if all_passed:
        print("✅ All tests passed! You're ready to run benchmarks.")
        print("\nRun benchmarks with:")
        print("  python run_benchmarks.py")
    else:
        print("❌ Some tests failed. Please fix the issues above.")
    print("="*60 + "\n")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
