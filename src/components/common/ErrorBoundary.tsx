import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-200">
          <h1 className="text-xl font-bold text-red-400 forced-colors:text-[CanvasText]">Something went wrong</h1>
          <p className="text-sm text-slate-400">{this.state.error?.message}</p>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
