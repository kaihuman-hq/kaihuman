import { encrypt, decrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function runTests() {
  const enc = await encrypt('', 'password123'); // newly created file content
  console.log('Encrypted blank file:', enc);
  try {
     const dec = await decrypt(enc, 'wrong-password');
     console.log('FAIL: Decrypted with wrong password! output:', dec);
  } catch (e) {
     console.log('PASS: Decrypting with wrong password threw:', (e as Error).message);
  }
}
runTests();
