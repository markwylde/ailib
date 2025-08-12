import * as dotenv from "dotenv";
import { z } from "zod";
import { createThread, OpenRouter } from "../src/index.js";

dotenv.config();

async function main() {
	if (!process.env.OPENROUTER_API_KEY) {
		console.error("Error: OPENROUTER_API_KEY environment variable not set");
		console.error("Please create a .env file with your OpenRouter API key");
		console.error("Example: OPENROUTER_API_KEY=your_api_key_here");
		process.exit(1);
	}

	const model = "qwen/qwen3-30b-a3b";

	// Create a new conversation thread
	const ai = createThread({
		provider: OpenRouter,
		model,
		messages: [
			{ role: "system", content: "You are a helpful coding assistant." },
		],
		// Define tools the AI can use
		tools: [
			{
				name: "generate-random-number",
				description: "Generate a random number between min and max values",
				parameters: z.object({
					min: z.number(),
					max: z.number(),
				}),
				handler: async ({ min, max }) => {
					console.log(`Generating random number between ${min} and ${max}...`);
					const randomNum = Math.floor(Math.random() * (max - min + 1) + min);
					return `Random number: ${randomNum}`;
				},
			},
		],
		apiKey: process.env.OPENROUTER_API_KEY,
	});

	// Add a user message
	ai.messages.add({
		role: "user",
		content:
			"I need a random number between 1 and 100 for my project. Can you help?",
	});

	// Generate an AI response
	const stream = ai.messages.generate();

	// Set up stream event handlers
	stream.on("state", (state) => {
		if (state === "sent") console.log("Sending request...");
		if (state === "receiving") console.log("Receiving response...");
		if (state === "completed") console.log("\nResponse completed");
		if (state === "failed") console.log("\nResponse failed");
	});

	stream.on("data", ([chunk, _message]) => {
		// Print chunks as they arrive
		process.stdout.write(chunk);
	});

	stream.on("error", (error) => {
		console.error("\nError:", error.message);
	});

	try {
		await stream;

		// Show all messages in the conversation
		console.log("\nConversation history:");
		ai.messages.list.forEach((message, _i) => {
			console.log(`\n[${message.role}]:`);
			console.log(message.content);

			if (message.tool_calls) {
				console.log("\nTool calls:");
				for (const tool of message.tool_calls) {
					console.log(`- ${tool.function.name}(${tool.function.arguments})`);
				}
			}
		});
	} catch (error) {
		console.error("Error during conversation:", error);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
