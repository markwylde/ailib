import type { z } from "zod";
import { type Message, type Provider, Tool, ToolCall } from "../types.js";

interface OpenRouterMessage {
	role: string;
	content: string | null;
	tool_call_id?: string;
	tool_calls?: {
		id: string;
		type: "function";
		function: {
			name: string;
			arguments: string;
		};
	}[];
}

export const OpenRouter: Provider = {
	generateMessage: async function* (options) {
		const { model, messages, tools, apiKey } = options;

		const openRouterMessages: OpenRouterMessage[] = messages.map((message) => ({
			role: message.role,
			content: message.content,
			tool_call_id: message.tool_call_id,
			tool_calls: message.tool_calls,
		}));

		const toolsFormatted = tools?.map((tool) => {
			// For OpenRouter, we need to transform the Zod schema to JSON Schema
			// This is a simple approach for JSON schema generation
			// Access the Zod object using type assertion
			const zodObj = tool.parameters as z.ZodObject<z.ZodRawShape>;

			// Extract shape from the Zod object type
			const shape = zodObj._def?.shape ? zodObj._def.shape : {};

			// Get field names
			const fields = typeof shape === "function" ? shape() : shape;
			const fieldNames = Object.keys(fields || {});

			return {
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: {
						type: "object",
						properties: Object.fromEntries(
							fieldNames.map((key) => [
								key,
								{ type: "string", description: `Parameter: ${key}` },
							]),
						),
						required: fieldNames,
					},
				},
			};
		});

		const body = {
			model,
			messages: openRouterMessages,
			tools: toolsFormatted,
			stream: true,
		};

		const response = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					"HTTP-Referer": "https://github.com/markwylde/ailib",
					"X-Title": "@markwylde/ailib",
				},
				body: JSON.stringify(body),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
		}

		if (!response.body) {
			throw new Error("Response body is null");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		const assistantMessage: Message = {
			role: "assistant",
			content: "",
		};

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.trim() || !line.startsWith("data: ")) continue;

					try {
						const jsonStr = line.substring(6);

						// Handle the [DONE] message from SSE
						if (jsonStr.trim() === "[DONE]") continue;

						const data = JSON.parse(jsonStr);

						if (data.choices?.[0]) {
							const choice = data.choices[0];

							if (choice.delta?.content) {
								assistantMessage.content += choice.delta.content;
								yield [choice.delta.content, assistantMessage];
							}

							if (choice.delta?.tool_calls) {
								if (!assistantMessage.tool_calls) {
									assistantMessage.tool_calls = [];
								}

								for (const toolCall of choice.delta.tool_calls) {
									if (toolCall.index === undefined) continue;

									if (!assistantMessage.tool_calls[toolCall.index]) {
										assistantMessage.tool_calls[toolCall.index] = {
											id: toolCall.id || "",
											type: "function",
											function: {
												name: toolCall.function?.name || "",
												arguments: toolCall.function?.arguments || "",
											},
										};
									} else {
										if (toolCall.function?.name) {
											assistantMessage.tool_calls[
												toolCall.index
											].function.name += toolCall.function.name;
										}
										if (toolCall.function?.arguments) {
											assistantMessage.tool_calls[
												toolCall.index
											].function.arguments += toolCall.function.arguments;
										}
									}
								}

								yield ["", assistantMessage];
							}
						}
					} catch (e) {
						// Silently skip malformed JSON
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	},
};
