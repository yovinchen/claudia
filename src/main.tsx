import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AnalyticsErrorBoundary } from "./components/AnalyticsErrorBoundary";
import { analytics, resourceMonitor } from "./lib/analytics";
import { PostHogProvider } from "posthog-js/react";
import { loader } from "@monaco-editor/react";
import "./lib/i18n"; // 初始化国际化
import "./assets/shimmer.css";
import "./styles.css";

// Configure Monaco loader to use local assets (copied to /public/monaco/vs)
try {
  loader.config({ paths: { vs: "/monaco/vs" } });
} catch (e) {
  console.error("[Monaco] loader.config failed:", e);
}

// 全局捕获未处理的Promise拒绝，防止Monaco Editor错误
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error && (error.message || error.toString()).includes('URL is not valid')) {
    event.preventDefault();
  }
});

// 全局捕获window.onerror
window.addEventListener('error', (event) => {
  if (event.error && (event.error.message || event.error.toString()).includes('URL is not valid')) {
    event.preventDefault();
    return true;
  }
});

// Initialize analytics before rendering (will no-op if no consent or no key)
analytics.initialize();

// Start resource monitoring (check every 2 minutes)
resourceMonitor.startMonitoring(120000);

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const posthogKey = (import.meta as any).env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;

if (posthogKey) {
  root.render(
    <React.StrictMode>
      <PostHogProvider
        apiKey={posthogKey}
        options={{
          api_host: (import.meta as any).env.VITE_PUBLIC_POSTHOG_HOST,
          capture_exceptions: true,
          debug: import.meta.env.MODE === "development",
        }}
      >
        <ErrorBoundary>
          <AnalyticsErrorBoundary>
            <App />
          </AnalyticsErrorBoundary>
        </ErrorBoundary>
      </PostHogProvider>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <AnalyticsErrorBoundary>
          <App />
        </AnalyticsErrorBoundary>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
