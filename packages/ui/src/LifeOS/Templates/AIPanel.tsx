import { type AIProvider, aiStore } from '@kaihuman/core';
import { Bot, Loader2, MessageSquare, Send, Trash2, User, X } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoLabel, MonoText } from '../Atoms/Typography';

export const AIPanel = () => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSend = () => {
    if (!input.trim() || aiStore.isTyping.value) return;
    aiStore.sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!aiStore.isPanelOpen.value) return null;

  return (
    <div className="fixed top-0 right-0 bottom-12 w-full md:w-[400px] bg-[var(--los-bg)] border-l border-[var(--los-border)] shadow-2xl z-[900] flex flex-col transform transition-transform duration-300 ease-spring pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--los-border)] bg-[var(--los-bg-hover)]">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-[var(--los-accent)]" />
          <MonoText className="font-bold text-sm">LifeOS Copilot</MonoText>
        </div>

        <div className="flex items-center gap-3">
          {/* Provider Select */}
          <select
            className="bg-transparent border border-[var(--los-border)] rounded px-2 py-1 text-[10px] font-mono text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)]"
            value={aiStore.activeProvider.value}
            onChange={(e) =>
              aiStore.setProvider((e.target as HTMLSelectElement).value as AIProvider)
            }
          >
            <option value="copilot" className="bg-[var(--los-bg)]">
              Copilot
            </option>
            <option value="claude" className="bg-[var(--los-bg)]">
              Claude
            </option>
            <option value="gemini" className="bg-[var(--los-bg)]">
              Gemini
            </option>
          </select>

          <button
            type="button"
            onClick={() => aiStore.clearHistory()}
            className="text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors p-1"
            title="Clear Chat"
          >
            <Trash2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => aiStore.togglePanel()}
            className="text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {aiStore.history.value.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--los-muted)] opacity-50 space-y-4">
            <MessageSquare size={32} />
            <MonoText className="text-xs text-center max-w-[250px]">
              Ask a question to your local AI. CLI commands will be executed locally on your
              machine.
            </MonoText>
          </div>
        ) : (
          aiStore.history.value.map((msg, idx) => (
            <div
              key={msg.id || idx}
              className={cn(
                'flex gap-3 max-w-[90%]',
                msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
              )}
            >
              <div className="shrink-0 mt-1">
                {msg.role === 'user' ? (
                  <User size={14} className="text-[var(--los-muted)]" />
                ) : (
                  <Bot size={14} className="text-[var(--los-accent)]" />
                )}
              </div>
              <div
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-mono whitespace-pre-wrap flex-1 min-w-0 border',
                  msg.role === 'user'
                    ? 'bg-[var(--los-bg-hover)] border-[var(--los-border)] text-right'
                    : 'bg-transparent border-transparent text-left',
                )}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {aiStore.isTyping.value && (
          <div className="flex gap-3 max-w-[90%] mr-auto items-center text-[var(--los-muted)]">
            <Loader2 size={14} className="animate-spin" />
            <MonoText className="text-[10px] animate-pulse">
              Running {aiStore.activeProvider.value} CLI...
            </MonoText>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-[var(--los-border)] bg-[var(--los-bg)]">
        {!aiStore.isConnected.value ? (
          <div className="w-full bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex flex-col items-center justify-center space-y-3">
            <MonoText className="text-xs text-red-400 text-center font-bold">
              AI Server Disconnected
            </MonoText>
            <MonoText className="text-[10px] text-red-400/70 text-center">
              Please ensure the local CLI is running (`cargo run -- server`).
            </MonoText>
            <button
              type="button"
              onClick={() => aiStore.checkConnection()} // Re-run the health check without toggling panel
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs font-bold transition-colors"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            <div className="relative group">
              <textarea
                value={input}
                onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything... (Hit Enter to send)"
                disabled={aiStore.isTyping.value}
                className="w-full bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded-lg pl-3 pr-10 py-3 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] transition-all resize-none disabled:opacity-50"
                rows={2}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || aiStore.isTyping.value}
                className="absolute right-2 bottom-3 p-1.5 rounded-md text-[var(--los-muted)] hover:text-[var(--los-accent)] hover:bg-[var(--los-bg)] transition-all disabled:opacity-30 disabled:hover:text-[var(--los-muted)] disabled:hover:bg-transparent"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="flex justify-between items-center mt-2 px-1">
              <MonoLabel className="text-[9px] opacity-50">Local CLI Proxy</MonoLabel>
              <MonoLabel className="text-[9px] opacity-50">Shift+Enter for newline</MonoLabel>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
