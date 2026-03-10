import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { TileDef } from '../Layouts/MainApp';
import { passwordStore, unlockedFiles, decrypt, encrypt, githubFileStore, Logger } from '@lifosy/core';

const logger = new Logger('EncryptedTile');
import { Lock, Unlock, AlertTriangle, Loader2 } from 'lucide-preact';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';

export interface EncryptedTileWrapperProps {
  tile: TileDef;
  onUnlocked?: (decryptedContent: string) => void;
  // Fallback renderer if we want to render the original children when unlocked.
  children?: (decryptedContent: string, handleEncryptedContentChange: (newDecryptedContent: string) => void) => preact.ComponentChildren;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_COLLAPSED' | 'MOBILE_EXPANDED';
}

type FlowState = 
  | { status: 'LOADING' } 
  | { status: 'LOCKED'; error?: string }
  | { status: 'DECRYPTING' }
  | { status: 'UNLOCKED'; content: string };

export const EncryptedTileWrapper = ({ tile, onUnlocked, children, mode = 'SMALL' }: EncryptedTileWrapperProps) => {
  const password = useSignal('');
  const remember = useSignal(false);
  
  // Use a local state signal to represent the precise FSM status of this specific wrapper instance.
  // Default to LOADING if we haven't received rawContent from the network yet.
  const flow = useSignal<FlowState>({ status: 'LOADING' });
  const path = String(tile.id);
  
  // React to store changes (this ensures if another tile unlocks it, we know)
  const isGlobalUnlocked = unlockedFiles.value[path];

  // Ensure the file content is loaded. The parent component (FocusedTileInternal, dashboard grid)
  // provides rawContent from the file store, but nobody calls openFile for encrypted files in
  // focus mode. Without this, EncryptedTileWrapper stays stuck in LOADING forever.
  useEffect(() => {
    if (tile.rawContent === undefined) {
      githubFileStore.openFile(path);
    }
  }, [path, tile.rawContent]);

  // FSM Transition: Raw content fetched from GitHub
  useEffect(() => {
    // Don't transition until we actually have content to decrypt.
    // rawContent is undefined both before the file is requested AND while it is loading.
    // Transitioning early (with undefined content) would cause the DECRYPTING effect to run
    // against an empty string, fail, and incorrectly clear any stored password.
    if (tile.rawContent === undefined) {
      if (flow.value.status !== 'LOADING') {
        flow.value = { status: 'LOADING' };
      }
      return;
    }

    if (flow.value.status === 'LOADING') {
      if (isGlobalUnlocked || passwordStore.getPassword(path)) {
        flow.value = { status: 'DECRYPTING' };
      } else {
        flow.value = { status: 'LOCKED' };
      }
    }
  }, [tile.rawContent, isGlobalUnlocked, path, flow.value.status]);

  // FSM Transition: Attempting Auto-Decrypt
  useEffect(() => {
    if (flow.value.status === 'DECRYPTING') {
      // Never attempt decryption without actual content — this prevents clearing stored passwords
      // when the file hasn't been fetched yet.
      if (tile.rawContent === undefined) return;

      const storedPw = passwordStore.getPassword(path);
      const activePw = storedPw || password.value;

      if (!activePw) {
         flow.value = { status: 'LOCKED' };
         return;
      }

      decrypt(tile.rawContent, activePw).then(dec => {
          flow.value = { status: 'UNLOCKED', content: dec };
          onUnlocked?.(dec);
          if (password.value) passwordStore.setPassword(path, password.value, remember.value);
      }).catch((err) => {
          logger.error('Decryption failed for ' + path, err);
          if (storedPw) passwordStore.clearPassword(path);
          flow.value = { status: 'LOCKED', error: 'Incorrect password or corrupted file.' };
      });
    }
  }, [flow.value.status, tile.rawContent, path]);

  const handleManualSubmit = (e: Event) => {
    e.preventDefault();
    if (!password.value) return;
    if (tile.rawContent === undefined) return; // Cannot decrypt without content

    flow.value = { status: 'DECRYPTING' };
  };

  let childFn: any = null;
  if (typeof children === 'function') {
    childFn = children;
  } else if (Array.isArray(children)) {
    childFn = (children as any[]).find((c: any) => typeof c === 'function');
  }

  // Render: Unlocked Flow
  if (flow.value.status === 'UNLOCKED' && childFn) {
      const handleSave = async (newDecrypted: string) => {
          try {
            // Inner widget wants to save changes. We must encrypt them first.
            const storedPw = passwordStore.getPassword(path);
            if (!storedPw) throw new Error('Password lost during session');
            
            const newEncrypted = await encrypt(newDecrypted, storedPw);
            tile.onContentChange?.(newEncrypted);
            
            // Optimistically update our local FSM
            flow.value = { status: 'UNLOCKED', content: newDecrypted };
          } catch (e: any) {
            logger.error('Failed to save encrypted file', e);
          }
      };
      
      return <>{childFn(flow.value.content, handleSave)}</>;
  }

  // Render: Lock Screen & Loading
  const isFocus = mode === 'FOCUS';
  const stateStatus = flow.value.status;
  const isPending = stateStatus === 'LOADING' || stateStatus === 'DECRYPTING';
  
  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-[var(--los-bg)] text-[var(--los-fg)] flex-col gap-4">
      <div className={`flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[var(--los-border)] rounded-md ${isFocus ? 'max-w-md w-full' : 'w-full h-full'}`}>
        <div className="mb-4 text-[var(--los-muted)]">
          {isPending ? <Loader2 size={isFocus ? 48 : 24} className="animate-spin" /> : <Lock size={isFocus ? 48 : 24} />}
        </div>
        
        {isFocus && <MonoHeader className="mb-2">Encrypted File</MonoHeader>}
        {stateStatus === 'LOADING' && <MonoText className="text-[var(--los-muted)] mb-4">Fetching content...</MonoText>}
        
        <form onSubmit={handleManualSubmit} className="flex flex-col items-center w-full gap-4">
          <input
            type="password"
            autoComplete="current-password"
            value={password.value}
            onInput={(e) => password.value = e.currentTarget.value}
            placeholder="Enter password..."
            className="w-full bg-[var(--los-bg)] border-b border-[var(--los-border)] py-2 text-center font-mono text-sm focus:outline-none focus:border-[var(--los-accent)]"
            disabled={isPending}
          />
          
          {stateStatus === 'LOCKED' && flow.value.error && (
            <div className="text-red-500 text-xs flex items-center justify-center gap-1 animate-in zoom-in-95">
              <AlertTriangle size={12} />
              <span>{flow.value.error}</span>
            </div>
          )}

          {isFocus && (
            <label className={`flex items-center gap-2 cursor-pointer mt-2 group text-xs text-[var(--los-muted)] ${isPending && 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={remember.value}
                onChange={(e) => remember.value = e.currentTarget.checked}
                className="accent-[var(--los-accent)]"
                disabled={isPending}
              />
              <span className="group-hover:text-[var(--los-fg)] transition-colors">Remember Password</span>
            </label>
          )}

          <button
            type="submit"
            disabled={!password.value || isPending}
            className="mt-2 w-full max-w-[200px] bg-[var(--los-accent)] text-black font-bold py-2 px-4 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-xs transition-colors"
          >
            {stateStatus === 'DECRYPTING' ? 'Decrypting...' : 'Unlock'}
            <Unlock size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};
