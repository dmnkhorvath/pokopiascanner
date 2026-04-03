import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center">
          <span className="text-6xl">😵</span>
          <h2 className="text-2xl font-bold text-error">Something went wrong</h2>
          <p className="text-base-content/60 max-w-md">
            An unexpected error occurred. Please try reloading the page.
          </p>
          <button className="btn btn-primary" onClick={this.handleReload}>
            🔄 Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
