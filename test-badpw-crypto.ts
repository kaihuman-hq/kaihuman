import { encrypt, decrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function runTests() {
  const pw = 'test-password';
  const badPw = 'wrong-password';
  const plain = 'Hello secret';

  try {
     const enc = await encrypt(plain, pw);
     const dec = await decrypt(enc, badPw);
     console.log('FAIL: Decrypting valid string with bad password succeeded:', dec);
  } catch(e) {
     console.log('PASS: Decrypting valid string with bad password threw:', e.message);
  }
}
runTests();
