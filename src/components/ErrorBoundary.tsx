import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CoinBuddy application error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <main className="min-h-screen grid place-items-center bg-background p-6 text-center text-on-background"><div><h1 className="text-2xl font-bold">CoinBuddy needs to restart</h1><p className="mt-2 text-on-surface-variant">Your locally stored data has not been changed. Reload the app to continue.</p><button className="mt-6 rounded-xl bg-primary px-4 py-2 font-bold text-on-primary" onClick={() => window.location.reload()}>Reload app</button></div></main>;
    }
    return this.props.children;
  }
}
