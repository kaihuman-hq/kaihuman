import { decrypt, encrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function run() {
  const emptyStr = "";
  try {
     console.log("Empty string includes colon:", emptyStr.includes(':'));
     console.log("atob empty:", atob(emptyStr));
     console.log("Parts:", atob(emptyStr).split(':').length);
     await decrypt("", "pass");
  } catch(e) {
     console.error("FAIL with empty string:", e.message);
  }
}
run();
