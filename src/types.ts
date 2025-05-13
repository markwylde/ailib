import type { z } from "zod";

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
	role: Role;
	content: string;
	tool_call_id?: string;
	tool_calls?: ToolCall[];
}

export interface ToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface Tool {
	name: string;
	description: string;
	parameters: z.ZodType<unknown, z.ZodTypeDef>;
	handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface Provider {
	generateMessage: (options: {
		model: string;
		messages: Message[];
		tools?: Tool[];
		apiKey: string;
	}) => AsyncGenerator<[string, Message]>;
}

export type EventTypes = {
	state: "sent" | "receiving" | "completed" | "failed";
	data: [string, Message];
	end: undefined;
	error: Error;
};

export interface StreamEvents {
	on<K extends keyof EventTypes>(
		event: K,
		listener: (data: EventTypes[K]) => void,
	): this;
}

export interface ThreadOptions {
	provider: Provider;
	model: string;
	messages?: Message[];
	tools?: Tool[];
	apiKey: string;
}

export interface Thread {
	messages: {
		list: Message[];
		add: (message: Message) => void;
		remove: (message: Message) => void;
		generate: () => Promise<void> & StreamEvents;
	};
}
