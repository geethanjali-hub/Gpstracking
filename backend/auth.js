import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Secrets (can be overridden by environment variables)
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'ibots_gps_access_secret_2026_super_secure';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'ibots_gps_refresh_secret_2026_super_secure';

const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days long-lived refresh token

// In-Memory User Database with Bcrypt Hashed Passwords
// Default password for all seed accounts: "IbotsGPS2026!"
const DEFAULT_HASH = bcrypt.hashSync('IbotsGPS2026!', 10);

export const usersDb = [
  {
    id: 'usr-admin-01',
    username: 'admin',
    email: 'admin@ibots.academy',
    passwordHash: DEFAULT_HASH,
    role: 'admin',
    name: 'System Administrator',
    assignedVehicle: 'All Fleet Vehicles',
    tokenVersion: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr-operator-01',
    username: 'operator',
    email: 'operator@ibots.academy',
    passwordHash: DEFAULT_HASH,
    role: 'operator',
    name: 'Factory Dispatch Operator',
    assignedVehicle: 'Factory Fleet',
    tokenVersion: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr-viewer-01',
    username: 'viewer',
    email: 'driver@ibots.academy',
    passwordHash: DEFAULT_HASH,
    role: 'viewer',
    name: 'Customer / Driver Viewer',
    assignedVehicle: 'gps-obd-tracker-01',
    tokenVersion: 1,
    createdAt: new Date().toISOString()
  }
];

// Active Refresh Token Storage (for Token Rotation & Revocation)
export const activeRefreshTokens = new Map();

/**
 * Generate 15-minute JWT Access Token
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      name: user.name
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate 7-day JWT Refresh Token
 */
export function generateRefreshToken(user) {
  const refreshToken = jwt.sign(
    {
      id: user.id,
      tokenVersion: user.tokenVersion || 1
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  activeRefreshTokens.set(refreshToken, {
    userId: user.id,
    createdAt: Date.now()
  });

  return refreshToken;
}

/**
 * Verify Access Token
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Verify & Rotate Refresh Token
 */
export function verifyAndRotateRefreshToken(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (!activeRefreshTokens.has(refreshToken)) {
      return { error: 'Refresh token has been revoked or reused' };
    }

    const user = usersDb.find(u => u.id === payload.id);
    if (!user) {
      return { error: 'User no longer exists' };
    }

    if (payload.tokenVersion && payload.tokenVersion !== (user.tokenVersion || 1)) {
      return { error: 'Token version mismatch — user sessions invalidated' };
    }

    // Revoke old refresh token and issue new pair (Token Rotation)
    activeRefreshTokens.delete(refreshToken);
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    return {
      user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  } catch (err) {
    return { error: 'Invalid or expired refresh token' };
  }
}

/**
 * Revoke Single Refresh Token (Logout)
 */
export function revokeRefreshToken(refreshToken) {
  if (activeRefreshTokens.has(refreshToken)) {
    activeRefreshTokens.delete(refreshToken);
    return true;
  }
  return false;
}

/**
 * Revoke All Refresh Tokens for a User (Security Lock)
 */
export function revokeAllUserTokens(userId) {
  const user = usersDb.find(u => u.id === userId);
  if (user) {
    user.tokenVersion = (user.tokenVersion || 1) + 1;
    for (const [token, meta] of activeRefreshTokens.entries()) {
      if (meta.userId === userId) {
        activeRefreshTokens.delete(token);
      }
    }
  }
}

/**
 * Express Middleware: Authenticate JWT Access Token
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.split(' ')[1]
    : req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No bearer token provided.' });
  }

  const user = verifyAccessToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Token expired or invalid', code: 'TOKEN_EXPIRED' });
  }

  req.user = user;
  next();
}

/**
 * Express Middleware: Role-Based Access Control (RBAC)
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden. Role [${req.user.role}] lacks required permissions.` });
    }
    next();
  };
}
