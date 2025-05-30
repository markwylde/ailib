import z from "zod";
import { jsonrepair } from "jsonrepair";
import { createThread } from "../src/thread.js";
import { OpenRouter } from "../src/providers/openRouter.js";

const thread = createThread({
  provider: OpenRouter,
  model: "google/gemini-2.0-flash-001",
  apiKey: process.env.OPENROUTER_API_KEY!,
  messages: [{
    role: "system",
    content: "You are a helpful assistant that can only respond with valid JSON and nothing else. You can not add commentary or any content before or after the json. Do not wrap any code block around the json. Your only response MUST be JSON."
  }],
  modelOptions: {
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "weather",
        strict: true,
        schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City or location name"
            },
            temperature: {
              type: "number",
              description: "Temperature in Celsius"
            },
            conditions: {
              type: "string",
              description: "Weather conditions description"
            }
          },
          required: ["location", "temperature", "conditions"],
          additionalProperties: false
        }
      }
    }
  }
});

thread.messages.add({
	role: "assistant",
	content: "The weather in London is cloudy, currently raining and around 3c."
});

thread.messages.add({
  role: "user",
  content: "What's the weather like in London?"
});

const generation = thread.messages.generate();

generation.on("data", ([chunk, message]) => {
  process.stdout.write(chunk);
});

generation.on("end", () => {
  console.log("\n\nGeneration completed!");
  const lastMessage = thread.messages.list[thread.messages.list.length - 1];
  console.log("Final response:", lastMessage.content);

  // Try to parse as JSON to verify structure
  try {
    const parsed = JSON.parse(lastMessage.content);
    console.log("Parsed JSON:", parsed);
    console.log("✅ Valid JSON structure!");
  } catch (error) {
    console.log("Response is not valid JSON, attempting repair...");
    try {
      const repaired = jsonrepair(lastMessage.content);
      console.log("Repaired JSON:", repaired);
      const parsed = JSON.parse(repaired);
      console.log("Parsed repaired JSON:", parsed);
      console.log("✅ Successfully repaired and parsed JSON!");
    } catch (repairError) {
      console.log("Failed to repair JSON:", repairError);
    }
  }
});

generation.on("error", (error) => {
  console.error("Error:", error);
});

await generation;