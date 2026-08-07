import { Client } from 'ssh2';

const conn = new Client();

const nginxConfig = `
server {
    listen 80;
    server_name 64.227.179.37;

    location /gps/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

conn.on('ready', () => {
  console.log('⚡ Connected to SSH to add Nginx configuration...');
  conn.shell((err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.end();
    }).on('data', (data) => {
      console.log(data.toString());
    });

    stream.write('echo "'+nginxConfig.trim()+'" | sudo tee /etc/nginx/sites-available/gps-tracker.conf\n');
    stream.write('echo Dial2techGeetha | sudo -S ln -sf /etc/nginx/sites-available/gps-tracker.conf /etc/nginx/sites-enabled/gps-tracker.conf\n');
    stream.write('echo Dial2techGeetha | sudo -S nginx -t\n');
    stream.write('echo Dial2techGeetha | sudo -S systemctl reload nginx\n');
    setTimeout(() => {
      stream.write('exit\n');
    }, 4000);
  });
}).connect({
  host: '64.227.179.37',
  port: 22,
  username: 'geetha',
  password: 'Dial2techGeetha',
  readyTimeout: 30000
});
