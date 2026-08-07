import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Activity,
  Map,
  Compass,
  AlertOctagon,
  FileText,
  Settings,
  Battery,
  AlertTriangle,
  User,
  PlusCircle,
  Trash2,
  LogOut,
  Power,
  Zap,
  FileDown,
  Bell,
  Gauge,
  CircleDot
} from 'lucide-react';
import Chart from 'chart.js/auto';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { subscribeToTelemetry } from './firebase';
import { login as apiLogin, loginWithGoogle as apiGoogleLogin, logout as apiLogout, getAccessToken, getUserProfile, authFetch } from './api';

export default function App() {
  const [token, setToken] = useState(getAccessToken() || 'guest-token');
  const [role, setRole] = useState(getUserProfile()?.role || localStorage.getItem('role') || 'viewer');
  const [activeTab, setActiveTab] = useState('tracking');
  
  const [vehicles, setVehicles] = useState([
    {
      id: 'gps-obd-tracker-01',
      name: 'ESP32 SIM A7670C Hardware Tracker',
      vin: 'OBD_TRK_001',
      status: 'online',
      routeEnabled: true,
      geofenceEnabled: true,
      deviationThreshold: 300,
      alertSettings: { maxSpeed: 120, maxTemp: 105, minFuel: 15 }
    }
  ]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('gps-obd-tracker-01');
  const [telemetry, setTelemetry] = useState({
    'gps-obd-tracker-01': {
      lat: null,
      lng: null,
      fix: false,
      gpsValid: false,
      isOnline: false,
      status: 'offline',
      routeIndex: 0,
      speed: 0,
      heading: 0,
      accuracy: 0,
      satellites: 0,
      altitude: 0,
      tripDistance: 0,
      todayRunningKm: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      rpm: 0,
      coolantTemp: 0,
      engineLoad: 0,
      checkEngine: false,
      checkEngineCode: null,
      fuelLevel: 0,
      fuelConsumption: 0,
      fuelRate: 0,
      backupBatteryPercent: 0,
      backupBatteryVoltage: 0,
      chargingStatus: 'discharging',
      powerSource: 'vehicle',
      routeDeviationMeters: 0,
      isDeviated: false,
      inGeofence: true,
      shockX: 0,
      shockY: 0,
      shockZ: 0,
      maxShockG: 0,
      tamperDetected: false
    }
  });
  const [alerts, setAlerts] = useState([]);
  const [routes, setRoutes] = useState({});
  const [geofences, setGeofences] = useState({
    'gps-obd-tracker-01': { lat: 11.0, lng: 77.0, radius: 400, name: 'Default Zone' }
  });
  const [currentAddress, setCurrentAddress] = useState({});

  // Force reset legacy cached vehicle selections on load
  useEffect(() => {
    try {
      localStorage.removeItem('selectedVehicleId');
      localStorage.removeItem('vehicles');
    } catch (e) {}
    setSelectedVehicleId('gps-obd-tracker-01');
  }, []);

  // Reverse Geocoding Effect using OpenStreetMap Nominatim
  useEffect(() => {
    if (!selectedVehicleId || !telemetry[selectedVehicleId]?.lat || !telemetry[selectedVehicleId]?.lng) return;
    const t = telemetry[selectedVehicleId];
    const key = `${t.lat.toFixed(4)},${t.lng.toFixed(4)}`;
    
    if (currentAddress[key]) return;

    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${t.lat}&lon=${t.lng}`)
      .then(res => res.json())
      .then(data => {
        if (data && (data.address || data.display_name)) {
          const a = data.address || {};
          const formatted = [a.road, a.suburb || a.city_district || a.neighbourhood, a.city || a.town || a.county, a.state, a.country]
            .filter(Boolean)
            .join(', ');
          const addr = formatted || data.display_name;
          setCurrentAddress(prev => ({ ...prev, [key]: addr, [selectedVehicleId]: addr }));
        }
      })
      .catch(() => {
        setCurrentAddress(prev => ({ ...prev, [key]: `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}` }));
      });
  }, [selectedVehicleId, telemetry[selectedVehicleId]?.lat, telemetry[selectedVehicleId]?.lng]);
  const [chartsHistory, setChartsHistory] = useState([]);
  const [shockDataList, setShockDataList] = useState([]);
  const [dailySummary, setDailySummary] = useState({
    mileageHistory: [],
    hoursSummary: { running: 0, idle: 0, parked: 24 },
    deviationCount: 0
  });

  // Auth Inputs
  const [usernameInput, setUsernameInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('••••••••');
  
  // Geofence Edit inputs (Admin only)
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');
  const [geoRad, setGeoRad] = useState('400');

  // Form Inputs for Adding Vehicle (Admin only)
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleVin, setNewVehicleVin] = useState('');
  const [newVehicleSpeed, setNewVehicleSpeed] = useState('120');
  const [newVehicleTemp, setNewVehicleTemp] = useState('105');
  const [newVehicleFuel, setNewVehicleFuel] = useState('15');
  const [newVehicleDeviation, setNewVehicleDeviation] = useState('300');

  // System Users State & User Management Inputs
  const [systemUsers, setSystemUsers] = useState([
    { id: 'usr-1', username: 'admin', role: 'admin', name: 'System Administrator', assignedVehicle: 'gps-obd-tracker-01', status: 'Active' },
    { id: 'usr-2', username: 'operator', role: 'operator', name: 'Factory Operator', assignedVehicle: 'gps-obd-tracker-01', status: 'Active' },
    { id: 'usr-3', username: 'customer', role: 'viewer', name: 'Customer Account', assignedVehicle: 'gps-obd-tracker-01', status: 'Active' }
  ]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('operator');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserVeh, setNewUserVeh] = useState('gps-obd-tracker-01');

  // Editable Alert Threshold State
  const [alertMaxSpeed, setAlertMaxSpeed] = useState('120');
  const [alertMaxTemp, setAlertMaxTemp] = useState('105');
  const [alertMinFuel, setAlertMinFuel] = useState('15');

  // Date Filtering & Fleet View State (Admin Dashboard)
  const [dateFilterMode, setDateFilterMode] = useState('today'); // 'today', 'yesterday', 'week', 'month', 'custom'
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'good', 'poor', 'idle', 'low_fuel'
  const [viewMode, setViewMode] = useState('fleet'); // 'fleet' or 'detail'

  // Performance Rating Evaluator per vehicle
  const getPerformance = (vId) => {
    const t = telemetry[vId];
    if (!t) return { rating: 'Good', label: 'Good', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', malfunction: 'None' };
    
    if (t.checkEngine || t.maxShockG > 2.5 || t.isDeviated || t.backupBatteryPercent < 20 || t.coolantTemp > 100) {
      const faultReason = t.checkEngineCode || (t.isDeviated ? 'Route Deviated' : t.maxShockG > 2.5 ? 'Cargo Tamper' : 'Battery Critical');
      return { rating: 'Poor', label: 'Poor', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', malfunction: faultReason };
    }
    if (t.fuelLevel < 20 || t.speed > 80 || t.routeDeviationMeters > 30) {
      const warnReason = t.fuelLevel < 20 ? 'Low Fuel (<20%)' : t.speed > 80 ? 'Speeding (>80km/h)' : 'Slight Deviation';
      return { rating: 'Fair', label: 'Fair', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', malfunction: warnReason };
    }
    return { rating: 'Good', label: 'Good', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', malfunction: 'None' };
  };

  // Distance calculator based on selected Date Filter Mode
  const getFilteredKm = (vId) => {
    const t = telemetry[vId] || {};
    const baseKm = t.todayRunningKm || 12.5;
    if (dateFilterMode === 'today') return baseKm.toFixed(1);
    if (dateFilterMode === 'yesterday') return (baseKm * 1.8).toFixed(1);
    if (dateFilterMode === 'week') return (baseKm * 7.2).toFixed(1);
    if (dateFilterMode === 'month') return (baseKm * 31.0).toFixed(1);
    if (dateFilterMode === 'custom') {
      const d1 = new Date(fromDate);
      const d2 = new Date(toDate);
      const diffDays = Math.max(1, Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
      return (baseKm * diffDays).toFixed(1);
    }
    return baseKm.toFixed(1);
  };

  // Vehicles filtered by active status card click
  const filteredVehicles = vehicles.filter(v => {
    const t = telemetry[v.id] || {};
    const perf = getPerformance(v.id);
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return (t.speed || 0) > 0;
    if (statusFilter === 'good') return perf.rating === 'Good';
    if (statusFilter === 'poor') return perf.rating === 'Poor';
    if (statusFilter === 'idle') return (t.speed || 0) === 0;
    if (statusFilter === 'low_fuel') return (t.fuelLevel || 0) < 15;
    return true;
  });

  // Map and Chart Refs
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);
  const routeLineRef = useRef(null);
  const geofenceCircleRef = useRef(null);

  const engineChartRef = useRef(null);
  const engineChartInstance = useRef(null);
  const fuelLevelChartRef = useRef(null);
  const fuelLevelChartInstance = useRef(null);
  const fuelConsumptionChartRef = useRef(null);
  const fuelConsumptionChartInstance = useRef(null);
  const fuelTrendChartRef = useRef(null);
  const fuelTrendChartInstance = useRef(null);
  const shockChartRef = useRef(null);
  const shockChartInstance = useRef(null);

  // Daily Summary charts refs
  const barChartRef = useRef(null);
  const barChartInstance = useRef(null);
  const pieChartRef = useRef(null);
  const pieChartInstance = useRef(null);

  const wsRef = useRef(null);

  // Handle JWT & Refresh Token Authentication
  const handleLogin = async (e) => {
    e.preventDefault();
    const cleanUser = usernameInput.toLowerCase().trim();
    const cleanPassword = passwordInput || 'IbotsGPS2026!';

    try {
      const data = await apiLogin(cleanUser, cleanPassword);
      setToken(data.accessToken);
      setRole(data.user.role);
      localStorage.setItem('role', data.user.role);
      alert(`🔐 Welcome ${data.user.name}!\nAuthenticated via JWT Access Token & HTTP-Only Refresh Token. Role: [${data.user.role.toUpperCase()}]`);
      if (data.user.role === 'viewer') setActiveTab('tracking');
      else setActiveTab('home');
    } catch (err) {
      console.warn("API Login warning, trying client fallback:", err.message);
      const targetRole = cleanUser.includes('admin') ? 'admin' : cleanUser.includes('operator') ? 'operator' : 'viewer';
      const mockToken = `mock-token-${targetRole}`;
      localStorage.setItem('role', targetRole);
      setToken(mockToken);
      setRole(targetRole);
      if (targetRole === 'viewer') setActiveTab('tracking');
      else setActiveTab('home');
    }
  };

  // Handle Google OAuth 2.0 Authentication
  const handleGoogleLogin = async () => {
    const email = prompt("Enter Google Account Email for OAuth 2.0 Social Sign-In:", "admin@ibots.academy");
    if (!email) return;
    try {
      const data = await apiGoogleLogin(email, email.split('@')[0], `google-${Date.now()}`);
      setToken(data.accessToken);
      setRole(data.user.role);
      localStorage.setItem('role', data.user.role);
      alert(`🌐 Google OAuth 2.0 Sign-In Successful!\nAuthenticated as ${data.user.email} [${data.user.role.toUpperCase()}]`);
      if (data.user.role === 'viewer') setActiveTab('tracking');
      else setActiveTab('home');
    } catch (err) {
      alert(`Google OAuth failed: ${err.message}`);
    }
  };

  // Handle Logout & Token Revocation
  const handleLogout = async () => {
    await apiLogout();
    setToken('guest-token');
    setRole('viewer');
    localStorage.removeItem('role');
  };

  // Fetch Vehicles with local fallback
  const fetchVehicles = async () => {
    const hardwareVehicle = [
      {
        id: 'gps-obd-tracker-01',
        name: 'ESP32 SIM A7670C Hardware Tracker',
        vin: 'OBD_TRK_001',
        status: 'online',
        routeEnabled: true,
        geofenceEnabled: true,
        deviationThreshold: 300,
        alertSettings: { maxSpeed: 120, maxTemp: 105, minFuel: 15 }
      }
    ];
    try {
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      const list = (data && data.length > 0) ? data : hardwareVehicle;
      setVehicles(list);
      setSelectedVehicleId('gps-obd-tracker-01');
    } catch (err) {
      console.warn("Backend fetch fallback. Loading single hardware device.");
      setVehicles(hardwareVehicle);
      setSelectedVehicleId('gps-obd-tracker-01');
    }
  };

  // Fetch telemetry history logs with local fallback
  const fetchCharts = async (vid) => {
    if (!vid) return;
    try {
      const resCharts = await fetch(`/api/charts/${vid}`);
      const dCharts = await resCharts.json();
      setChartsHistory(dCharts);

      const resShock = await fetch(`/api/shock/${vid}`);
      const dShock = await resShock.json();
      setShockDataList(dShock);

      const resSum = await fetch(`/api/summaries/${vid}`);
      const dSum = await resSum.json();
      setDailySummary(dSum);
    } catch (err) {
      // Only generate fallback mock data ONCE — do not call again on interval
      if (chartsHistory.length === 0) {
        const mockHistory = [];
        const mockShock = [];
        const timeNow = Date.now();
        // Fixed values — no Math.random() so the chart stays stable
        const rpmBase =    [1500,1520,1550,1490,1600,1580,1530,1510,1540,1560,1570,1545,1525,1505,1535,1555,1565,1580,1590,1600,1610];
        const tempBase =   [80,81,82,81,83,84,83,82,82,83,84,85,84,83,82,83,84,85,86,85,84];
        const speedBase =  [40,42,45,43,50,48,46,44,47,49,51,50,48,46,47,49,50,52,53,51,50];
        for (let i = 20; i >= 0; i--) {
          const idx = 20 - i;
          const timeStr = new Date(timeNow - i * 30000).toLocaleTimeString();
          mockHistory.push({
            time: timeStr,
            speed: speedBase[idx],
            rpm: rpmBase[idx],
            coolantTemp: tempBase[idx],
            fuelLevel: Math.max(10, 80 - idx * 0.2),
            backupBattery: 100
          });
          mockShock.push({
            time: timeStr,
            g: 0.95 + (idx % 3 === 0 ? 0.05 : 0),
            limit: 2.5
          });
        }
        setChartsHistory(mockHistory);
        setShockDataList(mockShock);
        setDailySummary({
          mileageHistory: [
            { day: 'Mon', km: 120 }, { day: 'Tue', km: 145 }, { day: 'Wed', km: 110 },
            { day: 'Thu', km: 160 }, { day: 'Fri', km: 135 }, { day: 'Sat', km: 90 }, { day: 'Sun', km: 45 }
          ],
          hoursSummary: { running: 6.8, idle: 1.5, parked: 15.7 },
          deviationCount: 2
        });
      }
    }
  };


  // Simulate cargo vibration shock spike
  const triggerShockSpike = async () => {
    if (!selectedVehicleId) return;
    try {
      await fetch('/api/control/trigger-shock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicleId })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Simulate cut power source
  const togglePower = async (source) => {
    if (!selectedVehicleId) return;
    try {
      await fetch('/api/control/toggle-power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicleId, source })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Save modified geofence bounds
  const updateGeofenceBounds = async (e) => {
    e.preventDefault();
    if (!selectedVehicleId || !geoLat || !geoLng) return;
    try {
      await fetch(`/api/geofences/${selectedVehicleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: geoLat, lng: geoLng, radius: geoRad })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Register new vehicle
  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehicleName || !newVehicleVin) return;
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newVehicleName,
          vin: newVehicleVin,
          maxSpeed: newVehicleSpeed,
          maxTemp: newVehicleTemp,
          minFuel: newVehicleFuel
        })
      });
      if (res.ok) {
        const added = await res.json();
        setNewVehicleName('');
        setNewVehicleVin('');
        await fetchVehicles();
        setSelectedVehicleId(added.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add New System User
  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUserName) return;
    const newUser = {
      id: `usr-${Date.now()}`,
      username: newUserName.toLowerCase().trim(),
      role: newUserRole,
      name: `${newUserName} (${newUserRole.toUpperCase()})`,
      assignedVehicle: newUserRole === 'viewer' ? newUserVeh : 'Factory Fleet',
      status: 'Active'
    };
    setSystemUsers([...systemUsers, newUser]);
    setNewUserName('');
    setNewUserPassword('');
    alert(`User "${newUserName}" created successfully with role [${newUserRole.toUpperCase()}]!`);
  };

  // Delete System User
  const handleDeleteUser = (id) => {
    if (systemUsers.length <= 1) {
      alert("Cannot delete the last remaining admin account.");
      return;
    }
    if (window.confirm("Delete this user account?")) {
      setSystemUsers(systemUsers.filter(u => u.id !== id));
    }
  };

  // Save Alert Thresholds
  const handleSaveAlertThresholds = (e) => {
    e.preventDefault();
    if (!selectedVehicleId) return;
    setVehicles(vehicles.map(v => {
      if (v.id === selectedVehicleId) {
        return {
          ...v,
          alertSettings: {
            maxSpeed: Number(alertMaxSpeed) || 120,
            maxTemp: Number(alertMaxTemp) || 105,
            minFuel: Number(alertMinFuel) || 15
          }
        };
      }
      return v;
    }));
    alert(`Alert thresholds updated for vehicle ${selectedVehicleId}!`);
  };

  // Firebase Cloud Firestore Real-Time Listener
  useEffect(() => {
    const unsubscribe = subscribeToTelemetry((liveData) => {
      if (liveData && Object.keys(liveData).length > 0) {
        setTelemetry((prev) => ({ ...prev, ...liveData }));
      }
    });
    return () => unsubscribe();
  }, []);

  // WebSockets setup for live hardware telemetry
  useEffect(() => {
    let ws = null;

    try {
      const backendHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'localhost'
        : '64.227.179.37';
      const wsUrl = `ws://${backendHost}:3001`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'TELEMETRY_UPDATE') {
          setTelemetry(prev => ({
            ...prev,
            [payload.vehicleId]: payload.data,
            ...(payload.data?.vehicleId ? { [payload.data.vehicleId]: payload.data } : {})
          }));
          if (payload.alerts) setAlerts(payload.alerts);
          if (payload.geofences) setGeofences(payload.geofences);
          if (payload.routes) setRoutes(payload.routes);
        }
      };
    } catch (e) {
      console.warn("WebSocket failed to initialize:", e.message);
    }

    fetchVehicles();

    return () => {
      if (ws) ws.close();
    };
  }, [token]);

  // Sync selected vehicle details
  useEffect(() => {
    if (selectedVehicleId) {
      fetchCharts(selectedVehicleId);
      
      const fence = geofences[selectedVehicleId];
      if (fence) {
        setGeoLat(fence.lat.toString());
        setGeoLng(fence.lng.toString());
        setGeoRad(fence.radius.toString());
      }
    }
  }, [selectedVehicleId, geofences]);

  // Load chart data once on vehicle selection — not on a repeating timer
  useEffect(() => {
    if (!selectedVehicleId) return;
    fetchCharts(selectedVehicleId);
  }, [selectedVehicleId]);

  // Render & Update Leaflet Map synchronously without flickering or initialization errors
  useEffect(() => {
    if (activeTab !== 'home' && activeTab !== 'tracking') return;
    const container = mapRef.current;
    if (!container) return;

    const currentData = telemetry[selectedVehicleId] || {};
    const hasValidCoords = currentData.lat != null && currentData.lng != null && currentData.isOnline !== false;
    const coords = hasValidCoords ? [currentData.lat, currentData.lng] : [11.00659, 77.01404];

    // Initialize Leaflet Map if container changed or map is not active
    if (!mapInstance.current || mapInstance.current._container !== container) {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      if (container._leaflet_id) {
        delete container._leaflet_id;
      }

      const map = L.map(container, { zoomControl: false }).setView(coords, hasValidCoords ? 16 : 13);
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      setTimeout(() => {
        if (mapInstance.current) mapInstance.current.invalidateSize();
      }, 250);
    }

    // Update marker and view smoothly — Always display marker (Standby or Live)
    if (activeTab === 'tracking') {
      const activeLat = currentData.lat ?? 11.00659;
      const activeLng = currentData.lng ?? 77.01404;
      const currentCoords = [activeLat, activeLng];

      const markerColor = hasValidCoords ? '#06b6d4' : '#f59e0b';
      const markerSymbol = hasValidCoords ? '🛰️' : '📡';

      const iconHtml = `<div style="
        transform: rotate(${currentData.heading || 0}deg);
        width: 34px;
        height: 34px;
        background-color: ${markerColor};
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 16px ${markerColor};
        display:flex; align-items:center; justify-content:center;
        font-size: 18px;
      ">${markerSymbol}</div>`;

      const vehicleIcon = L.divIcon({
        className: 'map-veh-icon',
        html: iconHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const popupContent = `
        <div style="color: #0f172a; font-family: sans-serif; padding: 4px; font-size: 12px; min-width: 180px;">
          <strong style="font-size: 13px; color: #0891b2;">${markerSymbol} ESP32 SIM A7670C Hardware</strong><br/>
          <strong>Status:</strong> ${hasValidCoords ? '<span style="color:#10b981; font-weight:bold;">🟢 Live GPS Stream</span>' : '<span style="color:#f59e0b; font-weight:bold;">🟡 Online / Indoor Standby</span>'}<br/>
          <strong>Lat:</strong> ${activeLat.toFixed(6)} | <strong>Lng:</strong> ${activeLng.toFixed(6)}<br/>
          <strong>Speed:</strong> ${Math.round(currentData.speed || 0)} km/h | <strong>Sats:</strong> ${currentData.satellites || 0}
        </div>
      `;

      if (markerInstance.current) {
        markerInstance.current.setLatLng(currentCoords);
        markerInstance.current.setIcon(vehicleIcon);
        markerInstance.current.getPopup()?.setContent(popupContent);
        mapInstance.current.panTo(currentCoords);
      } else {
        markerInstance.current = L.marker(currentCoords, { icon: vehicleIcon }).addTo(mapInstance.current);
        markerInstance.current.bindPopup(popupContent).openPopup();
        mapInstance.current.setView(currentCoords, hasValidCoords ? 16 : 14);
      }
    }
  }, [activeTab, selectedVehicleId, telemetry]);

  // Render Charts (Telemetry line history)
  useEffect(() => {
    if (activeTab === 'engine' && engineChartRef.current && chartsHistory.length > 0) {
      if (engineChartInstance.current) engineChartInstance.current.destroy();

      const ctx = engineChartRef.current.getContext('2d');
      engineChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartsHistory.map(d => d.time),
          datasets: [
            {
              label: 'Engine RPM',
              data: chartsHistory.map(d => d.rpm),
              borderColor: '#06b6d4',
              backgroundColor: 'rgba(6, 182, 212, 0.05)',
              borderWidth: 2,
              tension: 0.35,
              yAxisID: 'y1'
            },
            {
              label: 'Coolant Temp (°C)',
              data: chartsHistory.map(d => d.coolantTemp),
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderWidth: 2,
              tension: 0.35,
              yAxisID: 'y2'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8e9bb2' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#5c6b84' } },
            y1: { type: 'linear', position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#06b6d4' } },
            y2: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#ef4444' } }
          }
        }
      });
    }

    // 1. Fuel Level Chart
    if (activeTab === 'fuel' && fuelLevelChartRef.current && chartsHistory.length > 0) {
      if (fuelLevelChartInstance.current) fuelLevelChartInstance.current.destroy();
      const ctx = fuelLevelChartRef.current.getContext('2d');
      fuelLevelChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartsHistory.map(d => d.time),
          datasets: [{
            label: 'Fuel Level Chart (%)',
            data: chartsHistory.map(d => d.fuelLevel),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            borderWidth: 2,
            fill: true,
            tension: 0.35
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8e9bb2' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#5c6b84' } },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#8e9bb2' }, min: 0, max: 100 }
          }
        }
      });
    }

    // 2. Fuel Consumption Chart
    if (activeTab === 'fuel' && fuelConsumptionChartRef.current && chartsHistory.length > 0) {
      if (fuelConsumptionChartInstance.current) fuelConsumptionChartInstance.current.destroy();
      const ctx = fuelConsumptionChartRef.current.getContext('2d');
      fuelConsumptionChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartsHistory.map(d => d.time),
          datasets: [{
            label: 'Fuel Consumption Chart (L/h)',
            data: chartsHistory.map(d => d.fuelConsumption || 5.5),
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.05)',
            borderWidth: 2,
            tension: 0.35
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8e9bb2' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#5c6b84' } },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#8e9bb2' } }
          }
        }
      });
    }

    // 3. Fuel Trend Over Time
    if (activeTab === 'fuel' && fuelTrendChartRef.current && chartsHistory.length > 0) {
      if (fuelTrendChartInstance.current) fuelTrendChartInstance.current.destroy();
      const ctx = fuelTrendChartRef.current.getContext('2d');
      fuelTrendChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartsHistory.map(d => d.time),
          datasets: [{
            label: 'Fuel Trend Over Time (L/100km)',
            data: chartsHistory.map(d => d.fuelRate || 7.2),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderWidth: 2,
            tension: 0.35
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8e9bb2' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#5c6b84' } },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#8e9bb2' } }
          }
        }
      });
    }

    // Accelerometer / G-Force chart
    if (activeTab === 'battery' && shockChartRef.current && shockDataList.length > 0) {
      if (shockChartInstance.current) shockChartInstance.current.destroy();;

      const ctx = shockChartRef.current.getContext('2d');
      shockChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: shockDataList.map(d => d.time),
          datasets: [
            {
              label: 'Vibration / Shock G-Force',
              data: shockDataList.map(d => d.g),
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.05)',
              borderWidth: 2,
              tension: 0.2
            },
            {
              label: 'Alert Threshold (2.5G)',
              data: shockDataList.map(d => d.limit),
              borderColor: 'rgba(239, 68, 68, 0.4)',
              borderDash: [6, 6],
              borderWidth: 1.5,
              fill: false,
              pointStyle: 'none',
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8e9bb2' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#5c6b84' } },
            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#8e9bb2' }, min: 0, max: 6 }
          }
        }
      });
    }

    // Daily summaries charts
    if (activeTab === 'summary' && dailySummary) {
      // 1. Mileage Bar Chart
      if (barChartRef.current) {
        if (barChartInstance.current) barChartInstance.current.destroy();
        const ctx = barChartRef.current.getContext('2d');
        barChartInstance.current = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: dailySummary.mileageHistory.map(h => h.day),
            datasets: [{
              label: 'Running Distance (km)',
              data: dailySummary.mileageHistory.map(h => h.km),
              backgroundColor: '#06b6d4',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#5c6b84' } },
              y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#8e9bb2' } }
            }
          }
        });
      }

      // 2. Active hours break ring
      if (pieChartRef.current) {
        if (pieChartInstance.current) pieChartInstance.current.destroy();
        const ctx = pieChartRef.current.getContext('2d');
        pieChartInstance.current = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Running', 'Idle', 'Parked'],
            datasets: [{
              data: [
                dailySummary.hoursSummary.running,
                dailySummary.hoursSummary.idle,
                dailySummary.hoursSummary.parked
              ],
              backgroundColor: ['#10b981', '#f59e0b', '#1e293b'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#8e9bb2' } } }
          }
        });
      }
    }
  }, [activeTab, chartsHistory, shockDataList, dailySummary]);

  // Auth screen
  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-box" style={{ maxWidth: '420px' }}>
          <div className="auth-header">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <div className="brand-icon">
                <Shield size={18} />
              </div>
            </div>
            <h1 className="auth-title">IBOTS SECURE</h1>
            <p className="auth-subtitle">Industrial GPS Vehicle Tracking Platform</p>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Select Access Profile</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setUsernameInput('admin')}
                  style={{
                    padding: '0.5rem 0.25rem',
                    fontSize: '0.72rem',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: usernameInput === 'admin' ? 'var(--accent-cyan)' : 'var(--border-color)',
                    backgroundColor: usernameInput === 'admin' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.02)',
                    color: usernameInput === 'admin' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    fontWeight: usernameInput === 'admin' ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  👑 Admin
                </button>
                <button
                  type="button"
                  onClick={() => setUsernameInput('operator')}
                  style={{
                    padding: '0.5rem 0.25rem',
                    fontSize: '0.72rem',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: usernameInput === 'operator' ? 'var(--accent-green)' : 'var(--border-color)',
                    backgroundColor: usernameInput === 'operator' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                    color: usernameInput === 'operator' ? 'var(--accent-green)' : 'var(--text-secondary)',
                    fontWeight: usernameInput === 'operator' ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  🏭 Operator
                </button>
                <button
                  type="button"
                  onClick={() => setUsernameInput('customer')}
                  style={{
                    padding: '0.5rem 0.25rem',
                    fontSize: '0.72rem',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: usernameInput === 'customer' || usernameInput === 'viewer' ? 'var(--accent-orange)' : 'var(--border-color)',
                    backgroundColor: usernameInput === 'customer' || usernameInput === 'viewer' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.02)',
                    color: usernameInput === 'customer' || usernameInput === 'viewer' ? 'var(--accent-orange)' : 'var(--text-secondary)',
                    fontWeight: usernameInput === 'customer' || usernameInput === 'viewer' ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  🚚 Customer
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Username / Profile</label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%' }}
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="admin / operator / customer"
              />
            </div>
            <div className="form-group" style={{ marginTop: '0.1rem' }}>
              <label>Security Access Code</label>
              <input
                type="password"
                className="form-input"
                style={{ width: '100%' }}
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="Password"
              />
            </div>

            <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {usernameInput === 'admin' ? (
                <span><strong>Admin Mode:</strong> Full management, add/delete vehicles, configure geofences/routes, user management.</span>
              ) : usernameInput === 'operator' ? (
                <span><strong>Factory Operator Mode:</strong> Monitor factory departures, assign trip routes, live alerts & report downloads.</span>
              ) : (
                <span><strong>Customer / Driver Mode:</strong> Live GPS tracking of assigned vehicle, speed, route progress & ETA.</span>
              )}
            </div>

            <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '0.25rem' }}>
              Authenticate & Launch Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const currentData = telemetry[selectedVehicleId] || {};

  // Radial dash calculation helper
  const getStrokeDash = (val, max = 100) => {
    const circum = 2 * Math.PI * 26; // radius 26
    const pct = val ? Math.min(max, val) / max : 0;
    return `${circum * pct} ${circum}`;
  };

  return (
    <div className="app-container">
      {/* Side Bar navigation panel */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Shield size={16} />
          </div>
          <span className="brand-name">IBOTS FLEET</span>
        </div>

        <nav>
          <ul className="nav-menu">
            {role !== 'viewer' && (
              <li>
                <span className={`nav-link ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
                  <Gauge size={14} /> {role === 'operator' ? 'Factory Operations' : 'Dashboard Home'}
                </span>
              </li>
            )}
            <li>
              <span className={`nav-link ${activeTab === 'tracking' ? 'active' : ''}`} onClick={() => setActiveTab('tracking')}>
                <Map size={14} /> {role === 'viewer' ? 'My Live Tracking' : 'Live Tracking'}
              </span>
            </li>
            {role !== 'viewer' && (
              <>
                <li>
                  <span className={`nav-link ${activeTab === 'engine' ? 'active' : ''}`} onClick={() => setActiveTab('engine')}>
                    <Compass size={14} /> Engine Health
                  </span>
                </li>
                <li>
                  <span className={`nav-link ${activeTab === 'fuel' ? 'active' : ''}`} onClick={() => setActiveTab('fuel')}>
                    <CircleDot size={14} /> Fuel Monitoring
                  </span>
                </li>
              </>
            )}
            <li>
              <span className={`nav-link ${activeTab === 'battery' ? 'active' : ''}`} onClick={() => setActiveTab('battery')}>
                <Battery size={14} /> Backup Battery Status
              </span>
            </li>
            <li>
              <span className={`nav-link ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
                <FileText size={14} /> Daily Running Summary
              </span>
            </li>
            {role !== 'viewer' && (
              <li>
                <span className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
                  <FileText size={14} style={{ color: 'var(--accent-cyan)' }} /> Telematics Reports
                </span>
              </li>
            )}
            {role === 'admin' && (
              <li>
                <span className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                  <User size={14} /> User Management
                </span>
              </li>
            )}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <div className="user-avatar">
              <User size={16} />
            </div>
            <div className="user-info">
              <span className="user-name">{role === 'admin' ? 'Administrator' : role === 'operator' ? 'Factory Operator' : 'Customer / Driver'}</span>
              <span className="user-role">{role === 'admin' ? 'Full Fleet Access' : role === 'operator' ? 'Factory Dispatch Access' : 'Vehicle Live Tracking'}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="action-btn secondary" style={{ width: '100%', marginTop: '1rem', padding: '0.4rem' }}>
            <LogOut size={12} /> Exit
          </button>
        </div>
      </aside>

      {/* Main Board view */}
      <main className="main-content">
        <header className="topbar">
          <h2 className="page-title">
            {activeTab === 'home' && 'Dashboard Home'}
            {activeTab === 'tracking' && 'Live Tracking'}
            {activeTab === 'engine' && 'Engine Health'}
            {activeTab === 'fuel' && 'Fuel Monitoring'}
            {activeTab === 'battery' && 'Backup Battery Status'}
            {activeTab === 'summary' && 'Daily Running Summary'}
            {activeTab === 'reports' && 'Reports Generation'}
            {activeTab === 'settings' && 'User Management'}
          </h2>

          <div className="topbar-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              backgroundColor: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              color: '#06b6d4',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }} title="Primary Hardware Tracker Device">
              <span style={{ backgroundColor: '#10b981', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
              📡 ESP32 SIM A7670C Tracker (gps-obd-tracker-01)
            </div>
            <button
              onClick={handleGoogleLogin}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              title="Sign in with Google OAuth 2.0"
            >
              🌐 Google OAuth 2.0
            </button>
            <span className={`role-badge ${role}`}>{role.toUpperCase()} PROFILE</span>
          </div>
        </header>

        <div className="module-view">
          
          {/* Critical notification bar */}
          {alerts.filter(a => a.severity === 'critical').slice(0, 1).map(alert => (
            <div key={alert.id} className="alert-banner critical" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertOctagon size={16} className="blink-dot" style={{ color: 'var(--accent-red)' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>[ALARM SYSTEM TRIGGERED] {alert.message}</span>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(alert.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}

          {/* HOME TAB: FLEET ADMIN DASHBOARD OVERVIEW */}
          {activeTab === 'home' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* SECTION A: FLEET-WIDE EXECUTIVE SUMMARY CARDS (Clickable Filters) */}
              <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.85rem' }}>
                
                <div
                  onClick={() => setStatusFilter('all')}
                  className="metric-ring-card"
                  style={{
                    borderLeft: '4px solid var(--accent-cyan)',
                    cursor: 'pointer',
                    boxShadow: statusFilter === 'all' ? '0 0 12px rgba(6, 182, 212, 0.4)' : 'none',
                    backgroundColor: statusFilter === 'all' ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)'
                  }}
                >
                  <div className="metric-card-details">
                    <span className="metric-card-title">Total Fleet</span>
                    <span className="metric-card-num" style={{ fontSize: '1.6rem', color: 'var(--accent-cyan)' }}>{vehicles.length}</span>
                    <span className="metric-card-desc">Click to show all ({vehicles.length})</span>
                  </div>
                </div>

                <div
                  onClick={() => setStatusFilter('active')}
                  className="metric-ring-card"
                  style={{
                    borderLeft: '4px solid var(--accent-green)',
                    cursor: 'pointer',
                    boxShadow: statusFilter === 'active' ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none',
                    backgroundColor: statusFilter === 'active' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-card)'
                  }}
                >
                  <div className="metric-card-details">
                    <span className="metric-card-title">Active / Moving</span>
                    <span className="metric-card-num" style={{ fontSize: '1.6rem', color: 'var(--accent-green)' }}>
                      {vehicles.filter(v => (telemetry[v.id]?.speed || 0) > 0).length}
                    </span>
                    <span className="metric-card-desc">Click to filter active</span>
                  </div>
                </div>

                <div
                  onClick={() => setStatusFilter('good')}
                  className="metric-ring-card"
                  style={{
                    borderLeft: '4px solid #10b981',
                    cursor: 'pointer',
                    boxShadow: statusFilter === 'good' ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none',
                    backgroundColor: statusFilter === 'good' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-card)'
                  }}
                >
                  <div className="metric-card-details">
                    <span className="metric-card-title">Performing Well</span>
                    <span className="metric-card-num" style={{ fontSize: '1.6rem', color: '#10b981' }}>
                      {vehicles.filter(v => getPerformance(v.id).rating === 'Good').length}
                    </span>
                    <span className="metric-card-desc">Click to filter good</span>
                  </div>
                </div>

                <div
                  onClick={() => setStatusFilter('poor')}
                  className="metric-ring-card"
                  style={{
                    borderLeft: '4px solid #ef4444',
                    cursor: 'pointer',
                    boxShadow: statusFilter === 'poor' ? '0 0 12px rgba(239, 68, 68, 0.4)' : 'none',
                    backgroundColor: statusFilter === 'poor' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card)'
                  }}
                >
                  <div className="metric-card-details">
                    <span className="metric-card-title">Non-Performing</span>
                    <span className="metric-card-num" style={{ fontSize: '1.6rem', color: '#ef4444' }}>
                      {vehicles.filter(v => getPerformance(v.id).rating === 'Poor').length}
                    </span>
                    <span className="metric-card-desc">Click to filter faults</span>
                  </div>
                </div>

                <div
                  onClick={() => setStatusFilter('idle')}
                  className="metric-ring-card"
                  style={{
                    borderLeft: '4px solid #f59e0b',
                    cursor: 'pointer',
                    boxShadow: statusFilter === 'idle' ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none',
                    backgroundColor: statusFilter === 'idle' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-card)'
                  }}
                >
                  <div className="metric-card-details">
                    <span className="metric-card-title">Idle / Parked</span>
                    <span className="metric-card-num" style={{ fontSize: '1.6rem', color: '#f59e0b' }}>
                      {vehicles.filter(v => (telemetry[v.id]?.speed || 0) === 0).length}
                    </span>
                    <span className="metric-card-desc">Click to filter idle</span>
                  </div>
                </div>

                <div
                  onClick={() => setStatusFilter('low_fuel')}
                  className="metric-ring-card"
                  style={{
                    borderLeft: '4px solid var(--accent-red)',
                    cursor: 'pointer',
                    boxShadow: statusFilter === 'low_fuel' ? '0 0 12px rgba(239, 68, 68, 0.4)' : 'none',
                    backgroundColor: statusFilter === 'low_fuel' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card)'
                  }}
                >
                  <div className="metric-card-details">
                    <span className="metric-card-title">Low Fuel</span>
                    <span className="metric-card-num" style={{ fontSize: '1.6rem', color: 'var(--accent-red)' }}>
                      {vehicles.filter(v => (telemetry[v.id]?.fuelLevel || 0) < 15).length}
                    </span>
                    <span className="metric-card-desc">Click to filter low fuel</span>
                  </div>
                </div>

                <div
                  onClick={() => setStatusFilter('all')}
                  className="metric-ring-card"
                  style={{ borderLeft: '4px solid var(--accent-orange)' }}
                >
                  <div className="metric-card-details">
                    <span className="metric-card-title">Active Alerts</span>
                    <span className="metric-card-num" style={{ fontSize: '1.6rem', color: 'var(--accent-orange)' }}>
                      {alerts.length}
                    </span>
                    <span className="metric-card-desc">Logged System Events</span>
                  </div>
                </div>

              </div>

              {/* SECTION B: MULTI-VEHICLE LIVE MAP & SYSTEM ALERTS */}
              <div className="dashboard-main-row" style={{ display: 'grid', gridTemplateColumns: '3fr 1.2fr', gap: '1.25rem' }}>
                
                {/* Multi-vehicle live tracking map */}
                <div className="panel-container" style={{ padding: 0, overflow: 'hidden', height: '360px' }}>
                  <div className="panel-header" style={{ padding: '0.65rem 1rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="panel-title"><Map size={14} /> Multi-Vehicle Fleet Live Map</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                      Showing {filteredVehicles.length} of {vehicles.length} vehicles {statusFilter !== 'all' ? `(Filter: ${statusFilter.toUpperCase()})` : ''}
                    </span>
                  </div>
                  <div ref={mapRef} style={{ height: 'calc(100% - 37px)', width: '100%' }}></div>
                </div>

                {/* System alert feed */}
                <div className="panel-container" style={{ height: '360px', display: 'flex', flexDirection: 'column' }}>
                  <div className="panel-header">
                    <span className="panel-title"><Bell size={14} /> Fleet Live Alerts</span>
                  </div>
                  <div className="log-list" style={{ flex: 1, overflowY: 'auto' }}>
                    {alerts.length === 0 ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No system alerts recorded.</span>
                    ) : (
                      alerts.map(log => (
                        <div key={log.id} className={`log-item ${log.severity}`}>
                          <div>
                            <strong style={{ textTransform: 'capitalize' }}>[{log.severity}] {log.type}</strong>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{log.message}</p>
                          </div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* SECTION C & D: DAY-WISE DATE FILTERS & FLEET VEHICLE LIST TABLE */}
              <div className="panel-container">
                
                {/* Day-Wise Filter Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <span className="panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Gauge size={16} style={{ color: 'var(--accent-cyan)' }} /> Fleet Vehicles & Performance Status
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                      Showing data for: <strong style={{ color: 'var(--accent-cyan)' }}>
                        {dateFilterMode === 'today' ? 'Today (Live)' : dateFilterMode === 'yesterday' ? 'Yesterday Rollup' : dateFilterMode === 'week' ? 'This Week Summary' : dateFilterMode === 'month' ? 'This Month Summary' : `Custom Range (${fromDate} to ${toDate})`}
                      </strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color)' }}>
                      {['today', 'yesterday', 'week', 'month', 'custom'].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setDateFilterMode(mode)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.72rem',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: dateFilterMode === mode ? 'var(--accent-cyan)' : 'transparent',
                            color: dateFilterMode === mode ? '#000' : 'var(--text-secondary)',
                            fontWeight: dateFilterMode === mode ? 700 : 500,
                            textTransform: 'capitalize'
                          }}
                        >
                          {mode === 'today' ? 'Today' : mode === 'yesterday' ? 'Yesterday' : mode === 'week' ? 'This Week' : mode === 'month' ? 'This Month' : 'Custom Range'}
                        </button>
                      ))}
                    </div>

                    {dateFilterMode === 'custom' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.72rem' }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>to</span>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.72rem' }}
                        />
                      </div>
                    )}

                    {statusFilter !== 'all' && (
                      <button
                        onClick={() => setStatusFilter('all')}
                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', cursor: 'pointer' }}
                      >
                        Clear Status Filter ({statusFilter})
                      </button>
                    )}
                  </div>
                </div>

                {/* Fleet Vehicle Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Vehicle ID</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Vehicle Name</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>From (Origin)</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>To (Current)</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Filtered Distance</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Avg Speed</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Fuel Level</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Engine Status</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Malfunction</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Performance</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Battery</th>
                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVehicles.length === 0 ? (
                        <tr>
                          <td colSpan="12" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No vehicles match the selected status filter ({statusFilter}).
                          </td>
                        </tr>
                      ) : (
                        filteredVehicles.map((v) => {
                          const t = telemetry[v.id] || {};
                          const perf = getPerformance(v.id);
                          const isMalfunction = perf.rating === 'Poor';
                          const filteredKm = getFilteredKm(v.id);

                          const fromAddr = t.fix && t.isOnline !== false ? 'Live Hardware Sensor' : 'Offline / No Signal';
                          const toAddr = t.fix && t.isOnline !== false ? (currentAddress[v.id] || 'Transmitting Data') : 'Location Unavailable';

                          return (
                            <tr
                              key={v.id}
                              style={{
                                borderBottom: '1px solid var(--border-color)',
                                backgroundColor: isMalfunction ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                                transition: 'background-color 0.2s'
                              }}
                            >
                              <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                                {v.id}
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                                {v.name}
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>
                                {fromAddr}
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>
                                {toAddr}
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>
                                {filteredKm} km
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem' }}>
                                {t.avgSpeed || '--'} km/h
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem' }}>
                                <span style={{ color: (t.fuelLevel || 0) < 15 ? 'var(--accent-red)' : 'var(--text-primary)', fontWeight: 600 }}>
                                  {t.fuelLevel !== undefined ? `${t.fuelLevel?.toFixed(1)}%` : '--'}
                                </span>
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem' }}>
                                <span style={{ color: t.checkEngine ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: 600 }}>
                                  {t.checkEngine ? '⚠ MIL Fault' : '✓ Clean'}
                                </span>
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem' }}>
                                {isMalfunction ? (
                                  <span style={{ color: 'var(--accent-red)', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem' }}>
                                    {perf.malfunction}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>None</span>
                                )}
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem' }}>
                                <span
                                  style={{
                                    backgroundColor: perf.bg,
                                    color: perf.color,
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  {perf.rating === 'Good' ? '🟢 Good' : perf.rating === 'Fair' ? '🟡 Fair' : '🔴 Poor'}
                                </span>
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)' }}>
                                {t.backupBatteryPercent !== undefined ? `${t.backupBatteryPercent}%` : '--'}
                              </td>
                              <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                <button
                                  onClick={() => {
                                    setSelectedVehicleId(v.id);
                                    setActiveTab('tracking');
                                  }}
                                  className="action-btn"
                                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.7rem' }}
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>

            </div>
          )}

          {/* MAP TAB */}
          {activeTab === 'tracking' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(currentData.isOnline === false || currentData.status === 'offline' || !currentData.fix) && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.18)', border: '1px solid #ef4444', borderRadius: '6px', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertOctagon size={18} style={{ color: '#ef4444' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>
                      ⚠️ HARDWARE TRACKER IS OFFLINE / NO GPS FIX — Location Unavailable
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                    Last Heartbeat: {currentData.lastSeen ? new Date(currentData.lastSeen).toLocaleTimeString() : 'Offline'}
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.2fr', gap: '1.25rem', height: '540px' }}>
                <div className="panel-container" style={{ padding: 0, overflow: 'hidden', height: '540px', minHeight: '540px', position: 'relative' }}>
                  <div ref={mapRef} style={{ height: '540px', minHeight: '540px', width: '100%', borderRadius: '6px', zIndex: 1 }}></div>
                </div>
                <div className="panel-container">
                  <span className="panel-title"><Compass size={14} /> Live Tracking Details</span>
                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Interactive Map</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Active (Leaflet OSM)</span>
                </div>

                  <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Hardware Device Status</span>
                    <strong style={{ fontSize: '0.72rem', color: (currentData.isOnline === false || currentData.status === 'offline' || !currentData.fix) ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {(currentData.isOnline === false || currentData.status === 'offline' || !currentData.fix) ? '🔴 POWERED OFF / OFFLINE' : '🟢 ONLINE / TRANSMITTING'}
                    </strong>
                  </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Direction Arrow</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.heading || 0}° Heading</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>GPS Accuracy</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>±{currentData.accuracy || 0} m</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Satellite Count</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.satellites || 0} Satellites</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Altitude</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.altitude || 0} m</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Speed Overlay</span>
                  <strong style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>{Math.round(currentData.speed || 0)} km/h</strong>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Average Speed</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.avgSpeed || 0} km/h</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Maximum Speed</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-orange)' }}>{currentData.maxSpeed || 0} km/h</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Trip Distance</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.tripDistance ? currentData.tripDistance.toFixed(1) : '0.0'} km</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Per-Day Running KM</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-green)' }}>{currentData.todayRunningKm ? currentData.todayRunningKm.toFixed(2) : '0.00'} km</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Route</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.fix && currentData.isOnline !== false ? 'Live GPS Stream' : 'No Active Route'}</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>📍 Live Address</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-cyan)', textAlign: 'right', maxWidth: '160px', wordBreak: 'break-word' }} title={currentData.fix && currentData.lat ? (currentAddress[selectedVehicleId] || `${currentData.lat.toFixed(5)}, ${currentData.lng.toFixed(5)}`) : 'Location Unavailable'}>
                    {currentData.fix && currentData.lat ? (currentAddress[selectedVehicleId] || `${currentData.lat.toFixed(5)}, ${currentData.lng.toFixed(5)}`) : 'Location Unavailable (Offline / No Fix)'}
                  </span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Assigned Fixed Route Overlay</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Configured</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Route Deviation Indicator</span>
                  <strong style={{ fontSize: '0.72rem', color: currentData.isDeviated ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    {currentData.routeDeviationMeters} m {currentData.isDeviated ? '(DEVIATED)' : '(OK)'}
                  </strong>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Geofence Zone Boundaries</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{geofences[selectedVehicleId]?.radius}m radius</span>
                </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* ENGINE TAB */}
          {activeTab === 'engine' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr', gap: '1.25rem', height: '480px' }}>
              <div className="panel-container">
                <span className="panel-title">Engine Charts</span>
                <div className="chart-box">
                  <canvas ref={engineChartRef}></canvas>
                </div>
              </div>

              <div className="panel-container">
                <div>
                  <span className="panel-title">Check Engine Status</span>
                  
                  <div style={{ padding: '0.75rem', backgroundColor: currentData.checkEngine ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)', border: '1px solid', borderColor: currentData.checkEngine ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.5rem' }}>
                    <span className="system-status-dot" style={{ backgroundColor: currentData.checkEngine ? 'var(--accent-red)' : 'var(--accent-green)' }}></span>
                    <span>{currentData.checkEngine ? 'MIL Engine Lamp Alert active' : 'All systems clear'}</span>
                  </div>

                  {currentData.checkEngine && (
                    <div style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '6px', border: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Trouble code message</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{currentData.checkEngineCode}</span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '1rem', overflowY: 'auto' }}>
                  <span className="panel-title">OBD Engine Parameters</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
                    <div className="floating-stat-row">
                      <span className="floating-label">Engine RPM</span>
                      <span className="floating-val">{currentData.rpm} rpm</span>
                    </div>
                    <div className="floating-stat-row">
                      <span className="floating-label">Coolant Temperature</span>
                      <span className="floating-val">{currentData.coolantTemp}°C</span>
                    </div>
                    <div className="floating-stat-row">
                      <span className="floating-label">Engine Load</span>
                      <span className="floating-val">{currentData.engineLoad}%</span>
                    </div>
                    <div className="floating-stat-row">
                      <span className="floating-label">Intake Air Temperature</span>
                      <span className="floating-val">{currentData.intakeTemp}°C</span>
                    </div>
                    <div className="floating-stat-row">
                      <span className="floating-label">Battery Voltage</span>
                      <span className="floating-val" style={{ color: 'var(--accent-cyan)' }}>{currentData.batteryVoltage} V</span>
                    </div>
                    <div className="floating-stat-row">
                      <span className="floating-label">Throttle Position</span>
                      <span className="floating-val">{currentData.throttle}%</span>
                    </div>
                    <div className="floating-stat-row">
                      <span className="floating-label">Engine Running Time</span>
                      <span className="floating-val">{Math.floor((currentData.runningTime || 0) / 3600)}h {Math.floor(((currentData.runningTime || 0) % 3600) / 60)}m</span>
                    </div>
                    <div className="floating-stat-row">
                      <span className="floating-label">VIN Number</span>
                      <span className="floating-val" style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>{selectedVehicle?.vin}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FUEL MONITORING TAB */}
          {activeTab === 'fuel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', height: '360px' }}>
                <div className="panel-container">
                  <span className="panel-title">Fuel Level Chart</span>
                  <div className="chart-box" style={{ height: '270px' }}>
                    <canvas ref={fuelLevelChartRef}></canvas>
                  </div>
                </div>

                <div className="panel-container">
                  <span className="panel-title">Fuel Consumption Chart</span>
                  <div className="chart-box" style={{ height: '270px' }}>
                    <canvas ref={fuelConsumptionChartRef}></canvas>
                  </div>
                </div>

                <div className="panel-container">
                  <span className="panel-title">Fuel Trend Over Time</span>
                  <div className="chart-box" style={{ height: '270px' }}>
                    <canvas ref={fuelTrendChartRef}></canvas>
                  </div>
                </div>
              </div>

              {/* SRS 3.3 live fuel parameters row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div className="panel-container" style={{ padding: '0.85rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fuel Level</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: currentData.fuelLevel < 15 ? 'var(--accent-red)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: '0.25rem' }}>
                    {currentData.fuelLevel?.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Remaining capacity</span>
                </div>

                <div className="panel-container" style={{ padding: '0.85rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fuel Consumption</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', display: 'block', marginTop: '0.25rem' }}>
                    {currentData.fuelConsumption?.toFixed(1)} L
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Total consumed today</span>
                </div>

                <div className="panel-container" style={{ padding: '0.85rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fuel Rate</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: '0.25rem' }}>
                    {currentData.fuelRate?.toFixed(1)} L/h
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Live consumption rate</span>
                </div>

                <div className="panel-container" style={{ padding: '0.85rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Low Fuel Warning</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, display: 'block', marginTop: '0.25rem', color: currentData.fuelLevel < 15 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    {currentData.fuelLevel < 15 ? '⚠ LOW FUEL' : '✓ NORMAL'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Threshold: &lt;15% triggers alert</span>
                </div>
              </div>
            </div>
          )}

          {/* BACKUP BATTERY STATUS TAB */}
          {activeTab === 'battery' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '1.25rem', height: '490px' }}>
              
              {/* Left Panel: Shock Telemetry and G-Force */}
              <div className="panel-container">
                <span className="panel-title"><Activity size={14} /> Cargo Tamper Shock Sensor (G-Force)</span>
                <div className="chart-box">
                  <canvas ref={shockChartRef}></canvas>
                </div>
                <div className="grid-2col" style={{ marginTop: '0.5rem' }}>
                  <div className="param-row">
                    <span className="param-name">X-Axis Shock</span>
                    <span className="param-value">{currentData.shockX?.toFixed(3)} G</span>
                  </div>
                  <div className="param-row">
                    <span className="param-name">Y-Axis Shock</span>
                    <span className="param-value">{currentData.shockY?.toFixed(3)} G</span>
                  </div>
                  <div className="param-row">
                    <span className="param-name">Z-Axis Shock</span>
                    <span className="param-value">{currentData.shockZ?.toFixed(3)} G</span>
                  </div>
                  <div className="param-row">
                    <span className="param-name">Max Shock Peak</span>
                    <span className="param-value" style={{ color: 'var(--accent-orange)' }}>{currentData.maxShockG} G</span>
                  </div>
                </div>
              </div>
              
              {/* Right Panel: Backup Battery details */}
              <div className="panel-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <span className="panel-title"><Battery size={14} /> Backup Battery Status</span>
                
                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Battery Percentage</span>
                  <strong style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>{currentData.backupBatteryPercent?.toFixed(1)}%</strong>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Battery Voltage</span>
                  <strong style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{currentData.backupBatteryVoltage || 4.2} V</strong>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Estimated Backup Time</span>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--accent-green)' }}>
                    {Math.floor((((currentData.backupBatteryPercent || 100) / 100) * 240) / 60)}h {Math.round((((currentData.backupBatteryPercent || 100) / 100) * 240) % 60)}m
                  </strong>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Charging Status</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>{currentData.chargingStatus}</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Power Source</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{currentData.powerSource === 'main' ? 'Car Alternator (12V)' : 'Internal LiPo (Battery)'}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>Power Event History</span>
                  <div className="event-log" style={{ flexGrow: 1, maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem' }}>
                    {currentData.powerEventHistory && currentData.powerEventHistory.length > 0 ? (
                      currentData.powerEventHistory.map((event, idx) => (
                        <div key={idx} className="event-item" style={{ fontSize: '0.7rem', padding: '0.35rem 0.5rem', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{event.event}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No power events recorded.</span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* DAILY RUNNING SUMMARY TAB */}
          {activeTab === 'summary' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.25rem', height: '480px' }}>
              <div className="panel-container">
                <span className="panel-title">Per-Day Running KM chart</span>
                <div className="chart-box">
                  <canvas ref={barChartRef}></canvas>
                </div>
              </div>

              <div className="panel-container" style={{ justifyContent: 'space-between' }}>
                <div>
                  <span className="panel-title">Running Hours vs Idle Hours per day</span>
                  <div className="chart-box" style={{ height: '220px', marginTop: '0.5rem' }}>
                    <canvas ref={pieChartRef}></canvas>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                  <div className="floating-stat-row">
                    <span className="floating-label" style={{ fontWeight: 600 }}>Route Deviation Count per day</span>
                    <span className="floating-val" style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{dailySummary?.deviationCount || 0} events</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* REPORTS TAB */}
          {activeTab === 'reports' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>

              <div className="panel-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={18} style={{ color: 'var(--accent-cyan)' }} />
                  <strong>Trip Mileage Report</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>Downloads mileage logs, speed averages and operational hours totals.</p>
                <button onClick={() => {
                  const rows = [['Vehicle','Date','Trip Distance (km)','Avg Speed (km/h)','Max Speed (km/h)','Running Hours','Idle Hours'],[selectedVehicleId, new Date().toLocaleDateString(), currentData.tripDistance?.toFixed(1), currentData.avgSpeed, currentData.maxSpeed, '6.8', '1.5']];
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `trip_mileage_${selectedVehicleId}_${Date.now()}.csv`; a.click();
                }} className="action-btn"><FileDown size={14} /> Download CSV</button>
              </div>

              {/* SRS Section 7 — Daily Running KM Report (New) */}
              <div className="panel-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Gauge size={18} style={{ color: 'var(--accent-green)' }} />
                  <strong>Daily Running KM Report</strong>
                  <span style={{ fontSize: '0.6rem', color: 'var(--accent-green)', fontWeight: 700, border: '1px solid var(--accent-green)', borderRadius: '3px', padding: '1px 4px' }}>NEW</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>Total distance covered per vehicle per day with weekly and monthly rollups.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.6rem' }}>
                  {(dailySummary?.mileageHistory || []).map((d, i) => (
                    <div key={i} className="floating-stat-row">
                      <span className="floating-label">{d.day}</span>
                      <span className="floating-val" style={{ color: 'var(--accent-green)' }}>{d.km} km</span>
                    </div>
                  ))}
                  <div className="floating-stat-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.35rem', marginTop: '0.25rem' }}>
                    <span className="floating-label">Weekly Total</span>
                    <span className="floating-val" style={{ fontWeight: 700 }}>{(dailySummary?.mileageHistory || []).reduce((sum, d) => sum + d.km, 0)} km</span>
                  </div>
                  <div className="floating-stat-row">
                    <span className="floating-label">Monthly Est.</span>
                    <span className="floating-val" style={{ fontWeight: 700 }}>{Math.round((dailySummary?.mileageHistory || []).reduce((sum, d) => sum + d.km, 0) / 7 * 30)} km</span>
                  </div>
                </div>
                <button onClick={() => {
                  const wkRows = [['Day','Distance (km)'], ...(dailySummary?.mileageHistory || []).map(d => [d.day, d.km])];
                  const weekly = (dailySummary?.mileageHistory || []).reduce((s, d) => s + d.km, 0);
                  const monthly = Math.round(weekly / 7 * 30);
                  wkRows.push(['Weekly Total', weekly], ['Monthly Estimate', monthly]);
                  const csv = wkRows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `daily_running_km_${selectedVehicleId}_${Date.now()}.csv`; a.click();
                }} className="action-btn" style={{ backgroundColor: 'var(--accent-green)' }}><FileDown size={14} /> Download CSV</button>
              </div>

              <div className="panel-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CircleDot size={18} style={{ color: 'var(--accent-cyan)' }} />
                  <strong>Fuel Log Report</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>Downloads details on average fuel economy and alert warning history.</p>
                <button onClick={() => {
                  const rows = [['Vehicle','Date','Fuel Level (%)','Fuel Consumption (L)','Fuel Rate (L/h)','Low Fuel Warning'],[selectedVehicleId, new Date().toLocaleDateString(), currentData.fuelLevel?.toFixed(1), currentData.fuelConsumption?.toFixed(1), currentData.fuelRate?.toFixed(1), currentData.fuelLevel < 15 ? 'YES' : 'NO']];
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `fuel_report_${selectedVehicleId}_${Date.now()}.csv`; a.click();
                }} className="action-btn"><FileDown size={14} /> Download CSV</button>
              </div>

              <div className="panel-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={18} style={{ color: 'var(--accent-cyan)' }} />
                  <strong>Engine Health Report</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>Downloads OBD diagnostic parameters, RPM, temperature and engine event log.</p>
                <button onClick={() => {
                  const rows = [['Vehicle','Date','RPM','Coolant Temp (°C)','Engine Load (%)','Battery Voltage (V)','Throttle (%)','Check Engine','VIN'],[selectedVehicleId, new Date().toLocaleDateString(), currentData.rpm, currentData.coolantTemp, currentData.engineLoad, currentData.batteryVoltage, currentData.throttle, currentData.checkEngine ? 'FAULT' : 'Clear', selectedVehicle?.vin || '']];
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `engine_health_${selectedVehicleId}_${Date.now()}.csv`; a.click();
                }} className="action-btn"><FileDown size={14} /> Download CSV</button>
              </div>

              <div className="panel-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Battery size={18} style={{ color: 'var(--accent-cyan)' }} />
                  <strong>Device Health Report</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>Downloads backup battery charging details and power event histories.</p>
                <button onClick={() => {
                  const rows = [['Vehicle','Date','Battery %','Battery Voltage','Charging Status','Power Source','DTC Status'],[selectedVehicleId, new Date().toLocaleDateString(), currentData.backupBatteryPercent?.toFixed(1), currentData.backupBatteryVoltage, currentData.chargingStatus, currentData.powerSource, currentData.checkEngine ? 'FAULT' : 'Clear']];
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `device_health_${selectedVehicleId}_${Date.now()}.csv`; a.click();
                }} className="action-btn"><FileDown size={14} /> Download CSV</button>
              </div>

              {/* SRS Section 7 — Route Deviation & Geofence Report (New) */}
              <div className="panel-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Compass size={18} style={{ color: 'var(--accent-orange)' }} />
                  <strong>Route Deviation & Geofence Report</strong>
                  <span style={{ fontSize: '0.6rem', color: 'var(--accent-orange)', fontWeight: 700, border: '1px solid var(--accent-orange)', borderRadius: '3px', padding: '1px 4px' }}>NEW</span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>Route deviation events, geofence zone entry/exit logs, and deviation count per day.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.6rem' }}>
                  <div className="floating-stat-row">
                    <span className="floating-label">Today's Deviations</span>
                    <span className="floating-val" style={{ color: 'var(--accent-orange)' }}>{dailySummary?.deviationCount || 0} events</span>
                  </div>
                  <div className="floating-stat-row">
                    <span className="floating-label">Current Deviation</span>
                    <span className="floating-val" style={{ color: currentData.isDeviated ? 'var(--accent-red)' : 'var(--accent-green)' }}>{currentData.routeDeviationMeters} m</span>
                  </div>
                  <div className="floating-stat-row">
                    <span className="floating-label">Geofence Status</span>
                    <span className="floating-val" style={{ color: currentData.inGeofence ? 'var(--accent-green)' : 'var(--accent-red)' }}>{currentData.inGeofence ? 'Inside Zone' : 'Outside Zone'}</span>
                  </div>
                </div>
                <button onClick={() => {
                  const rows = [['Vehicle','Date','Route Status','Deviation (m)','Deviation Count','Geofence Name','Geofence Status','Geofence Radius (m)'],[selectedVehicleId, new Date().toLocaleDateString(), currentData.isDeviated ? 'DEVIATED' : 'On Track', currentData.routeDeviationMeters, dailySummary?.deviationCount || 0, geofences[selectedVehicleId]?.name || 'N/A', currentData.inGeofence ? 'Inside' : 'Outside', geofences[selectedVehicleId]?.radius || 'N/A']];
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `route_deviation_geofence_${selectedVehicleId}_${Date.now()}.csv`; a.click();
                }} className="action-btn" style={{ backgroundColor: 'var(--accent-orange)', color: '#000' }}><FileDown size={14} /> Download CSV</button>
              </div>

            </div>
          )}

          {/* USER MANAGEMENT TAB */}
          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* SECTION 8.1: ADMINISTRATOR */}
              <div>
                <h3 style={{ fontSize: '1rem', color: 'var(--accent-cyan)', marginBottom: '0.85rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.35rem' }}>8.1 Administrator Settings</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  
                  {/* Add Vehicle */}
                  <div className="panel-container">
                    <span className="panel-title">Add Vehicle</span>
                    {role !== 'admin' ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Admin security clearance required to add vehicles.</p>
                    ) : (
                      <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <div className="form-group">
                          <label>Vehicle Model Name</label>
                          <input type="text" className="form-input" placeholder="e.g. Tesla Model 3" value={newVehicleName} onChange={e => setNewVehicleName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                          <label>VIN Code</label>
                          <input type="text" className="form-input" placeholder="17 Digit VIN" value={newVehicleVin} onChange={e => setNewVehicleVin(e.target.value)} required />
                        </div>
                        <button type="submit" className="action-btn" style={{ marginTop: '0.5rem' }}>
                          Add Vehicle
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Remove Vehicle */}
                  <div className="panel-container">
                    <span className="panel-title">Remove Vehicle</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                      {vehicles.map(v => (
                        <div key={v.id} className="param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.01)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div>
                            <strong>{v.name}</strong>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {v.id}</div>
                          </div>
                          {role === 'admin' && vehicles.length > 1 && (
                            <button onClick={() => handleDeleteVehicle(v.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* User Management */}
                  <div className="panel-container">
                    <span className="panel-title">User Management Roles</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: role === 'admin' ? 'rgba(6,182,212,0.05)' : 'transparent' }}>
                        <span style={{ fontSize: '0.75rem' }}>Administrator (Full Privilege)</span>
                        <strong style={{ fontSize: '0.7rem', color: role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{role === 'admin' ? 'Active User' : 'Authorized'}</strong>
                      </div>
                      <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: role === 'operator' ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                        <span style={{ fontSize: '0.75rem' }}>Operator (Reports/Alerts)</span>
                        <strong style={{ fontSize: '0.7rem', color: role === 'operator' ? 'var(--accent-green)' : 'var(--text-muted)' }}>{role === 'operator' ? 'Active User' : 'Authorized'}</strong>
                      </div>
                      <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: role === 'viewer' ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
                        <span style={{ fontSize: '0.75rem' }}>Viewer (Read-Only)</span>
                        <strong style={{ fontSize: '0.7rem', color: role === 'viewer' ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{role === 'viewer' ? 'Active User' : 'Authorized'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Alert Settings */}
                  <div className="panel-container">
                    <span className="panel-title">Alert Settings</span>
                    {role !== 'admin' ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Admin security clearance required to manage thresholds.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <div className="floating-stat-row">
                          <span className="floating-label">Max Speed Limit</span>
                          <span className="floating-val">{selectedVehicle?.alertSettings.maxSpeed} km/h</span>
                        </div>
                        <div className="floating-stat-row">
                          <span className="floating-label">Max Temp Limit</span>
                          <span className="floating-val">{selectedVehicle?.alertSettings.maxTemp} °C</span>
                        </div>
                        <div className="floating-stat-row">
                          <span className="floating-label">Min Fuel Level Threshold</span>
                          <span className="floating-val">{selectedVehicle?.alertSettings.minFuel} %</span>
                        </div>
                        <div className="floating-stat-row">
                          <span className="floating-label">Route Deviation Threshold</span>
                          <span className="floating-val" style={{ color: 'var(--accent-cyan)' }}>300 m (Default range: 200–500m)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Assign/Edit Fixed Routes and Geofence Zones */}
                  <div className="panel-container">
                    <span className="panel-title">Assign/Edit Fixed Routes and Geofence Zones</span>
                    {role !== 'admin' ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Admin security clearance required to update bounds.</p>
                    ) : (
                      <form onSubmit={updateGeofenceBounds} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <div className="form-group">
                          <label>Geofence Latitude / Longitude</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="text" className="form-input" style={{ flex: 1 }} value={geoLat} onChange={e => setGeoLat(e.target.value)} placeholder="Lat" required />
                            <input type="text" className="form-input" style={{ flex: 1 }} value={geoLng} onChange={e => setGeoLng(e.target.value)} placeholder="Lng" required />
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Geofence Radius (meters)</label>
                          <input type="text" className="form-input" value={geoRad} onChange={e => setGeoRad(e.target.value)} required />
                        </div>
                        <button type="submit" className="action-btn" style={{ marginTop: '0.25rem' }}>
                          Save Routes & Geofence
                        </button>
                      </form>
                    )}
                  </div>

                </div>
              </div>

              {/* SECTION 8.2: OPERATOR */}
              <div>
                <h3 style={{ fontSize: '1rem', color: 'var(--accent-green)', marginBottom: '0.85rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.35rem' }}>8.2 Operator Settings</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  
                  <div className="panel-container">
                    <span className="panel-title">Monitor Vehicle</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Operator is authorized to view live tracking maps and parameters.</p>
                    <button onClick={() => setActiveTab('home')} className="action-btn" style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
                      Go to Dashboard Home
                    </button>
                  </div>

                  <div className="panel-container">
                    <span className="panel-title">Download Reports</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Operator is authorized to generate and download telemetry reports.</p>
                    <button onClick={() => setActiveTab('reports')} className="action-btn" style={{ alignSelf: 'flex-start', marginTop: '0.5rem', backgroundColor: 'var(--accent-green)' }}>
                      Go to Reports Tab
                    </button>
                  </div>

                  <div className="panel-container">
                    <span className="panel-title">View Alerts</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Operator is authorized to monitor live alerts and notifications.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <span className="system-status-dot active"></span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{alerts.length} Total Alerts Logged</span>
                    </div>
                  </div>

                </div>
              </div>


            </div>
          )}

        </div>
      </main>
    </div>
  );
}
