import * as z from "zod";
import type { Message, Provider, Tool } from "../types.js";

type JsonSchemaLike = {
	$schema?: unknown;
	additionalProperties?: unknown;
	minimum?: unknown;
	maximum?: unknown;
	minLength?: unknown;
	maxLength?: unknown;
	pattern?: unknown;
	format?: unknown;
	enum?: unknown;
	const?: unknown;
	multipleOf?: unknown;
	exclusiveMinimum?: unknown;
	exclusiveMaximum?: unknown;
	minItems?: unknown;
	maxItems?: unknown;
	uniqueItems?: unknown;
	minProperties?: unknown;
	maxProperties?: unknown;
	dependencies?: unknown;
	patternProperties?: unknown;
	allOf?: unknown;
	anyOf?: unknown;
	oneOf?: unknown;
	not?: unknown;
	properties?: Record<string, JsonSchemaLike>;
	items?: JsonSchemaLike;
	required?: string[];
	[key: string]: unknown;
};

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

interface ModelPricing {
	promptPrice: number;
	completionPrice: number;
}

const pricingCache: Record<string, ModelPricing> = {};

export async function getModelPricing(
	modelId: string,
	apiKey: string,
): Promise<ModelPricing> {
	if (pricingCache[modelId]) {
		return pricingCache[modelId];
	}

	try {
		const response = await fetch("https://openrouter.ai/api/v1/models", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		const data = await response.json();
		const model = data.data.find((m: { id: string }) => m.id === modelId);

		if (!model) {
			console.error(`Warning: Model ${modelId} not found in pricing data`);
			return { promptPrice: 0, completionPrice: 0 };
		}

		// OpenRouter pricing is USD per token
		const result = {
			promptPrice: Number.parseFloat(model.pricing.prompt),
			completionPrice: Number.parseFloat(model.pricing.completion),
		};

		pricingCache[modelId] = result;

		return result;
	} catch (error: unknown) {
		const err = error as Error;
		console.error(`Error fetching model pricing: ${err.message}`);
		return { promptPrice: 0, completionPrice: 0 };
	}
}

export const OpenRouter: Provider = {
	generateMessage: async function* (options) {
		const { model, messages, tools, apiKey, modelOptions, signal } = options;
		let totalTokens = 0;
		let totalCost = 0;
		let promptTokens = 0;
		let completionTokens = 0;

		const pricing = await getModelPricing(model, apiKey);

		const openRouterMessages: OpenRouterMessage[] = messages.map(
			(message: Message) => ({
				role: message.role,
				content: message.content,
				tool_call_id: message.tool_call_id,
				tool_calls: message.tool_calls,
			}),
		);

		const toolsFormatted = tools?.map((tool: Tool) => {
			// Convert to JSON schema using Zod 4's built-in method
			const jsonSchema = z.toJSONSchema(tool.parameters) as JsonSchemaLike;

			// Check if we're using Cerebras provider with strict mode
			const providerList = modelOptions?.provider?.only || [];
			const isCerebras = providerList.some(
				(p) => p.toLowerCase() === "cerebras",
			);

			if (isCerebras) {
				// Cerebras has strict requirements:
				// 1. ALL fields must be in the required array
				// 2. No $schema field allowed
				// 3. No additionalProperties field allowed (even in nested objects)

				// Recursively remove unsupported fields
				const removeUnsupportedFields = (obj: JsonSchemaLike) => {
					if (obj && typeof obj === "object") {
						// Remove fields that Cerebras doesn't support
						delete obj.$schema;
						delete obj.additionalProperties;
						delete obj.minimum;
						delete obj.maximum;
						delete obj.minLength;
						delete obj.maxLength;
						delete obj.pattern;
						delete obj.format;
						delete obj.enum;
						delete obj.const;
						delete obj.multipleOf;
						delete obj.exclusiveMinimum;
						delete obj.exclusiveMaximum;
						delete obj.minItems;
						delete obj.maxItems;
						delete obj.uniqueItems;
						delete obj.minProperties;
						delete obj.maxProperties;
						delete obj.dependencies;
						delete obj.patternProperties;
						delete obj.allOf;
						delete obj.anyOf;
						delete obj.oneOf;
						delete obj.not;

						// Process nested objects
						if (obj.properties) {
							for (const prop of Object.values(obj.properties)) {
								removeUnsupportedFields(prop);
							}
						}

						// Process array items
						if (obj.items) {
							removeUnsupportedFields(obj.items);
						}
					}
				};

				removeUnsupportedFields(jsonSchema);

				// Make all fields required
				if (jsonSchema.properties) {
					jsonSchema.required = Object.keys(jsonSchema.properties);
				}
			}

			return {
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: jsonSchema,
				},
			};
		});

		// Build request body with all supported options
		const body: Record<string, unknown> = {
			model,
			messages: openRouterMessages,
			tools: (tools?.length || 0) > 0 ? toolsFormatted : undefined,
			stream: true,
		};

		// Add all model options to the request
		if (modelOptions) {
			if (modelOptions.temperature !== undefined)
				body.temperature = modelOptions.temperature;
			if (modelOptions.max_tokens !== undefined)
				body.max_tokens = modelOptions.max_tokens;
			if (modelOptions.seed !== undefined) body.seed = modelOptions.seed;
			if (modelOptions.top_p !== undefined) body.top_p = modelOptions.top_p;
			if (modelOptions.top_k !== undefined) body.top_k = modelOptions.top_k;
			if (modelOptions.frequency_penalty !== undefined)
				body.frequency_penalty = modelOptions.frequency_penalty;
			if (modelOptions.presence_penalty !== undefined)
				body.presence_penalty = modelOptions.presence_penalty;
			if (modelOptions.repetition_penalty !== undefined)
				body.repetition_penalty = modelOptions.repetition_penalty;
			if (modelOptions.min_p !== undefined) body.min_p = modelOptions.min_p;
			if (modelOptions.top_a !== undefined) body.top_a = modelOptions.top_a;
			if (modelOptions.reasoning !== undefined)
				body.reasoning = modelOptions.reasoning;
			if (modelOptions.usage !== undefined) body.usage = modelOptions.usage;
			if (modelOptions.provider !== undefined)
				body.provider = modelOptions.provider;
			if (modelOptions.models !== undefined) body.models = modelOptions.models;
			if (modelOptions.transforms !== undefined)
				body.transforms = modelOptions.transforms;
			if (modelOptions.logit_bias !== undefined)
				body.logit_bias = modelOptions.logit_bias;
			if (modelOptions.top_logprobs !== undefined)
				body.top_logprobs = modelOptions.top_logprobs;
			if (modelOptions.response_format !== undefined)
				body.response_format = modelOptions.response_format;
		}

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
				signal,
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
		let generationId: string | null = null;
		const assistantMessage: Message = {
			role: "assistant",
			content: "",
			tokens: 0,
			cost: 0,
			totalTokens: 0,
			totalCost: 0,
		};

		const onAbort = () => {
			try {
				reader.cancel();
			} catch {}
		};
		if (signal) {
			if ((signal as AbortSignal).aborted) onAbort();
			(signal as AbortSignal).addEventListener("abort", onAbort, {
				once: true,
			});
		}

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

						// Capture generation ID from first chunk
						if (data.id && !generationId) {
							generationId = data.id;
						}

						if (data.choices?.[0]) {
							const choice = data.choices[0];

							// Track token usage when available
							if (data.usage) {
								if (data.usage.prompt_tokens && promptTokens === 0) {
									promptTokens = data.usage.prompt_tokens;
									totalTokens += promptTokens;
									// Calculate prompt cost - price is per token
									const promptCost = promptTokens * pricing.promptPrice;
									totalCost += promptCost;
								}

								if (data.usage.completion_tokens) {
									const newCompletionTokens =
										data.usage.completion_tokens - completionTokens;
									if (newCompletionTokens > 0) {
										completionTokens = data.usage.completion_tokens;
										totalTokens = promptTokens + completionTokens;

										// Calculate completion cost - price is per token
										const completionCost =
											completionTokens * pricing.completionPrice;
										totalCost =
											promptTokens * pricing.promptPrice + completionCost;

										// Update message costs
										assistantMessage.tokens = completionTokens;
										assistantMessage.cost = completionCost;
										assistantMessage.totalTokens = totalTokens;
										assistantMessage.totalCost = totalCost;
									}
								}
							}

							// Even if usage isn't in this chunk, still update the message with current values
							assistantMessage.tokens = completionTokens;
							assistantMessage.cost =
								completionTokens * pricing.completionPrice;
							assistantMessage.totalTokens = totalTokens;
							assistantMessage.totalCost = totalCost;

							// Process reasoning data from the model
							if (choice.delta?.reasoning) {
								if (!assistantMessage.reasoning) {
									assistantMessage.reasoning = "";
								}
								const reasoningChunk = choice.delta.reasoning;
								assistantMessage.reasoning += reasoningChunk;
								// Emit a special reasoning event with a special marker
								yield [
									`__REASONING__${reasoningChunk}`,
									{ ...assistantMessage },
								];
							}

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
					} catch (_e) {
						// Silently skip malformed JSON
					}
				}
			}
		} finally {
			if (signal) (signal as AbortSignal).removeEventListener("abort", onAbort);
			try {
				reader.releaseLock();
			} catch {}
		}

		// Fetch actual cost from generation endpoint with retry
		if (!generationId) {
			throw new Error(
				"OpenRouter did not include a generation id in the stream response",
			);
		}

		const maxAttempts = 5;
		const baseDelayMs = 500;
		let lastErrorMessage = "";

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const genResponse = await fetch(
					`https://openrouter.ai/api/v1/generation?id=${generationId}`,
					{
						headers: {
							Authorization: `Bearer ${apiKey}`,
						},
					},
				);

				if (genResponse.ok) {
					const genData = await genResponse.json();
					if (genData.data) {
						// Use native tokens and actual cost from generation endpoint
						const nativePromptTokens = genData.data.native_tokens_prompt || 0;
						const nativeCompletionTokens =
							genData.data.native_tokens_completion || 0;
						const actualTotalCost = genData.data.total_cost || 0;

						assistantMessage.tokens = nativeCompletionTokens;
						assistantMessage.cost =
							nativeCompletionTokens * pricing.completionPrice;
						assistantMessage.totalTokens =
							nativePromptTokens + nativeCompletionTokens;
						assistantMessage.totalCost = actualTotalCost;
						return;
					}

					lastErrorMessage = "Generation response missing data payload";
				} else {
					let bodyText = "";
					try {
						bodyText = await genResponse.text();
					} catch (readError) {
						bodyText = `Unable to read response body: ${
							readError instanceof Error ? readError.message : String(readError)
						}`;
					}
					lastErrorMessage = `HTTP ${genResponse.status} ${genResponse.statusText}: ${bodyText}`;
				}
			} catch (error) {
				lastErrorMessage =
					error instanceof Error ? error.message : String(error);
			}

			if (attempt < maxAttempts) {
				const delay = baseDelayMs * 2 ** (attempt - 1);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		throw new Error(
			`Failed to fetch OpenRouter generation ${generationId} after ${maxAttempts} attempts${
				lastErrorMessage ? `: ${lastErrorMessage}` : ""
			}`,
		);
	},
};
