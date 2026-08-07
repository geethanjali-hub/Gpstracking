import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('⚡ Connected to SSH to check Nginx setup');
  conn.exec('ls -la /etc/nginx/sites-enabled/; cat /etc/nginx/sites-enabled/*', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.end();
    }).on('data', (data) => {
      console.log(data.toString());
    });
  });
}).connect({
  host: '64.227.179.37',
  port: 22,
  username: 'geetha',
  password: 'Dial2techGeetha',
  readyTimeout: 30000
});
