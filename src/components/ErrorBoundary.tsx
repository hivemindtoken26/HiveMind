import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  errorMessage: string | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { errorMessage: null };

  static getDerivedStateFromError(): State {
    return { errorMessage: "generic" };
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
              Something went wrong while loading this screen. Please refresh the page and try again.
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
