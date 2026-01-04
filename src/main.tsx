/**
 * REACTOR UI - Entry Point
 * Production-ready React 18 initialization
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Error boundary for production
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ERROR BOUNDARY]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "#0a0e0a",
            color: "#00ff00",
            fontFamily: "monospace",
            padding: 20,
          }}
        >
          <div style={{ maxWidth: 600, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, marginBottom: 16 }}>⚠ REACTOR ERROR</h1>
            <p style={{ fontSize: 14, marginBottom: 12, opacity: 0.8 }}>
              {this.state.error?.message || "Unknown error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "linear-gradient(135deg, #00ff00, #00cc00)",
                border: "none",
                color: "#000",
                padding: "10px 20px",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              RELOAD
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Mount React app
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
