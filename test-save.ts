import { encrypt } from './packages/core/src/utils/crypto.js';
import { passwordStore } from './packages/core/src/stores/password.store.js';
import { githubFileStore } from './packages/core/src/stores/github-file.store.js';

async function test() {
  const enc = await encrypt('hello world', 'password');
  console.log('Encrypted text:', enc);
  
  // Pretend file is opened
  githubFileStore.openFiles.value['zenc2.md.enc'] = {
    content: enc,
    sha: 'mock-sha'
  };

  const newEnc = await encrypt('hello world changed', 'password');
  console.log('New encrypted text:', newEnc);

  githubFileStore.updateFileContent('zenc2.md.enc', newEnc);

  console.log('Is dirty?', githubFileStore.dirtyFiles.value.has('zenc2.md.enc'));
}

test().catch(console.error);
