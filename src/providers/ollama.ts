import * as z from "zod";
import type { Message, Provider, Tool } from "../types.js";

type JsonSchemaLike = {
	[key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

type OllamaToolDefinition = {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: JsonSchemaLike;
	};
};

interface OllamaRequestBody {
	model: string;
	messages: OllamaChatMessage[];
	stream: boolean;
	tools?: OllamaToolDefinition[];
	format?: unknown;
	think?: boolean;
	options?: Record<string, unknown>;
}

interface OllamaChunkMessage {
	content?: unknown;
	tool_calls?: Array<{
		function: { name: string; arguments: unknown };
	}>;
}

interface OllamaStreamChunk {
	message?: OllamaChunkMessage;
	done?: boolean;
	prompt_eval_count?: number;
	eval_count?: number;
}

interface OllamaChatMessage {
	role: string;
	content: string;
	tool_calls?: Array<{
		function: { name: string; arguments: unknown };
	}>;
	tool_name?: string;
}

export const Ollama: Provider = {
	generateMessage: async function* (options) {
		const { model, messages, tools, modelOptions, signal } = options;

		let promptTokens = 0;
		let completionTokens = 0;
		const strict = process.env.AILIB_OLLAMA_STRICT !== "0";

		const ollamaMessages: OllamaChatMessage[] = messages.map(
			(m: Message, idx: number) => {
				const base: OllamaChatMessage = {
					role: m.role,
					content: m.content,
				};

				if (m.role === "assistant" && m.tool_calls?.length) {
					base.tool_calls = m.tool_calls.map((tc) => {
						let args: unknown = {};
						try {
							args = tc.function?.arguments
								? JSON.parse(tc.function.arguments)
								: {};
						} catch {
							args = tc.function?.arguments ?? {};
						}
						return {
							function: {
								name: tc.function?.name || "",
								arguments: args,
							},
						};
					});
				}

				if (m.role === "tool") {
					for (let j = idx - 1; j >= 0; j--) {
						const prev = messages[j];
						if (prev.role === "assistant" && prev.tool_calls?.length) {
							const first = prev.tool_calls[0];
							base.tool_name = first?.function?.name || base.tool_name;
							break;
						}
					}
				}

				return base;
			},
		);

		const toolsFormatted: OllamaToolDefinition[] =
			tools?.map((tool: Tool) => {
				const jsonSchema = z.toJSONSchema(tool.parameters) as JsonSchemaLike;
				return {
					type: "function",
					function: {
						name: tool.name,
						description: tool.description,
						parameters: jsonSchema,
					},
				};
			}) ?? [];

		const body: OllamaRequestBody = {
			model,
			messages: ollamaMessages,
			stream: true,
		};
		if (toolsFormatted.length) {
			body.tools = toolsFormatted;
		}

		if (modelOptions) {
			if (modelOptions.response_format?.type === "json_schema") {
				body.format = modelOptions.response_format.json_schema?.schema;
			}

			if (modelOptions.reasoning?.enabled) {
				body.think = true;
			}

			const genOptions: Record<string, unknown> = {};
			if (modelOptions.temperature !== undefined)
				genOptions.temperature = modelOptions.temperature;
			if (modelOptions.top_p !== undefined)
				genOptions.top_p = modelOptions.top_p;
			if (modelOptions.top_k !== undefined)
				genOptions.top_k = modelOptions.top_k;
			if (modelOptions.min_p !== undefined)
				genOptions.min_p = modelOptions.min_p;
			if (modelOptions.seed !== undefined) genOptions.seed = modelOptions.seed;
			if (modelOptions.max_tokens !== undefined)
				genOptions.num_predict = modelOptions.max_tokens;
			if (modelOptions.repetition_penalty !== undefined)
				genOptions.repeat_penalty = modelOptions.repetition_penalty;

			if (Object.keys(genOptions).length) body.options = genOptions;
		}

		const baseUrl = process.env.OLLAMA_HOST || "http://localhost:11434";
		const response = await fetch(`${baseUrl}/api/chat`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Ollama API error: ${response.status} ${errorText}`);
		}
		if (!response.body) throw new Error("Response body is null");

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		const assistantMessage: Message = {
			role: "assistant",
			content: "",
			tokens: 0,
			cost: 0,
			totalTokens: 0,
			totalCost: 0,
		};

		let inToolCallTag = false;
		let toolCallBuf = "";
		let inFencedJSON = false;
		let fencedBuf = "";
		let inRawJson = false;
		let rawJsonBuf = "";
		let rawJsonDepth = 0;
		let emittedToolCall = false;
		let preToolBuffer = "";

		const seenToolCalls = new Set<string>();
		const addToolCall = (name: string, args: unknown) => {
			const key = `${name}:${JSON.stringify(args ?? {})}`;
			if (seenToolCalls.has(key)) return false;
			seenToolCalls.add(key);
			if (!assistantMessage.tool_calls) assistantMessage.tool_calls = [];
			assistantMessage.tool_calls.push({
				id: "",
				type: "function",
				function: { name, arguments: JSON.stringify(args ?? {}) },
			});
			return true;
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

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					let parsed: unknown;
					try {
						parsed = JSON.parse(trimmed);
					} catch {
						continue;
					}

					if (!isRecord(parsed)) {
						continue;
					}
					const data = parsed as OllamaStreamChunk;

					const message = isRecord(data.message)
						? (data.message as OllamaChunkMessage)
						: undefined;

					if (message?.content !== undefined) {
						const piece = String(message.content);
						if (strict && !emittedToolCall) {
							preToolBuffer += piece;
							continue;
						}

						if (
							!emittedToolCall &&
							(inToolCallTag || piece.includes("<tool_call>"))
						) {
							inToolCallTag = true;
							toolCallBuf += piece;
							if (toolCallBuf.includes("</tool_call>")) {
								const m = toolCallBuf.match(
									/<tool_call>([\s\S]*?)<\/tool_call>/i,
								);
								const inner = (m?.[1] || "").trim();
								try {
									const obj = JSON.parse(inner);
									const name = obj?.name || obj?.function?.name;
									const args = obj?.arguments ?? obj?.function?.arguments ?? {};
									if (name && typeof name === "string") {
										if (addToolCall(name, args)) {
											yield ["", assistantMessage];
											emittedToolCall = true;
										}
									}
								} catch {}
								inToolCallTag = false;
								toolCallBuf = "";
							}
							continue;
						}

						const trimmed = piece.trim();

						if (!strict) {
							if (
								trimmed === "json" ||
								trimmed === "```" ||
								/^```json$/i.test(trimmed)
							) {
								continue;
							}
						}

						if (!strict && !inRawJson && trimmed === "{") {
							inRawJson = true;
							rawJsonBuf = piece;
							rawJsonDepth = 1;
							continue;
						}

						if (!strict && inRawJson) {
							rawJsonBuf += piece;
							for (const c of piece) {
								if (c === "{") rawJsonDepth++;
								if (c === "}") rawJsonDepth--;
							}
							if (rawJsonDepth <= 0) {
								const jsonText = rawJsonBuf.trim();
								try {
									const obj = JSON.parse(jsonText);
									const name =
										obj?.name || obj?.function?.name || obj?.function_name;
									const args =
										obj?.arguments ??
										obj?.function?.arguments ??
										obj?.args ??
										{};
									if (name && typeof name === "string") {
										if (name.toLowerCase() === "response") {
											const msg =
												(typeof args === "string" && args) ||
												(args && (args.message || args.text || args.content)) ||
												obj.response ||
												obj.message ||
												obj.text ||
												obj.content ||
												"";
											if (typeof msg === "string" && msg) {
												assistantMessage.content += msg;
												yield [msg, assistantMessage];
											}
										} else {
											if (!assistantMessage.tool_calls)
												assistantMessage.tool_calls = [];
											assistantMessage.tool_calls.push({
												id: "",
												type: "function",
												function: { name, arguments: JSON.stringify(args) },
											});
											yield ["", assistantMessage];
										}
									}
								} catch {}
								inRawJson = false;
								rawJsonBuf = "";
								rawJsonDepth = 0;
							}
							continue;
						}

						if (
							!strict &&
							!emittedToolCall &&
							trimmed.startsWith("{") &&
							/"name"\s*:\s*"/.test(trimmed) &&
							/"arguments"\s*:\s*[{[]/i.test(trimmed) &&
							!/"response"\s*:\s*"/i.test(trimmed)
						) {
							try {
								const obj = JSON.parse(trimmed);
								const name =
									obj?.name || obj?.function?.name || obj?.function_name;
								const args =
									obj?.arguments ?? obj?.function?.arguments ?? obj?.args ?? {};
								if (name && typeof name === "string") {
									if (name.toLowerCase() === "response") {
										const msg =
											(typeof args === "string" && args) ||
											(args && (args.message || args.text || args.content)) ||
											obj.response ||
											obj.message ||
											obj.text ||
											obj.content ||
											"";
										if (typeof msg === "string" && msg) {
											assistantMessage.content += msg;
											yield [msg, assistantMessage];
										}
									} else {
										if (addToolCall(name, args)) {
											yield ["", assistantMessage];
											emittedToolCall = true;
										}
									}
									continue;
								}
							} catch {
								inRawJson = true;
								rawJsonBuf = piece;
								rawJsonDepth = 0;
								for (const c of piece) {
									if (c === "{") rawJsonDepth++;
									if (c === "}") rawJsonDepth--;
								}
								continue;
							}
						}

						if (
							(inFencedJSON || /```(?:json)?/i.test(piece)) &&
							(emittedToolCall || !strict)
						) {
							inFencedJSON = true;
							fencedBuf += piece;
							if (/```/i.test(piece)) {
								const m = fencedBuf.match(/```(?:json)?\n([\s\S]*?)```/i);
								const inner = (m?.[1] || "").trim();
								try {
									const obj = JSON.parse(inner);
									const msg =
										obj?.response || obj?.message || obj?.text || obj?.content;
									if (typeof msg === "string" && msg) {
										assistantMessage.content += msg;
										yield [msg, assistantMessage];
									}
								} catch {}
								inFencedJSON = false;
								fencedBuf = "";
							}
							continue;
						}

						if (
							(emittedToolCall || !strict) &&
							trimmed.startsWith("{") &&
							/"response"\s*:\s*"/i.test(trimmed)
						) {
							try {
								const obj = JSON.parse(trimmed);
								if (obj && typeof obj.response === "string") {
									assistantMessage.content += obj.response;
									yield [obj.response, assistantMessage];
									continue;
								}
							} catch {
								if (emittedToolCall || !strict) {
									inRawJson = true;
									rawJsonBuf = piece;
									rawJsonDepth = 0;
									for (const c of piece) {
										if (c === "{") rawJsonDepth++;
										if (c === "}") rawJsonDepth--;
									}
									continue;
								}
							}
						}

						assistantMessage.content += piece;
						yield [piece, assistantMessage];
					}

					if (Array.isArray(message?.tool_calls) && !emittedToolCall) {
						for (const call of message.tool_calls) {
							const name = call.function?.name || "";
							const args = call.function?.arguments ?? {};
							addToolCall(name, args);
						}
						yield ["", assistantMessage];
						emittedToolCall = true;
					}

					if (data.done === true) {
						if (typeof data.prompt_eval_count === "number")
							promptTokens = data.prompt_eval_count;
						if (typeof data.eval_count === "number")
							completionTokens = data.eval_count;

						const totalTokens = promptTokens + completionTokens;
						assistantMessage.tokens = completionTokens;
						assistantMessage.totalTokens = totalTokens;
						assistantMessage.cost = 0;
						assistantMessage.totalCost = 0;

						if (
							!strict &&
							!emittedToolCall &&
							(!assistantMessage.tool_calls ||
								assistantMessage.tool_calls.length === 0) &&
							tools?.length
						) {
							const raw = (assistantMessage.content || "").trim();
							let jsonText = raw;
							const fence = jsonText.match(/```(?:json)?\n([\s\S]*?)```/i);
							if (fence?.[1]) jsonText = fence[1].trim();
							const tag = raw.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
							if (tag?.[1]) jsonText = tag[1].trim();
							try {
								const obj = JSON.parse(jsonText);
								const name = obj?.name || obj?.function?.name;
								const args = obj?.arguments ?? obj?.function?.arguments ?? {};
								if (name && typeof name === "string") {
									const match = tools.find((t) => t.name === name);
									if (match) {
										assistantMessage.tool_calls = [
											{
												id: "",
												type: "function",
												function: {
													name,
													arguments: JSON.stringify(args ?? {}),
												},
											},
										];
										assistantMessage.content = "";
										yield ["", assistantMessage];
										emittedToolCall = true;
									}
								}
							} catch {}
						}

						if (
							strict &&
							!emittedToolCall &&
							preToolBuffer.trim() &&
							tools?.length
						) {
							const raw = preToolBuffer.trim();
							let jsonText = raw;
							const fence = raw.match(/```(?:json)?\n([\s\S]*?)```/i);
							if (fence?.[1]) jsonText = fence[1].trim();
							try {
								const obj = JSON.parse(jsonText);
								const name =
									obj?.name || obj?.function?.name || obj?.function_name;
								const args =
									obj?.arguments ?? obj?.function?.arguments ?? obj?.args ?? {};
								if (name && typeof name === "string") {
									assistantMessage.tool_calls = [
										{
											id: "",
											type: "function",
											function: {
												name,
												arguments: JSON.stringify(args ?? {}),
											},
										},
									];
									assistantMessage.content = "";
									preToolBuffer = "";
									yield ["", assistantMessage];
									emittedToolCall = true;
								}
							} catch {}
						}

						if (assistantMessage.content?.trim().startsWith("{")) {
							const raw = assistantMessage.content.trim();
							let jsonText = raw;
							const fence = raw.match(/```(?:json)?\n([\s\S]*?)```/i);
							if (fence?.[1]) jsonText = fence[1].trim();
							try {
								const obj = JSON.parse(jsonText);
								if (
									obj &&
									typeof obj === "object" &&
									typeof obj.response === "string"
								) {
									assistantMessage.content = obj.response;
									yield [assistantMessage.content, assistantMessage];
								}
							} catch {}
						}

						if (strict && !emittedToolCall && preToolBuffer.trim()) {
							assistantMessage.content += preToolBuffer;
							preToolBuffer = "";
							yield [assistantMessage.content, assistantMessage];
						}
					}
				}
			}
		} finally {
			if (signal) (signal as AbortSignal).removeEventListener("abort", onAbort);
			try {
				reader.releaseLock();
			} catch {}
		}
	},
};
