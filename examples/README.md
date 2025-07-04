# AIlib Examples

This directory contains example programs to demonstrate how to use the AIlib library.

## Requirements

- Node.js 18 or higher
- An OpenRouter API key

## Setup

1. Create a `.env` file in the root directory with your OpenRouter API key:

```
OPENROUTER_API_KEY=your_key_here
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
```

## Available examples

- `weather.ts` - Demonstrates using AIlib with a simple weather tool
- `conversation.ts` - Interactive CLI conversation with multiple tools (weather and flight search)
- `structured-output.ts` - Shows how to get structured JSON responses using response_format