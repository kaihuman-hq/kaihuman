import type { CoreStorageAdapter, PendingMutation, RecordStore } from './adapter.js';

export class InMemoryStorageAdapter implements CoreStorageAdapter {
  private kv = new Map<string, string>();
  private records = new Map<string, unknown>();
  private mutations = new Map<string, PendingMutation>();

  getItem(key: string): string | null {
    return this.kv.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.kv.set(key, value);
  }
  removeItem(key: string): void {
    this.kv.delete(key);
  }
  async getRecord<T>(store: RecordStore, key: string): Promise<T | undefined> {
    return this.records.get(`${store}\u0000${key}`) as T | undefined;
  }
  async putRecord(store: RecordStore, key: string, value: unknown): Promise<void> {
    this.records.set(`${store}\u0000${key}`, value);
  }
  async deleteRecord(store: RecordStore, key: string): Promise<void> {
    this.records.delete(`${store}\u0000${key}`);
  }
  async listPendingMutations(): Promise<PendingMutation[]> {
    return [...this.mutations.values()].sort((a, b) => a.timestamp - b.timestamp);
  }
  async putPendingMutation(mutation: PendingMutation): Promise<void> {
    this.mutations.set(mutation.id, mutation);
  }
  async deletePendingMutation(id: string): Promise<void> {
    this.mutations.delete(id);
  }
}
