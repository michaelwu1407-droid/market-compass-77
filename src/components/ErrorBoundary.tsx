import { Component } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
  errorInfo?: string;
};

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join('\n');
  }
  try {
    return typeof error === 'string' ? error : JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    // Keep logging minimal but useful.
    // This prevents a fully blank screen when a render-time error happens.
    console.error('[ErrorBoundary] Uncaught UI error', error);

    // In dev, keep enough context to self-diagnose quickly.
    const info =
      (errorInfo && typeof errorInfo === 'object' && 'componentStack' in (errorInfo as any))
        ? String((errorInfo as any).componentStack || '')
        : '';
    this.setState({ error, errorInfo: info });
  }

  render() {
    if (this.state.hasError) {
      const details = [
        this.state.error ? formatUnknownError(this.state.error) : '',
        this.state.errorInfo ? `\nComponent stack:${this.state.errorInfo}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-3">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The page hit an unexpected error. Reload to try again.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => window.location.reload()}>Reload</Button>
              {import.meta.env.DEV && details ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(details);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Copy error
                </Button>
              ) : null}
            </div>

            {import.meta.env.DEV && details ? (
              <pre className="text-left text-xs whitespace-pre-wrap rounded-md border p-3 overflow-auto max-h-80">
                {details}
              </pre>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
