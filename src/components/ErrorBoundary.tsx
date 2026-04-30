import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  errorMessage: string | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { errorMessage: error.message || "The app hit an unexpected error." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("HiveMind runtime error", error, info);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <main className="app-main">
          <div className="page">
            <div className="feed-status feed-status--error">
              HiveMind could not finish loading. Please refresh the page.
              <br />
              <span>{this.state.errorMessage}</span>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
