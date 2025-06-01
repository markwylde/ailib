import type { z } from "zod";

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
	role: Role;
	content: string;
	tool_call_id?: string;
	tool_calls?: ToolCall[];
	tokens?: number;
	cost?: number;
	totalTokens?: number;
	totalCost?: number;
	reasoning?: string;
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

export interface ResponseFormat {
	type: "json_schema";
	json_schema: {
		name: string;
		strict?: boolean;
		schema: {
			type: "object";
			properties: Record<string, unknown>;
			required?: string[];
			additionalProperties?: boolean;
		};
	};
}

export interface ModelOptions {
	temperature?: number;
	max_tokens?: number;
	seed?: number;
	top_p?: number;
	top_k?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	repetition_penalty?: number;
	min_p?: number;
	top_a?: number;
	reasoning?: {
		enabled?: boolean;
		include?: boolean;
		include_output?: boolean;
	};
	usage?: {
		include?: boolean;
	};
	provider?: {
		order?: string[];
		allow_fallbacks?: boolean;
		require_parameters?: boolean;
		data_collection?: "allow" | "deny";
		only?: string[];
		ignore?: string[];
		quantizations?: string[];
		sort?: "price" | "throughput";
		max_price?: {
			[key: string]: unknown;
		};
	};
	models?: string[];
	transforms?: string[];
	logit_bias?: Record<string, number>;
	top_logprobs?: number;
	response_format?: ResponseFormat;
}

export interface Provider {
	generateMessage: (options: {
		model: string;
		messages: Message[];
		tools?: Tool[];
		apiKey: string;
		modelOptions?: ModelOptions;
	}) => AsyncGenerator<[string, Message]>;
}

export type EventTypes = {
	state: "sent" | "receiving" | "completed" | "failed";
	data: [string, Message];
	reasoning: [string, Message];
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
	modelOptions?: ModelOptions;
}

export interface Thread {
	messages: {
		list: Message[];
		add: (message: Message) => void;
		remove: (message: Message) => void;
		generate: () => Promise<void> & StreamEvents;
	};
}
