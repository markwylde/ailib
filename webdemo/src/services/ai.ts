import {
	type Message as AiMessage,
	createThread,
	OpenRouter,
} from "@markwylde/ailib";

// Get the API key from localStorage or environment variables
const getApiKey = (): string => {
	const localStorageKey = localStorage.getItem("openrouter_api_key");
	const envKey = import.meta.env.VITE_OPENROUTER_API_KEY || "";

	return localStorageKey || envKey;
};

export interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	reasoning?: string;
	id: string;
}

// Initialize messages with a system message
let messagesCache: ChatMessage[] = [
	{
		role: "system",
		content: "You are a helpful assistant.",
		id: crypto.randomUUID(),
	},
];

// Convert ailib Message to our ChatMessage format
const convertToAppMessage = (message: AiMessage): ChatMessage => {
	return {
		role: message.role as "user" | "assistant" | "system",
		content: message.content,
		reasoning: message.reasoning,
		id: crypto.randomUUID(),
	};
};

// Create a thread instance with the current API key
const createThreadInstance = () => {
	const apiKey = getApiKey();

	return createThread({
		provider: OpenRouter,
		model: "qwen/qwen3-235b-a22b-thinking-2507", // Model that supports reasoning
		apiKey,
		// Important: Pass the full message objects including reasoning
		messages: messagesCache.map((msg) => ({
			role: msg.role,
			content: msg.content,
			reasoning: msg.reasoning,
		})),
		modelOptions: {
			temperature: 0.7,
			reasoning: {
				enabled: true,
				include: true,
			},
		},
	});
};

// Create initial thread
let thread = createThreadInstance();
let inFlight: (Promise<void> & { cancel: () => void }) | null = null;

export const cancel = () => {
	try {
		inFlight?.cancel();
	} catch {}
};

export const sendMessage = async (
	userMessage: string,
	onChunk: (chunk: string) => void,
	onReasoningChunk: (chunk: string) => void,
): Promise<void> => {
	const apiKey = getApiKey();

	if (!apiKey) {
		throw new Error(
			"API key is not configured. Please add your OpenRouter API key.",
		);
	}

	// Add user message to local cache first
	messagesCache.push({
		role: "user",
		content: userMessage,
		id: crypto.randomUUID(),
	});

	// Re-create thread with latest API key and messages
	thread = createThreadInstance();

	// Generate response
	const generate = thread.messages.generate();
	inFlight = generate;

	// Set up event listeners for regular content
	generate.on("data", ([chunk]) => {
		onChunk(chunk);
	});

	// Set up event listeners for reasoning content
	generate.on("reasoning", ([chunk]) => {
		onReasoningChunk(chunk);
	});

	try {
		// Wait for completion (cancel resolves gracefully)
		await generate;

		// Update messages cache with latest messages including reasoning
		messagesCache = thread.messages.list.map(convertToAppMessage);

		// Store in localStorage for persistence between sessions
		try {
			localStorage.setItem("chat_messages", JSON.stringify(messagesCache));
		} catch (e) {
			console.warn("Could not save messages to localStorage", e);
		}
	} catch (error) {
		console.error("Error generating message:", error);
		throw error;
	} finally {
		inFlight = null;
	}
};

// Load messages from localStorage on initialization
try {
	const savedMessages = localStorage.getItem("chat_messages");
	if (savedMessages) {
		const parsed = JSON.parse(savedMessages);
		if (Array.isArray(parsed) && parsed.length > 0) {
			messagesCache = parsed;
		}
	}
} catch (e) {
	console.warn("Could not load messages from localStorage", e);
}

export const getMessages = (): ChatMessage[] => {
	return messagesCache;
};
