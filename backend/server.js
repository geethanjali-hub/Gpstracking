import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
    title: "Armstrong GPS Telematics Backend API",
    version: "1.0.0",
    description: "Interactive Swagger UI documentation and live testing console for ESP32 hardware MQTT payloads, vehicle management, and telematics telemetry."
  },
  servers: [
    { url: "/", description: "Current Active Live Server" }
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
      get: {
        summary: "Get Live Fleet Telemetry & Online/Offline Status",
        description: "Returns live telemetry snapshots for all active vehicles, including coordinates, online/offline status, battery level, and speed.",
        responses: {
          "200": { description: "Dictionary of vehicle telemetry objects keyed by vehicleId" }
        }
      },
      post: {
        summary: "Push Hardware Telemetry Packet",
        description: "Endpoint used by ESP32 / SIM A7670C hardware tracker to push live 5-second telemetry payloads.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  device_id: { type: "string", example: "gps-obd-tracker-01" },
                  gps: {
                    type: "object",
                    properties: {
                      lat: { type: "number", example: 11.00659 },
                      lng: { type: "number", example: 77.01404 },
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
                      fuel_pct: { type: "number", example: 78.5 }
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
    },
    "/api/telemetry/{vehicleId}": {
      get: {
        summary: "Get Single Vehicle Live Telemetry",
        description: "Returns live telemetry object for a specific vehicle ID.",
        parameters: [
          {
            name: "vehicleId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "gps-obd-tracker-01"
          }
        ],
        responses: {
          "200": { description: "Live telemetry object for specified vehicle" }
        }
      }
    },
    "/api/history/{vehicleId}": {
      get: {
        summary: "Get Vehicle Route History",
        description: "Returns historical GPS trail coordinates logged in Firestore telemetry_history.",
        parameters: [
          {
            name: "vehicleId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "gps-obd-tracker-01"
          }
        ],
        responses: {
          "200": { description: "Array of historical route GPS points" }
        }
      }
    },
    "/api/alerts": {
      get: {
        summary: "Get Active Stationary & System Alerts",
        description: "Returns list of active 1-hour stationary alerts and system notifications.",
        responses: {
          "200": { description: "Array of alert objects" }
        }
      }
    }
  }
};

// Serve OpenAPI Specification JSON
app.get('/api-spec.json', (req, res) => {
  res.json(openApiSpec);
});

// Pure Backend Root Status API Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Armstrong GPS Telematics Backend API',
    database: 'Firebase Cloud Database (ibots-gps)',
    docs: '/docs',
    endpoints: {
      vehicles: '/api/vehicles',
      telemetry: '/api/telemetry'
    },
    timestamp: new Date().toISOString()
  });
});

// Swagger UI Dashboard Endpoint (Light Theme - available at /docs, /api-docs, /swagger)
app.get(['/docs', '/api-docs', '/swagger'], (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Armstrong GPS Backend API — Swagger UI Console</title>
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
        <h1>⚡ Armstrong GPS Telematics Backend — Interactive API Console</h1>
        <a href="https://gpstracking-zeta.vercel.app/" class="btn-ui" target="_blank">Launch Web Dashboard ➔</a>
      </div>
      <div id="swagger-ui"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-bundle.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-standalone-preset.js"></script>
      <script>
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          url: window.location.origin + "/api-spec.json",
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

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL DATABASE PERSISTENCE LAYER — JSON File Store (vehicles_db.json)
// ═══════════════════════════════════════════════════════════════════════════
const DB_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vehicles_db.json');

const defaultVehicles = [
  {
    id: 'gps-obd-tracker-01',
    name: 'gps v2',
    userName: 'System Administrator',
    vin: 'OBD_TRK_001',
    status: 'offline',
    topic: 'sedhupathi/gps-obd-tracker-01/data',
    broker: 'mqtt://test.mosquitto.org:1883',
    createdAt: new Date().toISOString()
  }
];


function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("⚠️ Local DB load warning:", err.message);
  }
  saveDatabase(defaultVehicles);
  return defaultVehicles;
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`💾 Saved ${data.length} vehicle records to local database (vehicles_db.json)`);
  } catch (err) {
    console.error("❌ Failed to save to local database file:", err.message);
  }
}

let localVehicles = loadDatabase();

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

    const isSecure = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';

    // Set Refresh Token in secure HTTP-only Cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
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

  const isSecure = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
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
    const isSecure = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
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

let localTelemetryByTopic = {};
const addressCache = new Map();

// Helper: Reverse Geocode (lat, lng) -> Road, Area, City, State, Full Address
async function getAddressFromCoords(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
    return {
      address: "Awaiting Live GPS Signal...",
      street: "Unknown Road",
      road: "Unknown Road",
      area: "Unknown Area",
      suburb: "Unknown Area",
      city: "",
      state: "",
      postcode: ""
    };
  }
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (addressCache.has(key)) {
    return addressCache.get(key);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'IBOTS-GPS-Tracking/1.0 (admin@ibots.academy)' }
    });
    if (response.ok) {
      const data = await response.json();
      const a = data.address || {};
      const street = a.road || a.pedestrian || a.footway || a.street || a.highway || a.building || a.amenity || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const area = a.suburb || a.neighbourhood || a.quarter || a.residential || a.city_district || a.locality || a.village || a.town || 'Live Area';
      const city = a.city || a.town || a.county || a.state_district || '';
      const state = a.state || '';
      const postcode = a.postcode ? `PIN: ${a.postcode}` : '';
      const fullAddress = data.display_name || [street, area, city, state, postcode].filter(Boolean).join(', ');

      const result = {
        address: fullAddress,
        street: street,
        road: street,
        area: area,
        suburb: area,
        city: city,
        state: state,
        postcode: a.postcode || ''
      };
      addressCache.set(key, result);
      return result;
    }
  } catch (err) {
    console.warn('⚠️ Reverse geocoding fetch warning:', err.message);
  }

  const fallback = {
    address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    street: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    road: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    area: 'Live Coordinates',
    suburb: 'Live Coordinates',
    city: '',
    state: '',
    postcode: ''
  };
  return fallback;
}


app.get('/api/telemetry', (req, res) => {
  const queryTopic = req.query.topic;
  if (queryTopic) {
    const data = localTelemetryByTopic[queryTopic] || Object.values(localTelemetry).find(t => t.topic === queryTopic);
    return res.json(data || { error: 'No telemetry found for specified topic', topic: queryTopic });
  }
  res.json(localTelemetry);
});

app.get('/api/telemetry/by-topic', (req, res) => {
  const topicName = req.query.name;
  if (!topicName) {
    return res.status(400).json({ error: 'Query parameter "name" (topic name) is required' });
  }
  const telemetry = localTelemetryByTopic[topicName] || Object.values(localTelemetry).find(t => t.topic === topicName);
  if (!telemetry) {
    return res.status(404).json({ error: 'No location data found for topic', topic: topicName });
  }
  res.json(telemetry);
});

app.get('/api/telemetry/:vehicleId', (req, res) => {
  const vid = req.params.vehicleId;
  res.json(localTelemetry[vid] || localTelemetryByTopic[vid] || localTelemetry['gps-obd-tracker-01'] || {});
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
    const hasFix = Boolean(fixFlag) || hasValidCoords;

    const lat = hasValidCoords ? rawLat : null;
    const lng = hasValidCoords ? rawLng : null;

    const addressDetails = await getAddressFromCoords(lat, lng);

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
      address: addressDetails.address,
      street: addressDetails.street,
      road: addressDetails.road,
      area: addressDetails.area,
      suburb: addressDetails.suburb,
      city: addressDetails.city,
      state: addressDetails.state,
      postcode: addressDetails.postcode,

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

// 2. Fetch Fleet Vehicles — Reads directly from Firebase Firestore Cloud Database ('vehicles')
app.get('/api/vehicles', async (req, res) => {
  try {
    if (db) {
      const querySnapshot = await getDocs(collection(db, 'vehicles'));
      const fbVehicles = [];
      querySnapshot.forEach(docSnap => fbVehicles.push(docSnap.data()));
      localVehicles = fbVehicles;
      return res.json(fbVehicles); // Returns [] when deleted from Firestore!
    }
  } catch (fbErr) {
    console.warn("⚠️ Firebase Firestore fetch warning:", fbErr.message);
  }
  res.json(localVehicles);
});


// 3. Register New Vehicle & Map Device / MQTT Topic / Broker directly in Firebase Firestore
app.post('/api/vehicles', async (req, res) => {
  try {
    const newVehicle = req.body;
    const vId = newVehicle.id || `gps-tracker-0${localVehicles.length + 1}`;
    
    // Extract up to 5 Emergency Phone Numbers & SMS Alert Master Status ("ON" / "OFF")
    const rawPhones = Array.isArray(newVehicle.phoneNumbers)
      ? newVehicle.phoneNumbers
      : (typeof newVehicle.phoneNumbers === 'string' ? newVehicle.phoneNumbers.split(',').map(p => p.trim()) : []);
    const phoneNumbers = rawPhones.map(p => p.trim()).filter(p => p.length > 0).slice(0, 5);
    const smsAlertStatus = (newVehicle.smsAlertStatus || newVehicle.alert_status || 'ON').toUpperCase();

    // Check if vehicle already exists
    const existingIndex = localVehicles.findIndex(v => v.id === vId);
    const vehicleData = {
      id: vId,
      name: newVehicle.name || `Tracker (${vId})`,
      userName: newVehicle.userName || 'Assigned Driver',
      vin: newVehicle.vin || `OBD_TRK_${Math.floor(1000 + Math.random() * 9000)}`,
      status: newVehicle.status || 'offline',
      topic: newVehicle.topic || `sedhupathi/${vId}/data`,
      broker: newVehicle.broker || 'mqtt://test.mosquitto.org:1883',
      phoneNumbers,
      smsAlertStatus,
      routeEnabled: true,
      geofenceEnabled: true,
      deviationThreshold: 300,
      alertSettings: {
        maxSpeed: parseInt(newVehicle.maxSpeed || 120),
        maxTemp: parseInt(newVehicle.maxTemp || 105),
        minFuel: parseInt(newVehicle.minFuel || 15)
      },
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      localVehicles[existingIndex] = { ...localVehicles[existingIndex], ...vehicleData };
    } else {
      localVehicles.push(vehicleData);
    }

    // Write directly to Firebase Firestore Cloud Database ('vehicles')
    try {
      if (db) {
        await setDoc(doc(db, 'vehicles', vId), vehicleData);
      }
      console.log(`✅ Saved vehicle ${vId} (alert_status: ${smsAlertStatus}) with ${phoneNumbers.length} emergency phone numbers directly to Firebase Firestore ('vehicles')`);
    } catch (fbErr) {
      console.warn("⚠️ Firebase Firestore write warning:", fbErr.message);
    }

    // Backup to local DB file
    saveDatabase(localVehicles);

    // Initialize telemetry slot if not present
    if (!localTelemetry[vId]) {
      localTelemetry[vId] = {
        vehicleId: vId,
        isOnline: false,
        status: 'offline',
        gpsValid: false,
        fix: false,
        lat: null,
        lng: null,
        speed: 0,
        heading: 0,
        satellites: 0,
        rpm: 0,
        fuelLevel: 0
      };
    }

    // Dynamically subscribe to the MQTT topic if provided
    if (vehicleData.topic && mqttClient && mqttClient.connected) {
      mqttClient.subscribe(vehicleData.topic, (err) => {
        if (!err) {
          console.log(`📡 MQTT: Dynamically subscribed to custom topic: ${vehicleData.topic}`);
        } else {
          console.warn(`📡 MQTT: Failed to subscribe to ${vehicleData.topic}:`, err.message);
        }
      });

      // 📱 Publish MQTT Numbers Payload to Topic: sedhupathi/<tracker_id>/number
      const numberTopic = `sedhupathi/${vId}/number`;
      const numberPayload = JSON.stringify({
        tracker_id: vId,
        alert_status: smsAlertStatus,
        numbers: phoneNumbers,
        phone_numbers: phoneNumbers,
        timestamp: new Date().toISOString()
      });
      mqttClient.publish(numberTopic, numberPayload, { qos: 1, retain: true });
      mqttClient.publish(`sedhupathi/${vId}/config`, numberPayload, { qos: 1, retain: true });
      console.log(`📡 MQTT: Broadcasted numbers payload to topic [${numberTopic}] (alert_status: ${smsAlertStatus}, count: ${phoneNumbers.length})`);
    }

    broadcast({ type: 'VEHICLE_ADDED', data: vehicleData });
    res.status(201).json(vehicleData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete Vehicle & Dynamic Device directly from Firebase Firestore Cloud Database
app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete directly from Firebase Firestore ('vehicles' and 'telemetry' collections)
    try {
      if (db) {
        await deleteDoc(doc(db, 'vehicles', id));
        await deleteDoc(doc(db, 'telemetry', id));
      }
      console.log(`🗑️ Deleted vehicle ${id} directly from Firebase Firestore ('vehicles')`);
    } catch (fbErr) {
      console.warn("⚠️ Firebase Firestore delete warning:", fbErr.message);
    }

    localVehicles = localVehicles.filter(v => v.id !== id);
    delete localTelemetry[id];
    saveDatabase(localVehicles);

    broadcast({ type: 'VEHICLE_DELETED', vehicleId: id });
    res.json({ status: 'ok', message: `Device ${id} deleted successfully from Firebase Firestore` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Delete All Telemetry Data across all vehicles from Firebase DB
app.delete('/api/telemetry', async (req, res) => {

  try {
    localTelemetry = {};
    localTelemetryByTopic = {};

    try {
      if (rtdb) {
        await set(ref(rtdb, 'telemetry'), null);
      }
      if (db) {
        const snapshot = await getDocs(collection(db, 'telemetry'));
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, 'telemetry', docSnap.id));
        }
      }
      console.log('🗑️ Deleted all vehicle telemetry data from Firebase DB (ibots-gps)');
    } catch (fbErr) {
      console.warn('⚠️ Firebase telemetry delete warning:', fbErr.message);
    }

    broadcast({ type: 'ALL_TELEMETRY_CLEARED' });
    res.json({ status: 'ok', message: 'All vehicle telemetry data deleted successfully from Firebase DB' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📲 Manual Test SMS Trigger Endpoint over MQTT for ESP32 GSM Module
app.post('/api/control/test-sms', (req, res) => {
  try {
    const { vehicleId } = req.body;
    if (!vehicleId) return res.status(400).json({ error: 'vehicleId is required' });

    const vehicle = localVehicles.find(v => v.id === vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const targetPhones = vehicle.phoneNumbers || [];
    if (targetPhones.length === 0) {
      return res.status(400).json({ error: 'No emergency phone numbers configured for this vehicle. Please add phone numbers first.' });
    }

    const numberTopic = `sedhupathi/${vehicleId}/number`;
    const smsAlertStatus = vehicle.smsAlertStatus || 'ON';
    const testSmsPayload = JSON.stringify({
      cmd: "SEND_SMS_ALERT",
      tracker_id: vehicleId,
      vehicleId,
      alert_status: smsAlertStatus,
      alertType: "TEST_SMS",
      message: `TEST ALERT: Armstrong GPS Emergency SMS System test for ${vehicle.name} (${vehicleId}).`,
      numbers: targetPhones,
      phone_numbers: targetPhones,
      timestamp: new Date().toISOString()
    });

    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(numberTopic, testSmsPayload, { qos: 1 });
      mqttClient.publish(`sedhupathi/${vehicleId}/config`, testSmsPayload, { qos: 1 });
      console.log(`📱 MQTT: Dispatched Manual Test SMS trigger to topic [${numberTopic}] for ${targetPhones.length} numbers:`, targetPhones);
    }

    res.json({
      status: 'ok',
      message: `Test SMS command sent over MQTT for ${targetPhones.length} phone numbers (${targetPhones.join(', ')})`,
      phoneNumbers: targetPhones,
      topic: numberTopic,
      alertStatus: smsAlertStatus
    });
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

// Process incoming MQTT messages from ESP32 hardware (extracts location based on topic name alone)
mqttClient.on('message', async (topic, message) => {
  try {
    const raw = JSON.parse(message.toString());
    console.log(`📡 MQTT: Received from topic [${topic}]`);

    // Extract device/tracker name strictly from topic path: e.g. "sedhupathi/tracker-01/data" -> "tracker-01"
    const topicParts = topic.split('/');
    const deviceFromTopic = (topicParts.length >= 2 && topicParts[1] !== '+') 
      ? topicParts[1] 
      : topic.replace(/\//g, '_');
      
    const vehicleId = deviceFromTopic || topic.replace(/\//g, '_');


    // Track device liveness timestamp strictly by topic & vehicleId
    const now = Date.now();
    deviceLastSeen.set(topic, now);
    deviceLastSeen.set(vehicleId, now);

    const rawLat = raw.location?.lat ?? raw.gps?.lat ?? raw.lat;
    const rawLng = raw.location?.lng ?? raw.gps?.lng ?? raw.lng;
    const hasValidCoords = typeof rawLat === 'number' && !isNaN(rawLat) && rawLat !== 0 &&
                           typeof rawLng === 'number' && !isNaN(rawLng) && rawLng !== 0;

    const fixFlag = raw.location?.fix ?? raw.gps?.fix ?? raw.gps?.valid ?? raw.fix;
    const hasFix = Boolean(fixFlag) || hasValidCoords;

    const lat = hasValidCoords ? rawLat : null;
    const lng = hasValidCoords ? rawLng : null;

    // Resolve full reverse geocoded address including street name, road name, area name, city, state
    const addressDetails = await getAddressFromCoords(lat, lng);

    // Standardized telemetry state built directly from topic + location payload
    const telemetryDoc = {
      topic,
      topicDevice: deviceFromTopic,
      vehicleId,
      source: 'mqtt_live',
      isOnline: true,
      status: 'online',

      // Location coordinates & reverse-geocoded street/area details
      gpsValid: hasFix,
      fix: hasFix,
      lat,
      lng,
      address: addressDetails.address,
      street: addressDetails.street,
      road: addressDetails.road,
      area: addressDetails.area,
      suburb: addressDetails.suburb,
      city: addressDetails.city,
      state: addressDetails.state,
      postcode: addressDetails.postcode,

      altitude: raw.location?.altitude_m ?? raw.alt ?? 0,
      speed: raw.location?.speed_kph ?? raw.speed ?? raw.spd ?? 0,
      heading: raw.location?.heading_deg ?? raw.heading ?? raw.hdg ?? 0,
      satellites: raw.location?.satellites ?? raw.sats ?? 0,
      hdop: raw.location?.hdop ?? raw.hdop ?? 0,
      accuracy: raw.location?.hdop ?? 2.5,

      // OBD & Diagnostics Data (if provided in payload)
      rpm: raw.engine?.rpm ?? raw.rpm ?? 0,
      coolantTemp: raw.engine?.coolant_temp_c ?? raw.coolant_c ?? 0,
      fuelLevel: raw.fuel?.fuel_level_pct ?? raw.fuel_pct ?? 0,
      backupBatteryPercent: raw.battery?.battery_pct ?? raw.bat_pct ?? 100,

      timestamp: new Date().toISOString()
    };

    // Store in topic lookup dictionary & vehicle lookup dictionary
    localTelemetryByTopic[topic] = telemetryDoc;
    localTelemetry[vehicleId] = telemetryDoc;

    // ⚡ 1. ZERO-DELAY WEBSOCKET BROADCAST TO FRONTEND (Executes immediately < 50ms)
    broadcast({ type: 'TELEMETRY_UPDATE', topic, vehicleId, data: telemetryDoc });

    // 📜 2. HISTORICAL ROUTE LOGGING (Stores history trail points in Firestore collection 'telemetry_history')
    if (hasValidCoords && db) {
      const historyDoc = {
        vehicleId,
        topic,
        lat,
        lng,
        heading: telemetryDoc.heading,
        speed: telemetryDoc.speed,
        address: addressDetails.address || '',
        timestamp: telemetryDoc.timestamp
      };
      addDoc(collection(db, 'telemetry_history'), historyDoc).catch(hErr => {
        console.warn(`History log skipped for ${vehicleId}:`, hErr.message);
      });
    }

    // 🚨 3. 1-HOUR STATIONARY / IDLE ALERT ENGINE (Notifies Admin, Drivers, and Operators)
    checkStationaryAlert(vehicleId, lat, lng, telemetryDoc.speed, addressDetails.address);

    // 💾 4. ASYNC CLOUD PERSISTENCE (Saves live telemetry state in Firebase Firestore & RTDB)
    try {
      if (rtdb) {
        set(ref(rtdb, 'telemetry/' + vehicleId), telemetryDoc).catch(() => {});
      }
      if (db) {
        setDoc(doc(db, 'telemetry', vehicleId), telemetryDoc, { merge: true }).catch(() => {});
      }
    } catch (fbErr) {
      console.warn(`Firebase save from MQTT for ${vehicleId} warning:`, fbErr.message);
    }
    
    console.log(`✅ MQTT Topic [${topic}]: Live location updated (fix:${hasFix}, lat:${lat}, lng:${lng}, speed:${telemetryDoc.speed})`);

  } catch (parseErr) {
    console.warn('📡 MQTT: Failed to parse message from topic', topic, parseErr.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1-HOUR STATIONARY / IDLE ALERT SYSTEM ENGINE
// Tracks stationary time per vehicle and triggers alert for Admin & Drivers if idle > 60m
// ═══════════════════════════════════════════════════════════════════════════
const vehicleStationaryTracker = new Map();

function checkStationaryAlert(vehicleId, lat, lng, speed, address) {
  if (!vehicleId) return;

  const now = Date.now();
  const existing = vehicleStationaryTracker.get(vehicleId);

  // If vehicle is moving (speed > 3 kph), reset stationary timer
  if (speed > 3 || !lat || !lng) {
    vehicleStationaryTracker.set(vehicleId, {
      lastLat: lat,
      lastLng: lng,
      since: now,
      alertEmitted: false
    });
    return;
  }

  // Calculate distance from previous stationary position in meters
  if (existing) {
    const dLat = (lat - existing.lastLat) * 111000;
    const dLng = (lng - existing.lastLng) * 111000 * Math.cos(lat * Math.PI / 180);
    const distMeters = Math.sqrt(dLat * dLat + dLng * dLng);

    // If moved more than 30 meters, reset stationary timer
    if (distMeters > 30) {
      vehicleStationaryTracker.set(vehicleId, {
        lastLat: lat,
        lastLng: lng,
        since: now,
        alertEmitted: false
      });
      return;
    }

    // Calculate idle duration in minutes
    const idleDurationMs = now - existing.since;
    const idleMinutes = Math.floor(idleDurationMs / 60000);

    // Trigger alert if stationary >= 60 minutes (or test threshold 5m if configured)
    if (idleMinutes >= 60 && !existing.alertEmitted) {
      existing.alertEmitted = true;

      const alertDoc = {
        id: `alert_stationary_${vehicleId}_${now}`,
        vehicleId,
        type: 'STATIONARY_1HR',
        title: '⚠️ 1-Hour Stationary Alert',
        message: `Vehicle ${vehicleId} has been parked/idle at ${address || 'same location'} for ${idleMinutes} minutes.`,
        address: address || 'Offline Location',
        durationMinutes: idleMinutes,
        timestamp: new Date().toISOString()
      };

      console.log(`🚨 ALERT TRIGGERED: Vehicle ${vehicleId} stationary for ${idleMinutes}m!`);

      // Store in Firebase Firestore 'alerts' collection
      if (db) {
        setDoc(doc(db, 'alerts', alertDoc.id), alertDoc).catch(() => {});
      }

      // Broadcast instant alert notification to all connected WebSockets (Admin, Operators, Drivers)
      broadcast({ type: 'ALERT_TRIGGERED', alert: alertDoc });

      // 📱 Dispatch SMS Command over MQTT to ESP32 GSM Module if alert_status is ON
      const vehicle = localVehicles.find(v => v.id === vehicleId);
      const targetPhones = vehicle?.phoneNumbers || [];
      const alertStatus = (vehicle?.smsAlertStatus || 'ON').toUpperCase();

      if (alertStatus === 'OFF') {
        console.log(`🔇 SMS Alerts disabled (alert_status=OFF) for vehicle ${vehicleId}. Skipping SMS dispatch.`);
      } else if (mqttClient && mqttClient.connected && targetPhones.length > 0) {
        const numberTopic = `sedhupathi/${vehicleId}/number`;
        const smsAlertPayload = JSON.stringify({
          cmd: "SEND_SMS_ALERT",
          tracker_id: vehicleId,
          vehicleId,
          alert_status: "ON",
          alertType: "STATIONARY_1HR",
          message: alertDoc.message,
          numbers: targetPhones,
          phone_numbers: targetPhones,
          timestamp: new Date().toISOString()
        });
        mqttClient.publish(numberTopic, smsAlertPayload, { qos: 1 });
        mqttClient.publish(`sedhupathi/${vehicleId}/config`, smsAlertPayload, { qos: 1 });
        console.log(`📱 MQTT: Dispatched SMS alert to ESP32 GSM Module on topic [${numberTopic}] for ${targetPhones.length} numbers`);
      }
    }
  } else {
    vehicleStationaryTracker.set(vehicleId, {
      lastLat: lat,
      lastLng: lng,
      since: now,
      alertEmitted: false
    });
  }
}

// REST APIs for Route History Replay & Stationary Alerts
app.get('/api/history/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    if (db) {
      const snapshot = await getDocs(collection(db, 'telemetry_history'));
      const points = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        if (d.vehicleId === vehicleId && d.lat && d.lng) {
          points.push(d);
        }
      });
      // Sort chronologically by timestamp
      points.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return res.json(points);
    }
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    if (db) {
      const snapshot = await getDocs(collection(db, 'alerts'));
      const alertList = [];
      snapshot.forEach(docSnap => alertList.push(docSnap.data()));
      alertList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return res.json(alertList);
    }
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE LIVENESS & OFFLINE DETECTION MONITOR
// Runs every 4 seconds — marks device offline if no packet for > 20s
// ═══════════════════════════════════════════════════════════════════════════
const deviceLastSeen = new Map();
const OFFLINE_TIMEOUT_MS = 20000; // Mark device offline if no packet for > 20s

setInterval(() => {
  const now = Date.now();
  for (const [vId, lastSeen] of deviceLastSeen.entries()) {
    if (now - lastSeen > OFFLINE_TIMEOUT_MS) {
      const existingDoc = localTelemetryByTopic[vId] || localTelemetry[vId];
      if (existingDoc && existingDoc.isOnline !== false) {
        console.log(`⚠️ Heartbeat Alert: Hardware device/topic ${vId} went OFFLINE (No MQTT packet for >20s)`);
        
        const offlineDoc = {
          ...existingDoc,
          isOnline: false,
          status: 'offline',
          lat: null,
          lng: null,
          address: 'Offline',
          street: 'Offline',
          road: 'Offline',
          area: 'Offline',
          suburb: 'Offline',
          speed: 0,
          rpm: 0,
          satellites: 0,
          lastSeen: new Date(lastSeen).toISOString(),
          offlineNotice: 'DEVICE POWERED OFF / DISCONNECTED'
        };


        if (existingDoc.topic) {
          localTelemetryByTopic[existingDoc.topic] = offlineDoc;
        }
        localTelemetry[vId] = offlineDoc;
        broadcast({ type: 'TELEMETRY_UPDATE', vehicleId: vId, data: offlineDoc });


        if (rtdb) {
          set(ref(rtdb, 'telemetry/' + vId), offlineDoc).catch(() => {});
        }
      }
    }
  }
}, 5000);


// Authenticate Backend Server with Firebase Auth
signInWithEmailAndPassword(auth, "esp32@ibots.academy", "IbotsGPS2026!")
  .then((userCred) => {
    console.log(`🔐 Firebase Auth: Backend successfully authenticated as ${userCred.user.email} (UID: ${userCred.user.uid})`);
  })
  .catch((authErr) => {
    console.warn(`⚠️ Firebase Auth Warning: ${authErr.message}`);
  });

// Serve production frontend static assets if available
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.join(__dirname, '../frontend/dist');

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(frontendDistPath, 'index.html'));
    }
    next();
  });
}

// Start Server on 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 IBOTS GPS Firebase Backend running on http://localhost:${PORT}`);
  console.log(`📡 MQTT Subscriber active — listening for ESP32 hardware data`);
});
