import { signal } from '@preact/signals';
import { Logger } from '../logger.js';

const logger = new Logger('AIStore');

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export type AIProvider = 'copilot' | 'claude' | 'gemini';

class AIStore {
  // Connection state
  public isConnected = signal<boolean>(false);
  public isPanelOpen = signal<boolean>(false);

  // Chat state
  public activeProvider = signal<AIProvider>('copilot');
  public history = signal<ChatMessage[]>([]);
  public isTyping = signal<boolean>(false);

  private readonly SERVER_URL = 'http://127.0.0.1:4000';

  public async checkConnection() {
    try {
      const res = await fetch(`${this.SERVER_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        if (!this.isConnected.value) {
          logger.info('[AIStore] Connected to local AI server');
          this.isConnected.value = true;
        }
      } else {
        logger.warn('[AIStore] Local AI server health check failed.');
        this.isConnected.value = false;
      }
    } catch (e) {
      logger.warn('[AIStore] Local AI server health check failed or offline.', e);
      this.isConnected.value = false;
    }
  }

  public async togglePanel() {
    if (this.isPanelOpen.value) {
      this.isPanelOpen.value = false;
      return;
    }

    await this.checkConnection();

    // Always open panel even if disconnected, to allow reading history
    // or attempting to send if they start the server later
    this.isPanelOpen.value = true;
  }

  public setProvider(provider: AIProvider) {
    this.activeProvider.value = provider;
  }

  public async sendMessage(content: string) {
    if (!content.trim() || !this.isConnected.value) return;

    // 1. Add User Message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };
    this.history.value = [...this.history.value, userMsg];
    this.isTyping.value = true;

    // 2. Send to Local CLI API
    try {
      const res = await fetch(`${this.SERVER_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          provider: this.activeProvider.value,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      // 3. Add Assistant Message
      const astMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || 'No response',
        timestamp: new Date().toISOString(),
      };
      this.history.value = [...this.history.value, astMsg];
    } catch (e: any) {
      logger.error('[AIStore] Error sending message', e);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Error communicating with local CLI:**\n\`\`\`text\n${e.message}\n\`\`\``,
        timestamp: new Date().toISOString(),
      };
      this.history.value = [...this.history.value, errorMsg];
    } finally {
      this.isTyping.value = false;
    }
  }

  public clearHistory() {
    this.history.value = [];
  }
}

export const aiStore = new AIStore();
