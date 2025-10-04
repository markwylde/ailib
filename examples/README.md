# AIlib Examples

This directory contains example programs to demonstrate how to use the AIlib library.

## Requirements

- Node.js 18 or higher
- For OpenRouter examples: an OpenRouter API key
- For Ollama examples: an Ollama server running locally or reachable via `OLLAMA_HOST`

## Setup

1. Create a `.env` file in the root directory with your OpenRouter API key (for OpenRouter examples) and optionally your Ollama host:

```
OPENROUTER_API_KEY=your_key_here
# Optional, defaults to http://localhost:11434
OLLAMA_HOST=http://localhost:11434
```

## Running examples

You can run the examples using:

```bash
# Basic weather tool example
npm run example:weather

# Interactive conversation with multiple tools
npm run example:conversation

# Structured JSON output example
npm run example:structured-output

# Ollama tool calling example
npm run example:ollama:tools
```

## Available examples

- `weather.ts` - Demonstrates using AIlib with a simple weather tool
- `conversation.ts` - Interactive CLI conversation with multiple tools (weather and flight search)
- `structured-output.ts` - Shows how to get structured JSON responses using response_format
- `ollama-tools.ts` - Demonstrates using Ollama locally with tool calling
