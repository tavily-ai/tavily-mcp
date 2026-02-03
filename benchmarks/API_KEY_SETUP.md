# API Key Setup Instructions

## For Running Benchmarks with Cursor Cloud Agents

The benchmarks require a `TAVILY_API_KEY` to run. Here's how to set it up:

### Option 1: Cursor Dashboard Secrets (Recommended for CI/CD)

1. Go to **Cursor Dashboard** → **Cloud Agents** → **Secrets**
2. Click **Add Secret**
3. Set the following:
   - **Name**: `TAVILY_API_KEY`
   - **Value**: Your Tavily API key from [tavily.com](https://www.tavily.com/)
   - **Scope**: Choose appropriate scope (user/team and repo)
4. Save the secret

The secret will be automatically injected as an environment variable in Cloud Agent VMs.

### Option 2: Local Development (.env file)

If running benchmarks locally:

```bash
cd benchmarks
cp .env.example .env
# Edit .env and add your TAVILY_API_KEY
```

Then run:
```bash
python run_benchmarks.py
```

### Option 3: Direct Environment Variable

```bash
export TAVILY_API_KEY="your_api_key_here"
cd benchmarks
python run_benchmarks.py
```

## Get a Tavily API Key

1. Visit [tavily.com](https://www.tavily.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Generate a new API key
5. Copy and use in one of the methods above

## Verify Setup

Test your setup without running full benchmarks:

```bash
cd benchmarks
python test_setup.py
```

This will verify:
- ✓ All dependencies are installed
- ✓ API key is properly configured
- ✓ Benchmark modules can be loaded
- ✓ Token counting works

## Troubleshooting

### "TAVILY_API_KEY not found"
- Check that you've added the secret in Cursor Dashboard
- Verify the secret name is exactly `TAVILY_API_KEY`
- For local runs, ensure .env file exists in benchmarks/ directory

### "Invalid API key"
- Verify your API key is correct
- Check that you haven't exceeded your API limits
- Try generating a new API key

### Rate Limiting
- Benchmarks include built-in rate limiting (0.5s between requests)
- If you still hit rate limits, check your Tavily account plan
- Consider running benchmarks during off-peak hours

## Security Notes

- Never commit API keys to Git
- The `.env` file is in `.gitignore` by default
- Use Cursor Dashboard Secrets for CI/CD pipelines
- Rotate API keys periodically for security
