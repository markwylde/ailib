import * as dotenv from "dotenv";
import { z } from "zod";
import { OpenRouter, createThread } from "../src/index.js";

dotenv.config();

async function main() {
	if (!process.env.OPENROUTER_API_KEY) {
		console.error("Error: OPENROUTER_API_KEY environment variable not set");
		console.error("Please create a .env file with your OpenRouter API key");
		console.error("Example: OPENROUTER_API_KEY=your_api_key_here");
		process.exit(1);
	}

	// Using a well-known model that should be available on OpenRouter
	// const model = "anthropic/claude-3.7-sonnet";
	const model = "qwen/qwen3-30b-a3b";

	console.log(`Creating thread with model: ${model}`);
	console.log(
		`Using API key: ${process.env.OPENROUTER_API_KEY ? "✓ (set)" : "✗ (not set)"}`,
	);

	const ai = createThread({
		provider: OpenRouter,
		model,
		messages: [{ role: "system", content: "You are a helpful assistant." }],
		tools: [
			{
				name: "get-weather",
				description: "Get the weather for a location",
				parameters: z.object({
					location: z.string(),
				}),
				handler: async ({ location }) => {
					console.log(`Looking up weather for ${location}...`);
					// In a real app, you'd call a weather API here
					return `The weather in ${location} is sunny and 72°F.`;
				},
			},
		],
		apiKey: process.env.OPENROUTER_API_KEY || "your_api_key_here",
	});

	console.log("Asking about weather in Tokyo...");
	ai.messages.add({ role: "user", content: "What is the weather in Tokyo?" });

	const stream = ai.messages.generate();

	stream.on("state", (state) => {
		console.log(`Stream state: ${state}`);
	});

	stream.on("data", ([chunk, message]) => {
		console.log(`Data event - chunk: "${chunk}"`);
		console.log(`Message so far: ${JSON.stringify(message, null, 2)}`);
		process.stdout.write(chunk);
	});

	stream.on("end", () => {
		console.log("\nStream completed");
		console.log("\nAll messages in thread:");
		console.log(JSON.stringify(ai.messages, null, 2));
	});

	stream.on("error", (error) => {
		console.error("Stream error:", error);
	});

	try {
		await stream;
	} catch (error) {
		console.error("Error during streaming:", error);
		// Continue execution so we can see the messages that were processed
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
