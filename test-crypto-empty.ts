import { decrypt, encrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function run() {
  try {
    console.log('Attempting decrypt of empty string with password...');
    const decrypted = await decrypt('', 'anypassword');
    console.log('SUCCESS! DECRYPTED CONTENT IS:', decrypted, typeof decrypted);
  } catch (err: any) {
    console.error('FAILED TO DECRYPT:', err.message);
  }
}

run();
