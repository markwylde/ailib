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

	const model = "google/gemini-2.5-flash-preview:thinking";

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
				name: "get-random-fact",
				description: "Get a random interesting fact",
				parameters: z.object({}), // Empty object schema
				handler: async () => {
					console.log("Getting a random fact...");
					return "Did you know that octopuses have three hearts?";
				},
			},
		],
		apiKey: process.env.OPENROUTER_API_KEY || "your_api_key_here",
	});

	console.log("Asking for a random fact...");
	ai.messages.add({ role: "user", content: "Tell me a random fact" });

	const stream = ai.messages.generate();

	stream.on("state", (state) => {
		console.log(`Stream state: ${state}`);
	});

	stream.on("data", ([chunk, message]) => {
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
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});