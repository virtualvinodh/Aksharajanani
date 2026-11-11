import React from 'react';
import { useLocale } from '../contexts/LocaleContext';

const ErrorScreen: React.FC<{ error: Error; onRetry: () => void }> = ({ error, onRetry }) => {
    const { t } = useLocale();
    return (
        <div role="alert" className="min-h-screen flex items-center justify-center bg-white dark:bg-black p-6">
            <div className="max-w-md w-full text-center space-y-4">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('errorScreenTitle')}</h1>
                <p className="text-gray-600 dark:text-gray-400">{t('errorScreenMessage')}</p>
                <div className="flex justify-center gap-3">
                    <button onClick={onRetry} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
                        {t('errorScreenRetry')}
                    </button>
                    <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                        {t('errorScreenReload')}
                    </button>
                </div>
                <details className="text-left text-xs text-gray-500">
                    <summary className="cursor-pointer">{t('errorScreenDetails')}</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words">{error.message}</pre>
                </details>
            </div>
        </div>
    );
};

interface State { error: Error | null }

/**
 * Catches render errors anywhere below it, so one broken panel shows a recovery screen
 * instead of unmounting the whole app (a blank white page).
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Render error caught by ErrorBoundary:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
