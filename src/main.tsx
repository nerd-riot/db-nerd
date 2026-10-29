import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppStore } from "./stores/useAppStore";

import { recordCrashReport, getPersistedCrashReports, clearPersistedCrashReports } from "./lib";

if (typeof window !== "undefined") {
  (window as any).__appStore = useAppStore;
  (window as any).__dbnerd_get_crash_reports = getPersistedCrashReports;
  (window as any).__dbnerd_clear_crash_reports = clearPersistedCrashReports;

  window.addEventListener("error", (event) => {
    console.error("Global window.onerror captured:", event.error || event.message);
    recordCrashReport('error', event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Global unhandledrejection captured:", event.reason);
    recordCrashReport('unhandledrejection', event.reason);
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

