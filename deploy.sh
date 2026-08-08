#!/usr/bin/env bash
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 22
nvm use 22

cd ~/gps_project
rm -rf node_modules package-lock.json
npm ci --ignore-optional

cd frontend
npm ci --ignore-optional
npm run build

# copy build output using Node ESM
node - <<'NODE'
import { cpSync } from 'fs';
cpSync('dist', '../dist', { recursive: true });
cpSync('dist', '../public', { recursive: true });
NODE

cd ~/gps_project
pm2 delete all || true
cd ~/gps_project/backend
pm2 start server.js --name gps-backend
pm2 save
pm2 list

