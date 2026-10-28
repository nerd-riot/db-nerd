import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppStore } from "./stores/useAppStore";

if (typeof window !== "undefined") {
  (window as any).__appStore = useAppStore;

  window.addEventListener("error", (event) => {
    console.error("Global window.onerror captured:", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Global unhandledrejection captured:", event.reason);
  });
}

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

