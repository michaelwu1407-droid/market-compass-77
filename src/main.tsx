import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Helpful in local dev when the UI hits an ErrorBoundary.
// Keeps diagnostics visible in the console.
if (import.meta.env.DEV) {
	window.addEventListener('error', (event) => {
		console.error('[window.onerror]', event.error || event.message);
	});
	window.addEventListener('unhandledrejection', (event) => {
		console.error('[unhandledrejection]', event.reason);
	});
}

createRoot(document.getElementById("root")!).render(<App />);
