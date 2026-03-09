import { encrypt, decrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function runTests() {
  const pw = 'test-password';
  try {
     const dec = await decrypt('', pw);
     console.log('FAIL: Decrypting empty string succeeded:', dec);
  } catch(e) {
     console.log('PASS: Decrypting empty string threw:', e.message);
  }
}
runTests();
