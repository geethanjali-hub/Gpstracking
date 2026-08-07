// Helper script for remote setup
import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('⚡ SSH Connected');
  conn.exec('cd ~/gps_project && git pull && cd backend && npm install && echo Dial2techGeetha | sudo -S fuser -k -9 3001/tcp || true && nohup node server.js > server.log 2>&1 &', (err, stream) => {
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '64.227.179.37',
  port: 22,
  username: 'geetha',
  password: 'Dial2techGeetha',
  readyTimeout: 30000
});
