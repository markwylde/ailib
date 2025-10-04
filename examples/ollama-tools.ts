import * as dotenv from "dotenv";
import { z } from "zod";
import { createThread, Ollama } from "../src/index.js";

dotenv.config();

async function main() {
	const baseUrl = process.env.OLLAMA_HOST || "http://localhost:11434";
	console.log(`Using Ollama at: ${baseUrl}`);

	const model = process.env.OLLAMA_MODEL || "qwen2.5-coder:14b-instruct";
	console.log(`Creating thread with model: ${model}`);

	const ai = createThread({
		provider: Ollama,
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
					console.log(`(tool) Looking up weather for ${location}...`);
					return JSON.stringify({
						location,
						condition: "sunny",
						temperature: "22°C",
					});
				},
			},
		],
		apiKey: "",
	});

	console.log("Asking about weather in Tokyo (with tool calling)...\n");
	ai.messages.add({ role: "user", content: "What is the weather in Tokyo?" });

	const stream = ai.messages.generate();

	stream.on("state", (state) => {
		console.log(`Stream state: ${state}`);
	});

	stream.on("data", ([chunk, _message]) => {
		process.stdout.write(chunk);
	});

	stream.on("end", () => {
		console.log("\nStream completed");
		console.log("\nAll messages in thread:");
		console.log(JSON.stringify(ai.messages.list, null, 2));
	});

	stream.on("error", (error) => {
		console.error("Stream error:", error);
	});

	await stream;
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
