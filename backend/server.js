import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import mqtt from 'mqtt';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { db, rtdb, auth } from './firebase.config.js';
import { collection, doc, setDoc, getDocs, onSnapshot, addDoc } from 'firebase/firestore';
import { ref, set, get, child } from 'firebase/database';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  usersDb,
  generateAccessToken,
  generateRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  authenticateToken,
  requireRole
} from './auth.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// OpenAPI 3.0 JSON Specification for Swagger UI
const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "IBOTS GPS Vehicle Tracking Telematics API",
    version: "1.0.0",
    description: "Interactive Swagger UI documentation and live testing console for ESP32 hardware MQTT payloads, vehicle management, and telematics telemetry."
  },
  servers: [
    { url: "http://64.227.179.37:3001", description: "DigitalOcean Live Backend Server" },
    { url: "http://localhost:3001", description: "Local Development Server" }
  ],
  paths: {
    "/api/vehicles": {
      get: {
        summary: "Get Fleet Vehicles List",
        description: "Returns list of all active fleet vehicles in database.",
        responses: {
          "200": { description: "Array of vehicle objects" }
        }
      },
      post: {
        summary: "Add New Vehicle",
        description: "Register a new vehicle with VIN, name, and alert thresholds.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Tesla Model Y" },
                  vin: { type: "string", example: "5YJ3E1EA5KF999999" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Vehicle created successfully" }
        }
      }
    },
    "/api/telemetry": {
      post: {
        summary: "Push Hardware Telemetry Packet",
        description: "Endpoint used by ESP32 / SIM A7670C hardware tracker to push live 5-second telemetry payloads.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  device_id: { type: "string", example: "V-001" },
                  gps: {
                    type: "object",
                    properties: {
                      lat: { type: "number", example: 37.7749 },
                      lng: { type: "number", example: -122.4194 },
                      spd: { type: "number", example: 55 },
                      hdg: { type: "number", example: 90 },
                      sats: { type: "number", example: 10 }
                    }
                  },
                  obd: {
                    type: "object",
                    properties: {
                      rpm: { type: "number", example: 1800 },
                      coolant_c: { type: "number", example: 88 },
                      fuel_pct: { type: "number", example: 78.5 },
                      mil: { type: "boolean", example: false }
                    }
                  },
                  power: {
                    type: "object",
                    properties: {
                      bat_pct: { type: "number", example: 100 },
                      obd_12v: { type: "boolean", example: true }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Telemetry received and broadcasted" }
        }
      }
    }
  }
};

// Serve OpenAPI Specification JSON
app.get('/api-spec.json', (req, res) => {
  res.json(openApiSpec);
});

// Swagger UI Dashboard Endpoint (Light Theme)
app.get(['/', '/docs', '/api-docs', '/swagger'], (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>IBOTS GPS Backend API — Swagger UI Console</title>
      <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui.min.css" />
      <style>
        html { box-sizing: border-box; }
        body { margin:0; background: #ffffff; color: #0f172a; font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .topbar-header { background: #f8fafc; padding: 14px 24px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; }
        .topbar-header h1 { font-size: 16px; margin: 0; color: #0284c7; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .btn-ui { background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; transition: all 0.2s; }
        .btn-ui:hover { background: #0369a1; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui { max-width: 1200px; margin: 0 auto; padding: 20px; }
      </style>
    </head>
    <body>
      <div class="topbar-header">
        <h1>⚡ IBOTS GPS Telematics Backend — Interactive API Console</h1>
        <a href="http://64.227.179.37/gps-app/" class="btn-ui" target="_blank">Launch Web Dashboard ➔</a>
      </div>
      <div id="swagger-ui"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-bundle.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-standalone-preset.js"></script>
      <script>
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          url: "/api-spec.json",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          layout: "StandaloneLayout"
        });
      };
      </script>
    </body>
    </html>
  `);
});

// Broadcast live payload to connected WebSocket browsers
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// In-Memory fallback store if offline
let localVehicles = [
  { id: 'gps-obd-tracker-01', name: 'ESP32 SIM A7670C Hardware Tracker', vin: 'OBD_TRK_001', status: 'online' }
];

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION ROUTES — JWT, Refresh Tokens, OAuth 2.0 & Role Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/login
 * Login with username/email & password -> Returns JWT Access Token (15m) + HTTP-only Refresh Cookie (7d)
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username/Email and Password are required.' });
    }

    const cleanInput = username.toLowerCase().trim();
    const user = usersDb.find(u => u.username.toLowerCase() === cleanInput || u.email.toLowerCase() === cleanInput);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const isValid = bcrypt.compareSync(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set Refresh Token in secure HTTP-only Cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false, // set true in HTTPS production
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 minutes
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.name,
        assignedVehicle: user.assignedVehicle
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh Expired Access Token using Refresh Token (Token Rotation Enabled)
 */
app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh Token required in HTTP-only cookie or request body.' });
  }

  const result = verifyAndRotateRefreshToken(refreshToken);
  if (result.error) {
    res.clearCookie('refreshToken');
    return res.status(401).json({ error: result.error, code: 'INVALID_REFRESH_TOKEN' });
  }

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      role: result.user.role,
      name: result.user.name,
      assignedVehicle: result.user.assignedVehicle
    }
  });
});

/**
 * POST /api/auth/logout
 * Revoke Refresh Token and Clear Cookie
 */
app.post('/api/auth/logout', (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully. Tokens revoked.' });
});

/**
 * GET /api/auth/me
 * Protected Route: Returns Current Authenticated User Profile
 */
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/google (OAuth 2.0 Social Login)
 * Authenticate with Google OAuth 2.0 Credentials
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, googleId } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Google OAuth email is required.' });
    }

    let user = usersDb.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Auto-register new Google OAuth User with viewer role
      user = {
        id: `usr-google-${Date.now()}`,
        username: email.split('@')[0],
        email,
        passwordHash: bcrypt.hashSync(googleId || Math.random().toString(), 10),
        role: email.includes('admin') ? 'admin' : 'viewer',
        name: name || email.split('@')[0],
        assignedVehicle: 'gps-obd-tracker-01',
        tokenVersion: 1,
        createdAt: new Date().toISOString()
      };
      usersDb.push(user);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Google OAuth authentication successful',
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.name,
        assignedVehicle: user.assignedVehicle
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let localTelemetry = {
  'gps-obd-tracker-01': {
    lat: null,
    lng: null,
    fix: false,
    gpsValid: false,
    isOnline: false,
    status: 'offline',
    speed: 0,
    heading: 0,
    satellites: 0,
    altitude: 0,
    hdop: 0,
    rpm: 0,
    coolantTemp: 0,
    fuelLevel: 0,
    backupBatteryPercent: 0
  }
};

app.get('/api/telemetry', (req, res) => {
  res.json(localTelemetry);
});

app.get('/api/telemetry/:vehicleId', (req, res) => {
  const vid = req.params.vehicleId;
  res.json(localTelemetry[vid] || localTelemetry['gps-obd-tracker-01'] || {});
});

// 1. Receive Hardware Telemetry Payload (from ESP32 / SIM A7670C MQTT gateway)
app.post('/api/telemetry', async (req, res) => {
  try {
    const payload = req.body;
    const vehicleId = payload.device_id || payload.vehicleId || 'gps-obd-tracker-01';

    const rawLat = payload.gps?.lat ?? payload.location?.lat ?? payload.lat;
    const rawLng = payload.gps?.lng ?? payload.location?.lng ?? payload.lng;
    const hasValidCoords = typeof rawLat === 'number' && !isNaN(rawLat) && rawLat !== 0 &&
                           typeof rawLng === 'number' && !isNaN(rawLng) && rawLng !== 0;

    const fixFlag = payload.gps?.valid ?? payload.gps?.fix ?? payload.location?.fix ?? payload.fix;
    const hasFix = (fixFlag !== false && fixFlag !== 0 && fixFlag !== "false") && hasValidCoords;

    const lat = hasFix ? rawLat : null;
    const lng = hasFix ? rawLng : null;

    // Format full hardware packet into standardized telematics state
    const telemetryDoc = {
      vehicleId,
      firmware: payload.firmware || "v1.0.3",
      seq: payload.seq || 0,
      uptimeMs: payload.uptime_ms || 0,
      isOnline: true,
      status: 'online',
      
      // GPS GNSS Module — NULL coordinates if no fix or offline
      gpsValid: hasFix,
      fix: hasFix,
      lat,
      lng,
      altitude: payload.gps?.alt ?? 0,
      speed: payload.gps?.spd ?? payload.speed ?? 0,
      heading: payload.gps?.hdg ?? payload.heading ?? 0,
      satellites: payload.gps?.sats ?? 0,
      hdop: payload.gps?.hdop ?? 0,
      fixAgeMs: payload.gps?.fix_age_ms ?? 0,

      // OBD-II Diagnostics Data
      obdConnected: payload.obd?.connected ?? true,
      obdProtocol: payload.obd?.protocol || "ISO 15765-4 CAN",
      rpm: payload.obd?.rpm ?? 0,
      obdSpeed: payload.obd?.vspd ?? 0,
      coolantTemp: payload.obd?.coolant_c ?? 0,
      engineLoadPct: payload.obd?.load_pct ?? 0,
      throttlePct: payload.obd?.throttle_pct ?? 0,
      fuelLevel: payload.obd?.fuel_pct ?? 0,
      fuelTrimShortTerm: payload.obd?.fuel_trim_st ?? 0,
      intakeAirTemp: payload.obd?.iat_c ?? 0,
      massAirFlow: payload.obd?.maf_gs ?? 0,
      batteryVoltage: payload.obd?.voltage_v ?? 0,
      checkEngine: payload.obd?.mil ?? false,
      dtcCount: payload.obd?.dtc_count ?? 0,
      checkEngineCode: payload.obd?.dtc_codes || null,

      // IMU Motion Data
      imuAccel: { ax: 0, ay: 0, az: 1 },
      imuGyro: { gx: 0, gy: 0, gz: 0 },
      harshBraking: false,
      harshAcceleration: false,
      harshCornering: false,
      tamperDetected: false,

      // Power & Battery State
      backupBatteryPercent: payload.power?.bat_pct ?? 0,
      backupBatteryVoltage: payload.power?.bat_v ?? 0,
      batteryRuntimeMinutes: payload.power?.runtime_min ?? 0,
      powerSource: payload.power?.obd_12v ? 'main' : 'backup',
      isCharging: payload.power?.charging ?? false,

      timestamp: payload.ts || new Date().toISOString()
    };

    // Save to Firebase Realtime Database (RTDB) & Firestore
    try {
      if (rtdb) {
        await set(ref(rtdb, 'telemetry/' + vehicleId), telemetryDoc);
      }
      if (db) {
        await setDoc(doc(db, 'telemetry', vehicleId), telemetryDoc, { merge: true });
      }
      console.log(`✅ Saved telemetry for ${vehicleId} to Firebase RTDB & Firestore`);
    } catch (fbErr) {
      console.warn("Firebase save skipped (using local memory fallback):", fbErr.message);
    }

    // Update local memory & broadcast live WebSocket message to dashboards
    localTelemetry[vehicleId] = telemetryDoc;
    broadcast({ type: 'TELEMETRY_UPDATE', vehicleId, data: telemetryDoc });

    res.json({ status: 'ok', vehicleId, savedToFirebase: true, telemetry: telemetryDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Fetch Fleet Vehicles — Enforce Single Active Hardware Device (gps-obd-tracker-01)
app.get('/api/vehicles', async (req, res) => {
  const singleHardwareDevice = [
    { id: 'gps-obd-tracker-01', name: 'ESP32 SIM A7670C Hardware Tracker', vin: 'OBD_TRK_001', status: 'online' }
  ];

  try {
    // Sanitize Firebase RTDB & Firestore to ensure no stale mock vehicles persist
    if (rtdb) {
      await set(ref(rtdb, 'vehicles'), { 'gps-obd-tracker-01': singleHardwareDevice[0] });
    }
    if (db) {
      await setDoc(doc(db, 'vehicles', 'gps-obd-tracker-01'), singleHardwareDevice[0]);
    }
  } catch (err) {
    console.warn("Firebase sync skipped:", err.message);
  }

  res.json(singleHardwareDevice);
});

// 3. Register New Vehicle in Firebase
app.post('/api/vehicles', async (req, res) => {
  try {
    const newVehicle = req.body;
    const vId = newVehicle.id || `V-00${localVehicles.length + 1}`;
    const vehicleData = { id: vId, ...newVehicle, createdAt: new Date().toISOString() };

    try {
      if (rtdb) {
        await set(ref(rtdb, 'vehicles/' + vId), vehicleData);
      }
      if (db) {
        await setDoc(doc(db, 'vehicles', vId), vehicleData);
      }
      console.log(`✅ Registered new vehicle ${vId} in Firebase RTDB & Firestore`);
    } catch (fbErr) {
      console.warn("Firebase write skipped:", fbErr.message);
    }

    localVehicles.push(vehicleData);
    broadcast({ type: 'VEHICLE_ADDED', data: vehicleData });

    res.status(201).json(vehicleData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GitHub Webhook Endpoint for Automatic CI/CD Deployment on git push
app.post('/api/webhook/deploy', (req, res) => {
  console.log('🚀 Webhook: Received git push notification from GitHub devprotowiz/Gpstracking!');
  res.json({ message: 'Automatic deployment triggered on DigitalOcean server' });

  const deployCmd = `
    cd /home/geetha/gps_project &&
    git fetch origin main &&
    git reset --hard origin/main &&
    cd /home/geetha/gps_project/backend &&
    npm install &&
    echo 'Dial2techGeetha' | sudo -S fuser -k -9 3001/tcp || true &&
    nohup node server.js > server.log 2>&1 &
    echo 'Dial2techGeetha' | sudo -S nginx -s reload || true
  `;

  import('child_process').then(({ exec }) => {
    exec(deployCmd, (err, stdout) => {
      if (err) console.error('❌ Auto-deploy error:', err.message);
      else console.log('🎉 Auto-deploy successful!');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MQTT SUBSCRIBER — Captures live ESP32 hardware data from test.mosquitto.org
// ═══════════════════════════════════════════════════════════════════════════
const MQTT_BROKER_URL = 'mqtt://test.mosquitto.org:1883';
const MQTT_TOPICS = [
  'sedhupathi/gps-obd-tracker-01/data',  // main tracker device
  'sedhupathi/+/data'                     // wildcard for future devices
];

const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  clientId: 'ibots-backend-' + Math.random().toString(16).slice(2, 10),
  clean: true,
  reconnectPeriod: 5000
});

mqttClient.on('connect', () => {
  console.log('📡 MQTT: Connected to', MQTT_BROKER_URL);
  MQTT_TOPICS.forEach(topic => {
    mqttClient.subscribe(topic, (err) => {
      if (!err) console.log('📡 MQTT: Subscribed to', topic);
      else console.warn('📡 MQTT: Subscribe failed for', topic, err.message);
    });
  });
});

mqttClient.on('error', (err) => {
  console.warn('📡 MQTT: Error -', err.message);
});

mqttClient.on('reconnect', () => {
  console.log('📡 MQTT: Reconnecting...');
});

// Process incoming MQTT messages from ESP32 hardware
mqttClient.on('message', async (topic, message) => {
  try {
    const raw = JSON.parse(message.toString());
    console.log(`📡 MQTT: Received from ${topic}`);

    // Extract device ID from topic: sedhupathi/gps-obd-tracker-01/data -> gps-obd-tracker-01
    const topicParts = topic.split('/');
    const vehicleId = (topicParts.length >= 2 && topicParts[1] !== '+') 
      ? topicParts[1] 
      : (raw.device_id || 'gps-obd-tracker-01');

    // Track device liveness timestamp
    const now = Date.now();
    deviceLastSeen.set(vehicleId, now);
    deviceLastSeen.set('gps-obd-tracker-01', now);

    const rawLat = raw.location?.lat ?? raw.gps?.lat ?? raw.lat;
    const rawLng = raw.location?.lng ?? raw.gps?.lng ?? raw.lng;
    const hasValidCoords = typeof rawLat === 'number' && !isNaN(rawLat) && rawLat !== 0 &&
                           typeof rawLng === 'number' && !isNaN(rawLng) && rawLng !== 0;

    const fixFlag = raw.location?.fix ?? raw.gps?.fix ?? raw.gps?.valid ?? raw.fix;
    const hasFix = (fixFlag !== false && fixFlag !== 0 && fixFlag !== "false") && hasValidCoords;

    // Use live coordinates ONLY if fix is valid and non-zero. NO fallback coordinates when fix is false or offline.
    const lat = hasFix ? rawLat : null;
    const lng = hasFix ? rawLng : null;

    // Map ESP32 MQTT JSON format -> standardized telemetry format
    const telemetryDoc = {
      vehicleId,
      source: 'mqtt_live',
      isOnline: true,
      status: 'online',

      // GPS (from ESP32 location object)
      gpsValid: hasFix,
      fix: hasFix,
      lat,
      lng,
      altitude: raw.location?.altitude_m ?? 0,
      speed: raw.location?.speed_kph ?? 0,
      heading: raw.location?.heading_deg ?? 0,
      satellites: raw.location?.satellites ?? 0,
      hdop: raw.location?.hdop ?? 0,
      accuracy: raw.location?.hdop ?? 2.5,
      gpsSource: raw.location?.source ?? 'no_fix',

      // Engine / OBD (from ESP32 engine object — currently simulated)
      rpm: raw.engine?.rpm ?? 0,
      coolantTemp: raw.engine?.coolant_temp_c ?? 0,
      engineLoad: raw.engine?.engine_load_pct ?? 0,
      engineLoadPct: raw.engine?.engine_load_pct ?? 0,
      throttle: raw.engine?.throttle_pct ?? 0,
      throttlePct: raw.engine?.throttle_pct ?? 0,
      checkEngine: raw.engine?.check_engine ?? false,
      obdSource: raw.engine?.source ?? 'simulated',

      // Fuel (from ESP32 fuel object — currently simulated)
      fuelLevel: raw.fuel?.fuel_level_pct ?? 0,
      fuelConsumption: raw.fuel?.fuel_consumption_lph ?? 0,
      fuelConsumptionLph: raw.fuel?.fuel_consumption_lph ?? 0,
      fuelSource: raw.fuel?.source ?? 'simulated',

      // Battery (from ESP32 battery object)
      backupBatteryPercent: raw.battery?.battery_pct ?? 0,
      backupBatteryVoltage: raw.battery?.battery_voltage ?? 0,
      powerSource: raw.battery?.power_source ?? 'vehicle',
      isCharging: raw.battery?.charging ?? false,
      chargingStatus: raw.battery?.charging ? 'charging' : 'discharging',

      timestamp: new Date().toISOString()
    };

    // Save to Firebase RTDB & Firestore for vehicleId
    const vehicleIdsToUpdate = Array.from(new Set([vehicleId, 'gps-obd-tracker-01']));
    for (const vId of vehicleIdsToUpdate) {
      const vDoc = { ...telemetryDoc, vehicleId: vId };
      try {
        if (rtdb) {
          await set(ref(rtdb, 'telemetry/' + vId), vDoc);
        }
        if (db) {
          await setDoc(doc(db, 'telemetry', vId), vDoc, { merge: true });
        }
      } catch (fbErr) {
        console.warn(`Firebase save from MQTT for ${vId} warning:`, fbErr.message);
      }
      localTelemetry[vId] = vDoc;
      broadcast({ type: 'TELEMETRY_UPDATE', vehicleId: vId, data: vDoc });
    }
    console.log(`✅ MQTT->Firebase: Saved live data for ${vehicleId} (fix:${hasFix}, lat:${lat}, lng:${lng}, speed:${telemetryDoc.speed})`);

  } catch (parseErr) {
    console.warn('📡 MQTT: Failed to parse message from', topic, parseErr.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE LIVENESS & OFFLINE DETECTION MONITOR
// Runs every 3 seconds — automatically detects if ESP32 device is powered off
// ═══════════════════════════════════════════════════════════════════════════
const deviceLastSeen = new Map();
const OFFLINE_TIMEOUT_MS = 12000; // Mark device offline if no packet for > 12s

setInterval(() => {
  const now = Date.now();
  for (const [vId, lastSeen] of deviceLastSeen.entries()) {
    if (now - lastSeen > OFFLINE_TIMEOUT_MS) {
      if (localTelemetry[vId] && localTelemetry[vId].isOnline !== false) {
        console.log(`⚠️ Heartbeat Alert: Hardware device ${vId} went OFFLINE (No MQTT packet for >12s)`);
        
        const offlineDoc = {
          ...localTelemetry[vId],
          isOnline: false,
          status: 'offline',
          gpsValid: false,
          fix: false,
          lat: null,
          lng: null,
          speed: 0,
          rpm: 0,
          satellites: 0,
          lastSeen: new Date(lastSeen).toISOString(),
          offlineNotice: 'DEVICE POWERED OFF / DISCONNECTED'
        };

        localTelemetry[vId] = offlineDoc;
        broadcast({ type: 'TELEMETRY_UPDATE', vehicleId: vId, data: offlineDoc });

        if (rtdb) {
          set(ref(rtdb, 'telemetry/' + vId), offlineDoc).catch(() => {});
        }
      }
    }
  }
}, 3000);

// Authenticate Backend Server with Firebase Auth
signInWithEmailAndPassword(auth, "esp32@ibots.academy", "IbotsGPS2026!")
  .then((userCred) => {
    console.log(`🔐 Firebase Auth: Backend successfully authenticated as ${userCred.user.email} (UID: ${userCred.user.uid})`);
  })
  .catch((authErr) => {
    console.warn(`⚠️ Firebase Auth Warning: ${authErr.message}`);
  });

// Start Server on 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 IBOTS GPS Firebase Backend running on http://localhost:${PORT}`);
  console.log(`📡 MQTT Subscriber active — listening for ESP32 hardware data`);
});
