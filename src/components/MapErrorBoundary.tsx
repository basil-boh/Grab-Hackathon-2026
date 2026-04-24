import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: string | null;
};

export class MapErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error.message : "Map rendering failed",
    };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-slate-200">
          <div className="max-w-md rounded-lg bg-white p-5 text-slate-900 shadow-panel">
            <p className="font-semibold">Map failed</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{this.state.error}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
