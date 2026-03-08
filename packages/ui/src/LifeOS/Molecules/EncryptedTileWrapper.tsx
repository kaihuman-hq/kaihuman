import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { TileDef } from '../Layouts/MainApp';
import { passwordStore, unlockedFiles, decrypt, encrypt } from '@lifosy/core';
import { Lock, Unlock, AlertTriangle } from 'lucide-preact';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';

export interface EncryptedTileWrapperProps {
  tile: TileDef;
  onUnlocked?: (decryptedContent: string) => void;
  // Fallback renderer if we want to render the original children when unlocked.
  // Actually, MainApp might mount this directly and swap it out visually, 
  // but let's provide a cleaner interface where this Wrapper mounts the children.
  // Function as child to pass decrypted content down
  children?: (decryptedContent: string, handleEncryptedContentChange: (newDecryptedContent: string) => void) => preact.ComponentChildren;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_COLLAPSED' | 'MOBILE_EXPANDED';
}

export const EncryptedTileWrapper = ({ tile, onUnlocked, children, mode = 'SMALL' }: EncryptedTileWrapperProps) => {
  const password = useSignal('');
  const remember = useSignal(false);
  const error = useSignal<string | null>(null);
  const isDecrypting = useSignal(false);
  const decryptedContentState = useSignal<string | null>(null);
  const path = String(tile.id);
  
  // React to store changes (this ensures if another tile unlocks it, we know)
  const isUnlocked = unlockedFiles.value[path];

  const handleUnlock = async (e?: Event) => {
    if (e) e.preventDefault();
    if (!password.value) return;
    
    isDecrypting.value = true;
    error.value = null;
    try {
      const raw = tile.rawContent || '';
      
      let decrypted = '';
      if (raw.trim() === '') {
        decrypted = '';
      } else {
        decrypted = await decrypt(raw, password.value);
      }
      
      // Valid! Save password to store
      passwordStore.setPassword(path, password.value, remember.value);
      unlockedFiles.value = { ...unlockedFiles.value, [path]: true };
      decryptedContentState.value = decrypted;
      onUnlocked?.(decrypted);
    } catch (err) {
      console.error('Decryption error:', err);
      error.value = 'Incorrect password or corrupted file.';
    } finally {
      isDecrypting.value = false;
    }
  };

  // If already unlocked in the store, we should try decrypting automatically on mount
  useEffect(() => {
    if (isUnlocked && tile.rawContent !== undefined && tile.rawContent !== null) {
      const storedPw = passwordStore.getPassword(path);
      if (storedPw) {
         if (tile.rawContent.trim() === '') {
             decryptedContentState.value = '';
             onUnlocked?.('');
         } else {
             decrypt(tile.rawContent, storedPw).then(dec => {
                 decryptedContentState.value = dec;
                 onUnlocked?.(dec);
             }).catch(() => {
                 // Password was wrong or file corrupted? Clear it.
                 passwordStore.clearPassword(path);
             });
         }
      }
    }
  }, [isUnlocked, tile.rawContent, path]);

  let childFn: any = null;
  if (typeof children === 'function') {
    childFn = children;
  } else if (Array.isArray(children)) {
    childFn = (children as any[]).find((c: any) => typeof c === 'function');
  }

  // If unlocked and we have children to render (e.g. the actual widget)
  if (isUnlocked && childFn && decryptedContentState.value !== null) {
      const handleSave = async (newDecrypted: string) => {
          // Inner widget wants to save changes. We must encrypt them first.
          const storedPw = passwordStore.getPassword(path);
          if (!storedPw) throw new Error('Password lost during session');
          
          const newEncrypted = await encrypt(newDecrypted, storedPw);
          tile.onContentChange?.(newEncrypted);
          // Optimistically update our local decrypted state so the widget stays responsive
          decryptedContentState.value = newDecrypted;
      };
      return <>{childFn(decryptedContentState.value, handleSave)}</>;
  }

  // Render Lock Screen
  const isFocus = mode === 'FOCUS';
  
  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-[var(--los-bg)] text-[var(--los-fg)] flex-col gap-4">
      <div className={`flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[var(--los-border)] rounded-md ${isFocus ? 'max-w-md w-full' : 'w-full h-full'}`}>
        <div className="mb-4 text-[var(--los-muted)]">
          <Lock size={isFocus ? 48 : 24} />
        </div>
        {isFocus && <MonoHeader className="mb-2">Encrypted File</MonoHeader>}
        
        <form onSubmit={handleUnlock} className="flex flex-col items-center w-full gap-4">
          <input
            type="password"
            autoComplete="current-password"
            value={password.value}
            onInput={(e) => password.value = e.currentTarget.value}
            placeholder="Enter password..."
            className="w-full bg-[var(--los-bg)] border-b border-[var(--los-border)] py-2 text-center font-mono text-sm focus:outline-none focus:border-[var(--los-accent)]"
            disabled={isDecrypting.value}
          />
          
          {error.value && (
            <div className="text-red-500 text-xs flex items-center justify-center gap-1 animate-in zoom-in-95">
              <AlertTriangle size={12} />
              <span>{error.value}</span>
            </div>
          )}

          {isFocus && (
            <label className="flex items-center gap-2 cursor-pointer mt-2 group text-xs text-[var(--los-muted)]">
              <input
                type="checkbox"
                checked={remember.value}
                onChange={(e) => remember.value = e.currentTarget.checked}
                className="accent-[var(--los-accent)]"
              />
              <span className="group-hover:text-[var(--los-fg)] transition-colors">Remember Password</span>
            </label>
          )}

          <button
            type="submit"
            disabled={!password.value || isDecrypting.value}
            className="mt-2 w-full max-w-[200px] bg-[var(--los-accent)] text-black font-bold py-2 px-4 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-xs transition-colors"
          >
            {isDecrypting.value ? 'Decrypting...' : 'Unlock'}
            <Unlock size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};
