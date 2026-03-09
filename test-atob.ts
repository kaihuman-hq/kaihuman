import { encrypt, decrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function runTests() {
  console.log("atob('') =", `"${atob('')}"`);
  console.log("atob('   ') =", `"${atob('   ')}"`);
  try {
     console.log("Test decrypting whitespace...");
     await decrypt('   ', 'wrong-pass');
     console.log("FAIL: Decrypting whitespace succeeded!");
  } catch (e) {
     console.log("PASS: Decrypting whitespace threw error:", e.message);
  }
}
runTests();
