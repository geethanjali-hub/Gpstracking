import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('⚡ SSH Connected to 64.227.179.37');
  conn.exec('ls -la /var/www/html; ps aux | grep node; sudo ufw status', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      console.log(data.toString());
    }).stderr.on('data', (data) => {
      console.error(data.toString());
    });
  });
}).connect({
  host: '64.227.179.37',
  port: 22,
  username: 'geetha',
  password: 'Dial2techGeetha',
  readyTimeout: 30000
});
