import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { FeedbackProvider } from "./components/FeedbackProvider";
import "./styles.css";

window.addEventListener("error", (event) => {
  void window.desktop?.reportDiagnostic?.(
    "window-error",
    event.message || "Unbekannter Oberflächenfehler",
    event.error instanceof Error ? event.error.stack : "",
  );
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  void window.desktop?.reportDiagnostic?.(
    "unhandled-rejection",
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? reason.stack : "",
  );
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
