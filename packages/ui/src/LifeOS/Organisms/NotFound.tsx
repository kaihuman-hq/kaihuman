import { AlertTriangle } from 'lucide-preact';
import { MonoHeader, MonoText } from '../Atoms/Typography';

export const NotFound = ({ onGoHome }: { onGoHome?: () => void }) => {
  const handleHome = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      // Fallback for when used as top-level route
      if (typeof window !== 'undefined') {
        // Force a hard navigation to reset state if needed, or just pushState if we trust the router
        window.location.href = '/';
      }
    }
  };

  return (
    <div className="h-full w-full min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-4 animate-in fade-in duration-500 bg-[var(--los-bg)]">
      <div className="w-16 h-16 rounded-full bg-[var(--los-accent)]/10 flex items-center justify-center text-[var(--los-accent)] mb-4">
        <AlertTriangle size={32} />
      </div>
      <MonoHeader className="text-2xl text-[var(--los-fg)]">404: SIGNAL LOST</MonoHeader>
      <MonoText className="text-[var(--los-muted)] max-w-md">
        The requested frequency location could not be established. The tile or directory you are
        looking for may have been moved or deleted.
      </MonoText>

      <button
        type="button"
        onClick={handleHome}
        className="mt-8 px-6 py-2 border border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)] transition-colors font-mono text-sm tracking-wider uppercase cursor-pointer"
      >
        Return to Dashboard
      </button>
    </div>
  );
};
