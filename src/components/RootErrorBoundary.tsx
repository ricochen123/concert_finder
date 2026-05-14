import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Catches render/lifecycle errors so the page is not an empty dark shell
 * (users otherwise only see the app's background color).
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Concert Finder] Uncaught UI error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className="root-error-boundary">
          <h1 className="root-error-boundary-title">Something went wrong</h1>
          <p className="root-error-boundary-lead">
            The app hit an unexpected error while rendering. Your page background
            is dark, so failures often look like a &quot;black screen&quot; with no
            message unless this boundary is present.
          </p>
          <pre className="root-error-boundary-pre">{error.message}</pre>
          <p className="root-error-boundary-hint">
            Open the browser devtools console (F12) for the full stack trace. After
            fixing the code, save and refresh, or use reload below.
          </p>
          <button
            type="button"
            className="root-error-boundary-reload"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
