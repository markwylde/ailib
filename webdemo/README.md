# ailib Web Chat Demo

This is a simple web-based chat application built with React, TypeScript, and Vite that demonstrates how to use the ailib library.

## Features

- Chat interface with streaming responses
- Collapsible reasoning tokens display showing the model's thought process
- Markdown rendering with syntax highlighting for code blocks
- Uses the ailib library to communicate with OpenRouter AI models
- API key management (stored in localStorage)
- Responsive design for various screen sizes

## Prerequisites

- Node.js (v18+)
- An OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai))

## Getting Started

1. Clone the repository
2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root directory with your OpenRouter API key:
```
VITE_OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Alternatively, you can enter your API key in the application's form when prompted.

4. Run the development server
```bash
npm run dev
```

5. Open your browser and navigate to http://localhost:5173

## How It Works

This demo showcases how to use the ailib library to create a chat interface with AI models. Key features include:

- Message streaming for real-time responses
- Collapsible reasoning tokens display that shows the model's thought process in real-time
- Toggle buttons to show/hide the reasoning for each message
- Markdown rendering for formatting, lists, code blocks, etc.
- Syntax highlighting for code blocks
- Local storage of chat history
- API key management
- Error handling

The application connects to OpenRouter which provides access to various AI models from different providers. It specifically uses models with reasoning capabilities to show the thought process.

## Using Markdown

Both the user and AI can use Markdown syntax in their messages. The application supports:

- **Headings** with # (e.g., # Heading 1)
- **Bold text** with **text**
- *Italic text* with *text*
- Code blocks with triple backticks and language specification:
  ```javascript
  const example = "This will have syntax highlighting";
  ```
- Inline `code` with single backticks
- Lists (ordered and unordered)
- Links with [text](url)
- And more Markdown features

## Model Selection

The application uses models that support the reasoning feature. You can switch to other models that support reasoning by editing the model name in `src/services/ai.ts`. Some options include:
- `google/gemini-2.5-flash-preview:thinking`
- `anthropic/claude-3-5-haiku:thinking`
- `deepseek/deepseek-r1-distill-llama-8b`

Note that not all models support the reasoning capability. Refer to the OpenRouter documentation for more information on which models support this feature.

## Credits

Built with:
- [Vite](https://vitejs.dev/)
- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [ailib](https://github.com/markwylde/ailib) - A simple library for interacting with AI models
- [react-markdown](https://github.com/remarkjs/react-markdown) - Markdown renderer for React
- [rehype-highlight](https://github.com/rehypejs/rehype-highlight) - Syntax highlighting for code blocks