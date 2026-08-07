import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const REMOTE_HOST = '64.227.179.37';
const REMOTE_USER = 'geetha';
const REMOTE_PASS = 'Dial2techGeetha';
const LOCAL_FRONTEND_DIST = path.join(process.cwd(), 'frontend', 'dist');
const REMOTE_BASE_DIR = '/home/geetha/gps_project';
const REMOTE_FRONTEND_DIST = `${REMOTE_BASE_DIR}/frontend/dist`;

console.log('🔨 Step 1: Building frontend for production deployment...');
execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
console.log('✅ Local frontend build complete.');

const conn = new Client();

function uploadDir(sftp, localDir, remoteDir, callback) {
  sftp.mkdir(remoteDir, (err) => {
    // Ignore if directory already exists
    const files = fs.readdirSync(localDir);
    let pending = files.length;
    if (pending === 0) return callback();

    files.forEach((file) => {
      const localFilePath = path.join(localDir, file);
      const remoteFilePath = `${remoteDir}/${file}`;
      const stat = fs.statSync(localFilePath);

      if (stat.isDirectory()) {
        uploadDir(sftp, localFilePath, remoteFilePath, () => {
          if (--pending === 0) callback();
        });
      } else {
        sftp.fastPut(localFilePath, remoteFilePath, (err) => {
          if (err) console.error(`Error uploading ${file}:`, err.message);
          else console.log(`  Uploaded ${remoteFilePath}`);
          if (--pending === 0) callback();
        });
      }
    });
  });
}

conn.on('ready', () => {
  console.log('⚡ Step 2: SSH Connected to DigitalOcean server...');

  conn.sftp((err, sftp) => {
    if (err) throw err;

    console.log('📁 Step 3: Creating remote directories...');
    conn.exec(`mkdir -p ${REMOTE_FRONTEND_DIST} ${REMOTE_BASE_DIR}/backend`, (err, stream) => {
      if (err) throw err;
      stream.on('close', () => {
        console.log('⬆️ Step 4: Uploading server.js to remote backend...');
        const localServerJs = path.join(process.cwd(), 'backend', 'server.js');
        sftp.fastPut(localServerJs, `${REMOTE_BASE_DIR}/backend/server.js`, (err) => {
          if (err) console.error('Failed to upload server.js:', err.message);
          else console.log('✅ Uploaded server.js');

          console.log('⬆️ Step 5: Uploading frontend dist bundle to remote server...');
          uploadDir(sftp, LOCAL_FRONTEND_DIST, REMOTE_FRONTEND_DIST, () => {
            console.log('✅ Frontend bundle upload complete.');

            console.log('🚀 Step 6: Restarting server.js on DigitalOcean Droplet via PM2...');
            const restartCmd = `cd ${REMOTE_BASE_DIR}/backend && (pm2 restart server || pm2 start server.js --name server || nohup node server.js > server.log 2>&1 & disown)`;
            conn.exec(restartCmd, (err, stream) => {
              if (err) throw err;
              stream.on('close', () => {
                console.log('🎉 DEPLOYMENT COMPLETE! Server running on http://64.227.179.37:3001');
                conn.end();
              }).on('data', (d) => console.log(d.toString()));
            });
          });
        });
      });
    });
  });
}).connect({
  host: REMOTE_HOST,
  port: 22,
  username: REMOTE_USER,
  password: REMOTE_PASS,
  readyTimeout: 30000
});
