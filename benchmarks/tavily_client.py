"""Tavily API client for benchmarks."""
import requests
import os
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv

load_dotenv()

class TavilyBenchmarkClient:
    """Client for calling Tavily API with benchmark tracking."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("TAVILY_API_KEY")
        if not self.api_key:
            raise ValueError("TAVILY_API_KEY not found in environment")
        self.base_url = "https://api.tavily.com"
    
    def search(
        self,
        query: str,
        search_depth: str = "basic",
        max_results: int = 5,
        include_raw_content: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform a search using Tavily API.
        
        Args:
            query: Search query
            search_depth: 'basic' or 'advanced'
            max_results: Number of results to return
            include_raw_content: Whether to include full page content
            **kwargs: Additional parameters
        
        Returns:
            API response dict
        """
        url = f"{self.base_url}/search"
        
        payload = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": search_depth,
            "max_results": max_results,
            "include_raw_content": include_raw_content,
            **kwargs
        }
        
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        return response.json()
    
    def extract(self, urls: List[str], **kwargs) -> Dict[str, Any]:
        """
        Extract content from URLs using Tavily API.
        
        Args:
            urls: List of URLs to extract from
            **kwargs: Additional parameters
        
        Returns:
            API response dict
        """
        url = f"{self.base_url}/extract"
        
        payload = {
            "api_key": self.api_key,
            "urls": urls,
            **kwargs
        }
        
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        return response.json()
