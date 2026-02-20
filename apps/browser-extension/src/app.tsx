import { useState, useEffect } from 'preact/hooks';
import './index.css';

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [dumpNote, setDumpNote] = useState('');

  useEffect(() => {
    // Check for auth token
    chrome.storage.local.get('lifeos_token', (result) => {
      setToken((result.lifeos_token as string) || null);
    });

    // Get active tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setActiveTab({
          title: tabs[0].title || '',
          url: tabs[0].url || '',
        });
      }
    });
  }, []);

  const handleLogin = () => {
    chrome.tabs.create({ url: 'https://app.lifosy.com' }); // Or localhost if dev
  };

  const handleReadItLater = async () => {
    if (!token || !activeTab) return;
    setStatus('saving');
    // Simulate API call
    setTimeout(() => {
      console.log('Saved to Read-it-later:', activeTab);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    }, 1000);
  };

  const handleDumpNote = async () => {
    if (!token || !dumpNote.trim()) return;
    setStatus('saving');
    // Simulate API call
    setTimeout(() => {
      console.log('Saved dump note:', dumpNote);
      setDumpNote('');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    }, 1000);
  };

  if (!token) {
    return (
      <div class="w-80 h-96 bg-black text-white p-6 flex flex-col items-center justify-center space-y-4 font-mono">
        <div class="text-xl font-bold">Lifosy</div>
        <p class="text-center text-gray-400 text-sm">Please login to the console to use the extension.</p>
        <button
          onClick={handleLogin}
          class="px-4 py-2 bg-green-500 text-black font-bold rounded hover:bg-green-400 transition-colors"
        >
          Open Console
        </button>
      </div>
    );
  }

  return (
    <div class="w-80 bg-black text-white p-4 font-mono border border-gray-800">
      <header class="flex items-center justify-between mb-4 pb-2 border-b border-gray-800">
        <span class="font-bold text-green-500">Lifosy</span>
        <span class="text-xs text-gray-500">Connected</span>
      </header>

      <div class="space-y-6">
        {/* Read It Later Section */}
        <section class="space-y-2">
          <h2 class="text-sm font-bold text-gray-400">Read It Later</h2>
          <div class="p-3 bg-gray-900 rounded border border-gray-800">
            <div class="text-xs text-gray-400 truncate mb-2">{activeTab?.title || 'No active tab'}</div>
            <button
              onClick={handleReadItLater}
              disabled={status === 'saving'}
              class="w-full py-1.5 px-3 bg-gray-800 hover:bg-gray-700 text-xs rounded transition-colors flex items-center justify-center gap-2"
            >
              {status === 'saving' ? 'Saving...' : status === 'success' ? 'Saved!' : 'Save Page'}
            </button>
          </div>
        </section>

        {/* Dump Note Section */}
        <section class="space-y-2">
          <h2 class="text-sm font-bold text-gray-400">Dump Note</h2>
          <textarea
            value={dumpNote}
            onInput={(e) => setDumpNote((e.target as HTMLTextAreaElement).value)}
            class="w-full h-24 bg-gray-900 border border-gray-800 rounded p-2 text-xs focus:border-green-500 focus:outline-none resize-none"
            placeholder="Type manually..."
          />
          <button
            onClick={handleDumpNote}
            disabled={status === 'saving' || !dumpNote.trim()}
            class="w-full py-1.5 px-3 bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-900 text-xs rounded transition-colors"
          >
            Add Note
          </button>
        </section>
      </div>
    </div>
  );
}
