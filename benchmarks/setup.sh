#!/bin/bash
# Setup script for benchmarks

echo "Setting up Tavily Information Density Benchmarks..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

echo "Python version: $(python3 --version)"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing requirements..."
pip install --upgrade pip
pip install -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo ""
    echo "Warning: .env file not found!"
    echo "Please copy .env.example to .env and add your API keys:"
    echo "  cp .env.example .env"
    echo "  # Then edit .env with your TAVILY_API_KEY"
    echo ""
fi

# Create results directory
mkdir -p results

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run benchmarks:"
echo "  1. Make sure you have set TAVILY_API_KEY in .env file"
echo "  2. Run: python run_benchmarks.py"
echo ""
