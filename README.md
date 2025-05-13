# ailib

A lightweight AI client library for Node.js that provides a simple interface for working with AI models through OpenRouter.

## Features

- Simple thread-based conversation management
- Streaming responses with events
- Tool calling support
- TypeScript support with proper typing
- Modern async/await API
- Support for OpenRouter API (extensible for other providers)

## Installation

```bash
npm install @markwylde/ailib
```

## Usage

```ts
import { createThread, OpenRouter } from '@markwylde/ailib';
import { z } from 'zod';

// Create a thread
const ai = createThread({
  provider: OpenRouter,
  model: 'anthropic/claude-3-sonnet',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
  ],
  tools: [{
    name: 'get-weather',
    description: 'Get the weather for a location',
    parameters: z.object({
      location: z.string(),
    }),
    handler: async ({ location }) => {
      return `The weather in ${location} is sunny.`;
    }
  }],
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Add a message to the thread
ai.messages.add({ role: 'user', content: 'What is the weather in Tokyo?' });

// Generate a new message from the AI
const stream = ai.messages.generate();

// Listen for data coming through the stream as an event
stream.on('state', (state) => {
  console.log(state); // 'sent' | 'receiving' | 'completed' | 'failed'
});

stream.on('data', ([chunk, message]) => {
  console.log(chunk); // Stream text chunks as they arrive
});

// Listen for the stream to end
stream.on('end', () => {
  console.log('Stream completed');
});

// Wait for the stream to complete (Promise interface)
await stream;

// Access all messages in the thread
console.log(ai.messages);
```

## API

### `createThread(options)`

Creates a new conversation thread.

#### Options

- `provider`: The AI provider to use (e.g., `OpenRouter`)
- `model`: The model to use (e.g., `'anthropic/claude-3-sonnet'`)
- `messages`: Initial messages in the thread (optional)
- `tools`: Tools available to the AI (optional)
- `apiKey`: Your API key

#### Returns

A `Thread` object with a `messages` array.

### Message Methods

- `ai.messages.add(message)`: Add a message to the thread
- `ai.messages.remove(message)`: Remove a message from the thread
- `ai.messages.generate()`: Generate a new AI message based on the thread

### Stream Events

The stream returned by `generate()` emits the following events:

- `state`: Emitted when the stream state changes (`'sent'` | `'receiving'` | `'completed'` | `'failed'`)
- `data`: Emitted when new content is received, provides the text chunk and the full message
- `end`: Emitted when the stream ends

## Tool Calling

Tools allow the AI model to call functions that you define:

```ts
const ai = createThread({
  // ... other options
  tools: [{
    name: 'get-weather',
    description: 'Get the weather for a location',
    parameters: z.object({
      location: z.string(),
    }),
    handler: async ({ location }) => {
      // Call a weather API here
      return `The weather in ${location} is sunny.`;
    }
  }]
});
```

## Example

See the [examples](./examples) directory for working examples.

## Requirements

- Node.js 18 or higher
- An OpenRouter API key

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run the example
npm run example:weather
```
