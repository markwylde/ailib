import { useState } from "react";

interface ApiKeyFormProps {
	onSubmit: (apiKey: string) => void;
}

const ApiKeyForm: React.FC<ApiKeyFormProps> = ({ onSubmit }) => {
	const [apiKey, setApiKey] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (apiKey.trim()) {
			onSubmit(apiKey.trim());
		}
	};

	return (
		<div className="api-key-form">
			<h2>API Key Required</h2>
			<p>
				To use this demo, you need an OpenRouter API key. You can get one at{" "}
				<a
					href="https://openrouter.ai"
					target="_blank"
					rel="noopener noreferrer"
				>
					openrouter.ai
				</a>
			</p>
			<form onSubmit={handleSubmit}>
				<input
					type="password"
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					placeholder="Enter your OpenRouter API key"
				/>
				<button type="submit" disabled={!apiKey.trim()}>
					Save API Key
				</button>
			</form>
			<div className="note">
				<small>
					Your API key will be stored only in your browser's local storage and
					is not sent anywhere except to the OpenRouter API when making
					requests.
				</small>
			</div>
		</div>
	);
};

export default ApiKeyForm;
