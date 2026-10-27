import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unbehandelter Anwendungsfehler", error, info.componentStack);
    void window.desktop?.reportDiagnostic?.(
      "react-error",
      error.message,
      `${error.stack || ""}\n${info.componentStack || ""}`,
    );
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <AlertTriangle />
        <h1>Gemeinde Stream muss neu geladen werden</h1>
        <p>Ein unerwarteter Fehler hat die Oberfläche angehalten. Laufende Aufnahmen bleiben soweit möglich erhalten.</p>
        <details><summary>Technische Information</summary><code>{this.state.error.message}</code></details>
        <button className="primary compact" onClick={() => window.location.reload()}>Anwendung neu laden</button>
      </main>
    );
  }
}
