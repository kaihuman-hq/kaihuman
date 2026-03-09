const https = require('https');

const options = {
  hostname: 'api.github.com',
  path: '/repos/Lifosy/monorepo/contents/zenc4.md.enc',
  method: 'GET',
  headers: {
    'User-Agent': 'Node.js',
    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    if (json.content) {
      const content = Buffer.from(json.content, 'base64').toString('utf8');
      console.log('CONTENT OF zenc4.md.enc:');
      console.log('---START---');
      console.log(content);
      console.log('---END---');
      console.log('LENGTH:', content.length);
    } else {
      console.log('No content, res:', json);
    }
  });
});

req.on('error', e => console.error(e));
req.end();
