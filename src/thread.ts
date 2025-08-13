import Emittery from "emittery";
import type {
	EventTypes,
	Message,
	Thread,
	ThreadOptions,
	ToolCall,
} from "./types.js";

export function createThread(options: ThreadOptions): Thread {
	const { provider, model, apiKey, modelOptions } = options;

	const messages: Message[] = [...(options.messages || [])];
	const tools = options.tools || [];

	return {
		messages: {
			get list() {
				return [...messages];
			},

			add(message: Message) {
				messages.push(message);
			},

			remove(message: Message) {
				const index = messages.indexOf(message);
				if (index !== -1) {
					messages.splice(index, 1);
				}
			},

			generate() {
				const emitter = new Emittery<EventTypes>();
				const controller = new AbortController();

				const promise = (async () => {
					let assistantMessage: Message | null = null;
					try {
						emitter.emit("state", "sent");

						const stream = provider.generateMessage({
							model,
							messages,
							tools,
							apiKey,
							modelOptions,
							signal: controller.signal,
						});

						emitter.emit("state", "receiving");

						for await (const [chunk, message] of stream) {
							assistantMessage = message;

							// Check if this is a reasoning chunk by looking for the special marker
							if (chunk.startsWith("__REASONING__")) {
								// Extract the actual reasoning content
								const reasoningChunk = chunk.substring("__REASONING__".length);
								// Emit the reasoning event
								emitter.emit("reasoning", [reasoningChunk, message]);
							} else {
								// Regular content chunk
								emitter.emit("data", [chunk, message]);
							}
						}

						if (assistantMessage) {
							messages.push(assistantMessage);

							// Process tool calls if present
							if (
								assistantMessage.tool_calls &&
								assistantMessage.tool_calls.length > 0
							) {
								await processToolCalls(assistantMessage.tool_calls);
							}
						}

						emitter.emit("state", "completed");
						emitter.emit("end", undefined);
					} catch (error) {
						// If this was an intentional cancel/abort, treat it as a graceful end
						const errAny = error as { name?: string; message?: string };
						const isAbort =
							errAny?.name === "AbortError" ||
							(typeof errAny?.message === "string" &&
								/abort/i.test(errAny.message));

						if (isAbort) {
							// Persist any partial assistant message we have so far
							if (assistantMessage) {
								messages.push(assistantMessage);
							}
							emitter.emit("state", "completed");
							emitter.emit("end", undefined);
							return;
						}

						emitter.emit("state", "failed");
						emitter.emit(
							"error",
							error instanceof Error ? error : new Error(String(error)),
						);
						throw error;
					}
				})();

				async function processToolCalls(toolCalls: ToolCall[]) {
					for (const toolCall of toolCalls) {
						const tool = tools.find((t) => t.name === toolCall.function.name);

						if (tool) {
							try {
								const args =
									!toolCall.function.arguments ||
									toolCall.function.arguments === ""
										? {}
										: JSON.parse(toolCall.function.arguments);
								const result = await tool.handler(args);

								// Add tool response message
								messages.push({
									role: "tool",
									content: result,
									tool_call_id: toolCall.id,
								});

								// Generate a new assistant message with the tool result
								const newStream = provider.generateMessage({
									model,
									messages,
									tools,
									apiKey,
									modelOptions,
									signal: controller.signal,
								});

								let newAssistantMessage: Message | null = null;

								for await (const [chunk, message] of newStream) {
									newAssistantMessage = message;

									// Mirror top-level handling: route reasoning chunks
									if (
										typeof chunk === "string" &&
										chunk.startsWith("__REASONING__")
									) {
										const reasoningChunk = chunk.substring(
											"__REASONING__".length,
										);
										emitter.emit("reasoning", [reasoningChunk, message]);
									} else {
										emitter.emit("data", [chunk, message]);
									}
								}

								if (newAssistantMessage) {
									messages.push(newAssistantMessage);

									// Handle nested tool calls recursively
									if (
										newAssistantMessage.tool_calls &&
										newAssistantMessage.tool_calls.length > 0
									) {
										await processToolCalls(newAssistantMessage.tool_calls);
									}
								}
							} catch (error) {
								// Treat AbortError during tool processing as a clean cancellation
								if (error instanceof Error && error.name === "AbortError") {
									return; // stop processing further tool calls quietly
								}

								console.error(`Error executing tool ${tool.name}:`, error);
								messages.push({
									role: "tool",
									content: `Error: ${error instanceof Error ? error.message : String(error)}`,
									tool_call_id: toolCall.id,
								});
							}
						}
					}
				}

				// Add event listener method to the promise
				const generate = Object.assign(promise, {
					on: <K extends keyof EventTypes>(
						event: K,
						listener: (data: EventTypes[K]) => void,
					) => {
						emitter.on(event, listener);
						return generate;
					},
					cancel: () => {
						try {
							controller.abort();
						} catch {}
					},
				});

				return generate;
			},
		},
	};
}
