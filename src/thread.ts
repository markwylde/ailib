import Emittery from "emittery";
import {
	type EventTypes,
	type Message,
	StreamEvents,
	type Thread,
	type ThreadOptions,
	type ToolCall,
} from "./types.js";

export function createThread(options: ThreadOptions): Thread {
	const { provider, model, apiKey } = options;

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

				const promise = (async () => {
					try {
						emitter.emit("state", "sent");

						const stream = provider.generateMessage({
							model,
							messages,
							tools,
							apiKey,
						});

						emitter.emit("state", "receiving");

						let assistantMessage: Message | null = null;

						for await (const [chunk, message] of stream) {
							assistantMessage = message;
							emitter.emit("data", [chunk, message]);
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
								const args = JSON.parse(toolCall.function.arguments);
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
								});

								let newAssistantMessage: Message | null = null;

								for await (const [chunk, message] of newStream) {
									newAssistantMessage = message;
									emitter.emit("data", [chunk, message]);
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
				});

				return generate;
			},
		},
	};
}
