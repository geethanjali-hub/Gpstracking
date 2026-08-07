import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('⚡ SSH Connected');
  const cmd = 'cd ~/gps_project && git fetch origin main && git reset --hard origin/main && cd backend && pm2 restart server || pm2 start server.js --name server';
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '64.227.179.37',
  port: 22,
  username: 'geetha',
  password: 'Dial2techGeetha',
  readyTimeout: 30000
});
