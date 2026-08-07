import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('⚡ SSH Connected');
  conn.shell((err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.end();
    }).on('data', (data) => {
      console.log(data.toString());
    });
    stream.write('echo Dial2techGeetha | sudo -S ufw allow 3001/tcp\n');
    stream.write('echo Dial2techGeetha | sudo -S ufw reload\n');
    setTimeout(() => {
      stream.write('\x03exit\n');
    }, 3000);
  });
}).connect({
  host: '64.227.179.37',
  port: 22,
  username: 'geetha',
  password: 'Dial2techGeetha',
  readyTimeout: 30000
});
