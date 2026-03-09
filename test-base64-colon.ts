import { decrypt, encrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function run() {
  const enc = await encrypt("hello world: wait a minute", "pass");
  console.log("Encrypted:", enc);
  console.log("Includes colon?", enc.includes(':'));
}
run();
