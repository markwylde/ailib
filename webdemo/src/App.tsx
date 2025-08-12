import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/atom-one-dark.css";
import ApiKeyForm from "./components/ApiKeyForm";
import { type ChatMessage, getMessages, sendMessage } from "./services/ai";

function App() {
	const [inputText, setInputText] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [currentAssistantMessage, setCurrentAssistantMessage] = useState("");
	const [currentReasoning, setCurrentReasoning] = useState("");
	const [isCurrentReasoningCollapsed, setIsCurrentReasoningCollapsed] =
		useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [apiKey, setApiKey] = useState<string | null>(
		localStorage.getItem("openrouter_api_key"),
	);
	const [apiKeyError, setApiKeyError] = useState<string | null>(null);
	const [collapsedReasonings, setCollapsedReasonings] = useState<
		Record<string, boolean>
	>({});
	const [isMarkdownEnabled, setIsMarkdownEnabled] = useState(true);
	const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
		null,
	);
	const [editingContent, setEditingContent] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Load initial messages
	useEffect(() => {
		if (apiKey) {
			const loadedMessages = getMessages().filter(
				(msg) => msg.role !== "system",
			);
			setMessages(loadedMessages);

			// Ensure all reasonings are expanded by default
			const initialCollapsedState: Record<string, boolean> = {};
			loadedMessages.forEach((_, index) => {
				initialCollapsedState[index.toString()] = false;
			});
			setCollapsedReasonings(initialCollapsedState);
		}
	}, [apiKey]);

	const scrollTrigger = `${messages.length}-${currentAssistantMessage.length}-${currentReasoning.length}`;

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		void scrollTrigger;
	}, [scrollTrigger]);

	const handleApiKeySubmit = (key: string) => {
		localStorage.setItem("openrouter_api_key", key);
		setApiKey(key);
		window.location.reload(); // Reload to reinitialize with the new API key
	};

	const toggleReasoning = (index: number) => {
		setCollapsedReasonings((prev) => ({
			...prev,
			[index.toString()]: !prev[index.toString()],
		}));
	};

	const isReasoningCollapsed = (index: number): boolean => {
		return collapsedReasonings[index.toString()] || false;
	};

	const toggleCurrentReasoning = () => {
		setIsCurrentReasoningCollapsed((prev) => !prev);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!inputText.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			role: "user",
			content: inputText,
			id: crypto.randomUUID(),
		};
		setMessages((prevMessages) => [...prevMessages, userMessage]);
		setInputText("");
		setIsLoading(true);
		setCurrentAssistantMessage("");
		setCurrentReasoning("");
		setIsCurrentReasoningCollapsed(false);
		setApiKeyError(null);

		try {
			// Call AI service with callbacks for both content and reasoning
			await sendMessage(
				userMessage.content,
				(chunk) => {
					setCurrentAssistantMessage((prev) => prev + chunk);
				},
				(reasoningChunk) => {
					setCurrentReasoning((prev) => prev + reasoningChunk);
				},
			);

			// Add complete assistant message to the messages list with reasoning
			const updatedMessages = getMessages().filter(
				(msg) => msg.role !== "system",
			);
			setMessages(updatedMessages);

			// Ensure the new message's reasoning is expanded by default
			setCollapsedReasonings((prev) => ({
				...prev,
				[(updatedMessages.length - 1).toString()]: false,
			}));

			setCurrentAssistantMessage("");
			setCurrentReasoning("");
		} catch (error: unknown) {
			console.error("Error sending message:", error);

			if (error instanceof Error && error.message.includes("API key")) {
				setApiKeyError(error.message);
				setApiKey(null);
				localStorage.removeItem("openrouter_api_key");
			} else {
				setCurrentAssistantMessage(
					"Sorry, there was an error processing your request.",
				);
			}
		} finally {
			setIsLoading(false);
		}
	};

	// Render a placeholder message if reasoning is missing
	const getReasoningContent = (message: ChatMessage): string => {
		if (message.reasoning) {
			return message.reasoning;
		}
		return "No reasoning available for this message.";
	};

	// Define the components to be rendered
	const MarkdownContent = ({ children }: { children: string }) => (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			rehypePlugins={[
				rehypeRaw,
				rehypeSanitize,
				rehypeHighlight,
				rehypeSlug,
				[
					rehypeExternalLinks,
					{ target: "_blank", rel: ["nofollow", "noopener", "noreferrer"] },
				],
			]}
			components={{
				// Override how list items render
				li: ({
					className,
					...props
				}: {
					className?: string;
					ordered?: boolean;
				} & React.ComponentPropsWithoutRef<"li">) => {
					const listItemClass = `custom-list-item ${props.ordered ? "ordered" : "unordered"} ${className || ""}`;

					if (props.ordered) {
						return (
							<li
								className={listItemClass}
								style={{ color: "var(--list-number-color)" }}
								{...props}
							/>
						);
					}

					return <li className={listItemClass} {...props} />;
				},
				// Override how unordered lists render
				ul: ({ className, ...props }) => (
					<ul className={`custom-ul ${className || ""}`} {...props} />
				),
				// Override how ordered lists render
				ol: ({ className, ...props }) => (
					<ol className={`custom-ol ${className || ""}`} {...props} />
				),
				// Override h3 for proper styling
				h3: ({ ...props }) => <h3 className="custom-h3" {...props} />,
				// Better code handling
				code: ({
					className,
					children,
					...props
				}: React.ComponentPropsWithoutRef<"code">) => {
					return (
						<code className={className} {...props}>
							{children}
						</code>
					);
				},
			}}
		>
			{children}
		</ReactMarkdown>
	);

	const handleEditMessage = (index: number) => {
		setEditingMessageIndex(index);
		setEditingContent(messages[index].content);
	};

	const handleSaveEdit = () => {
		if (editingMessageIndex !== null) {
			const updatedMessages = [...messages];
			updatedMessages[editingMessageIndex] = {
				...updatedMessages[editingMessageIndex],
				content: editingContent,
			};
			setMessages(updatedMessages);

			// Save to localStorage
			try {
				localStorage.setItem("chat_messages", JSON.stringify(updatedMessages));
			} catch (e) {
				console.warn("Could not save edited message to localStorage", e);
			}

			setEditingMessageIndex(null);
			setEditingContent("");
		}
	};

	const handleCancelEdit = () => {
		setEditingMessageIndex(null);
		setEditingContent("");
	};

	if (!apiKey) {
		return (
			<div className="chat-container">
				<header>
					<h1>AI Chat Demo</h1>
				</header>
				<div className="api-key-container">
					{apiKeyError && <div className="error-message">{apiKeyError}</div>}
					<ApiKeyForm onSubmit={handleApiKeySubmit} />
				</div>
			</div>
		);
	}

	return (
		<div className="chat-container">
			<header>
				<h1>AI Chat Demo</h1>
				<div className="markdown-toggle">
					<label>
						<input
							type="checkbox"
							checked={isMarkdownEnabled}
							onChange={(e) => setIsMarkdownEnabled(e.target.checked)}
						/>
						Enable Markdown
					</label>
				</div>
			</header>

			<div className="messages-container">
				{messages.map((message) => (
					<div key={message.id} className={`message ${message.role}`}>
						{message.role === "assistant" && (
							<div className="reasoning-wrapper">
								<button
									type="button"
									className="reasoning-toggle"
									onClick={() => toggleReasoning(messages.indexOf(message))}
								>
									{isReasoningCollapsed(messages.indexOf(message))
										? "▶ Show Reasoning"
										: "▼ Hide Reasoning"}
								</button>
								{!isReasoningCollapsed(messages.indexOf(message)) && (
									<div className="reasoning-content">
										{isMarkdownEnabled ? (
											<MarkdownContent>
												{getReasoningContent(message)}
											</MarkdownContent>
										) : (
											<pre>{getReasoningContent(message)}</pre>
										)}
									</div>
								)}
							</div>
						)}
						<div className="message-content">
							{editingMessageIndex === messages.indexOf(message) ? (
								<div className="edit-container">
									<textarea
										value={editingContent}
										onChange={(e) => setEditingContent(e.target.value)}
										className="edit-textarea"
									/>
									<div className="edit-buttons">
										<button
											type="button"
											onClick={handleSaveEdit}
											className="save-button"
										>
											Save
										</button>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="cancel-button"
										>
											Cancel
										</button>
									</div>
								</div>
							) : (
								<>
									{isMarkdownEnabled ? (
										<MarkdownContent>{message.content}</MarkdownContent>
									) : (
										<pre className="plain-text">{message.content}</pre>
									)}
									{!isMarkdownEnabled && (
										<button
											type="button"
											className="edit-button"
											onClick={() =>
												handleEditMessage(messages.indexOf(message))
											}
										>
											Edit
										</button>
									)}
								</>
							)}
						</div>
					</div>
				))}

				{(currentReasoning || currentAssistantMessage) && (
					<div className="message assistant">
						{currentReasoning || currentAssistantMessage ? (
							<div className="reasoning-wrapper">
								<button
									type="button"
									className="reasoning-toggle"
									onClick={toggleCurrentReasoning}
								>
									{isCurrentReasoningCollapsed
										? "▶ Show Reasoning"
										: "▼ Hide Reasoning"}
								</button>
								{!isCurrentReasoningCollapsed && (
									<div className="reasoning-content">
										{isMarkdownEnabled ? (
											<MarkdownContent>
												{currentReasoning || "Thinking..."}
											</MarkdownContent>
										) : (
											<pre>{currentReasoning || "Thinking..."}</pre>
										)}
									</div>
								)}
							</div>
						) : null}
						{currentAssistantMessage && (
							<div className="message-content">
								{isMarkdownEnabled ? (
									<MarkdownContent>{currentAssistantMessage}</MarkdownContent>
								) : (
									<pre className="plain-text">{currentAssistantMessage}</pre>
								)}
							</div>
						)}
					</div>
				)}

				{isLoading && !currentAssistantMessage && !currentReasoning && (
					<div className="message assistant">
						<div className="message-content">
							<div className="loading-indicator">
								<div className="dot"></div>
								<div className="dot"></div>
								<div className="dot"></div>
							</div>
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			<form onSubmit={handleSubmit} className="input-form">
				<input
					type="text"
					value={inputText}
					onChange={(e) => setInputText(e.target.value)}
					placeholder="Type your message here..."
					disabled={isLoading}
				/>
				<button type="submit" disabled={isLoading || !inputText.trim()}>
					Send
				</button>
			</form>
		</div>
	);
}

export default App;
