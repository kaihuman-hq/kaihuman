import { openDB } from 'idb';
import { getCoreStorage } from '../storage/adapter.js';

/** Opens the console IndexedDB after the web adapter has created its (v2) schema. */
export async function openLifeOsDb() {
  await getCoreStorage().getRecord('files', '');
  return openDB('life-os-db', 2);
}
