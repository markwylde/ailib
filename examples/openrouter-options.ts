import { createThread } from "../src/index.js";
import { OpenRouter } from "../src/providers/openRouter.js";

// Example of using OpenRouter with all options
async function main() {
	const modelId = process.env.MODEL_ID || "gpt-3.5-turbo";
	const apiKey = process.env.OPENROUTER_API_KEY;

	if (!apiKey) {
		console.error("Error: OPENROUTER_API_KEY environment variable is required");
		process.exit(1);
	}

	console.log(`Creating thread with model: ${modelId}`);
	console.log(`Using API key: ${apiKey ? "✓ (set)" : "✗ (not set)"}`);

	const thread = createThread({
		provider: OpenRouter,
		model: modelId,
		apiKey,
		// Example of using various OpenRouter options
		modelOptions: {
			temperature: 0.7,
			max_tokens: 500,
			// Use the reasoning option to see the model's thinking process
			reasoning: {
				enabled: true,
				include: true,
			},
			// Example of other parameters
			// top_p: 0.9,
			// frequency_penalty: 0.5,
			// presence_penalty: 0.5,
		},
	});

	console.log("Asking a complex question with reasoning visible...");
	thread.messages.add({
		role: "user",
		content:
			"Explain the concept of recursion in programming with a simple example.",
	});

	const stream = thread.messages.generate();

	// Listen for data events (chunks of text)
	stream.on("data", ([chunk, message]) => {
		console.log(`Data event - chunk: "${chunk}"`);
		console.log("Message so far:", JSON.stringify(message, null, 2));
	});

	// Listen for state changes
	stream.on("state", (state) => {
		console.log(`Stream state: ${state}`);
	});

	await stream;
	console.log("\nStream completed\n");

	console.log("All messages in thread:");
	console.log(JSON.stringify(thread.messages.list, null, 2));
}

main().catch(console.error);
