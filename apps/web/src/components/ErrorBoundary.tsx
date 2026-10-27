import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** What to show instead of the broken part; gets a way to try rendering again. */
  fallback: (retry: () => void) => ReactNode;
  children: ReactNode;
}

/**
 * Contains a rendering error to the part of the screen that failed: one
 * broken page of a book never takes the rest of the book (or the app) with it.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Rendering failed:', error, info.componentStack);
  }

  override render() {
    return this.state.failed
      ? this.props.fallback(() => this.setState({ failed: false }))
      : this.props.children;
  }
}
