import { Octokit } from '@octokit/rest';

async function run() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  try {
    const res = await octokit.repos.getContent({
      owner: 'Lifosy',
      repo: 'monorepo',
      path: 'zenc4.md.enc'
    });
    
    // Check if it's an array or a single file object
    if (!Array.isArray(res.data) && res.data.type === 'file') {
      const content = Buffer.from(res.data.content, 'base64').toString('utf8');
      console.log('CONTENT OF zenc4.md.enc (`' + content + '`)');
      console.log('LENGTH:', content.length);
      console.log('IS EMPTY STRING?', content === "");
    } else {
      console.log('Not a file:', res.data);
    }
  } catch (e) {
    console.error('Error fetching zenc4.md.enc:', e.message);
  }
}
run();
