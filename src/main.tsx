import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initTelegramWebApp } from "./hooks/useTelegramWebApp";

// Initialize Telegram Mini App (no-op outside Telegram)
initTelegramWebApp();

createRoot(document.getElementById("root")!).render(<App />);
