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
  CircleDot,
  LayoutGrid,
  Play,
  Pause,
  Clock,
  Radio,
  Navigation,
  Eye,
  CheckCircle2,
  Menu,
  X
} from 'lucide-react';
import Chart from 'chart.js/auto';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { subscribeToTelemetry } from './firebase';
import { login as apiLogin, loginWithGoogle as apiGoogleLogin, logout as apiLogout, getAccessToken, getRefreshToken, refreshAccessToken, getUserProfile, authFetch, API_BASE } from './api';

function FleetCardMiniMap({ vehicle, telemetryData }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const isOff = !telemetryData || telemetryData.isOnline !== true;
  const hasCoords = typeof telemetryData?.lat === 'number' && typeof telemetryData?.lng === 'number' && !isNaN(telemetryData.lat) && telemetryData.lat !== 0;
  // Only use real MQTT coordinates — never fake static coords
  const lat = hasCoords ? telemetryData.lat : 11.02366;
  const lng = hasCoords ? telemetryData.lng : 76.9424;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const container = mapContainerRef.current;

    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      dragging: !L.Browser.mobile,
      tap: false
    }).setView([lat, lng], hasCoords ? 15 : 11);

    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    // Only add marker if we have REAL GPS coordinates from MQTT
    if (hasCoords) {
      const iconHtml = `<div style="
        width: 32px; height: 32px;
        background: ${isOff ? '#ef4444' : '#0284c7'};
        border: 2.5px solid white;
        border-radius: 50%;
        box-shadow: 0 0 12px ${isOff ? 'rgba(239,68,68,0.7)' : 'rgba(2,132,199,0.7)'};
        display: flex; align-items: center; justify-content: center;
        font-size: 15px; color: white;
      ">📡</div>`;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
          <strong style="color: #0284c7;">${vehicle.name}</strong><br/>
          <b>Status:</b> ${isOff ? '🔴 Offline' : '🟢 Live GPS'}<br/>
          <b>Speed:</b> ${telemetryData?.speed || 0} km/h
        </div>
      `);
      markerRef.current = marker;
    }

    setTimeout(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    }, 250);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [vehicle.id]);

  useEffect(() => {
    if (mapInstanceRef.current && hasCoords) {
      mapInstanceRef.current.setView([lat, lng], 15);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      }
    }
  }, [lat, lng, hasCoords]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '190px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', margin: '0.65rem 0' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
      <div style={{ position: 'absolute', bottom: '8px', left: '8px', zIndex: 10, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.12)' }}>
        📍 {hasCoords ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Location Offline'}
      </div>
    </div>
  );
}

function NavRouteMap({ navData, vehicleData }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const container = mapContainerRef.current;
    if (container._leaflet_id) delete container._leaflet_id;

    const originCoords = navData?.origin || [vehicleData?.lat || 11.02366, vehicleData?.lng || 76.9424];
    const map = L.map(container, { zoomControl: false }).setView(originCoords, 13);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const vehIcon = L.divIcon({
      html: `<div style="width:36px;height:36px;background:#06b6d4;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;box-shadow:0 0 12px rgba(6,182,212,0.8);">📡</div>`,
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    });
    L.marker(originCoords, { icon: vehIcon }).addTo(map).bindPopup(`<b>${vehicleData?.name || 'Vehicle'}</b><br/>Current Live Position`);

    if (navData && navData.destination) {
      const destIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;background:#ef4444;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;box-shadow:0 0 12px rgba(239,68,68,0.8);">🏁</div>`,
        className: '', iconSize: [36, 36], iconAnchor: [18, 18]
      });
      L.marker(navData.destination, { icon: destIcon }).addTo(map).bindPopup(`<b>Destination</b><br/>${navData.destName}`);

      if (navData.coordinates && navData.coordinates.length > 0) {
        const polyline = L.polyline(navData.coordinates, { color: '#0284c7', weight: 5, opacity: 0.85, lineJoin: 'round' }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      }
    }

    setTimeout(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    }, 300);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [navData, vehicleData?.id]);

  return (
    <div className="responsive-map-container">
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
    </div>
  );
}

function StoppageMap({ stoppages, historyPoints, selectedVehicle }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const container = mapContainerRef.current;
    if (container._leaflet_id) delete container._leaflet_id;

    const centerCoords = (stoppages.length > 0 && stoppages[0].lat) 
      ? [stoppages[0].lat, stoppages[0].lng] 
      : [11.02366, 76.9424];

    const map = L.map(container, { zoomControl: false }).setView(centerCoords, 13);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    if (historyPoints && historyPoints.length > 0) {
      const lineCoords = historyPoints.filter(p => p.lat && p.lng).map(p => [p.lat, p.lng]);
      if (lineCoords.length > 0) {
        const line = L.polyline(lineCoords, { color: '#8b5cf6', weight: 4, opacity: 0.7 }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [30, 30] });
      }
    }

    stoppages.forEach((stop, idx) => {
      const stopIcon = L.divIcon({
        html: `<div style="width:32px;height:32px;background:#ef4444;border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:bold;box-shadow:0 0 10px rgba(239,68,68,0.8);">🛑</div>`,
        className: '', iconSize: [32, 32], iconAnchor: [16, 16]
      });

      const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
          <strong style="color: #ef4444;">🛑 Stoppage #${idx + 1}</strong><br/>
          <b>Location:</b> ${stop.address}<br/>
          <b>Dwell Duration:</b> <span style="color:#ef4444; font-weight:bold;">${stop.durationMins} mins</span><br/>
          <b>Arrived:</b> ${stop.arrivalTime} | <b>Departed:</b> ${stop.departureTime}
        </div>
      `);
    });

    setTimeout(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    }, 300);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [stoppages, selectedVehicle?.id]);

  return (
    <div className="responsive-map-container">
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(getAccessToken() || null);
  const [role, setRole] = useState(getUserProfile()?.role || localStorage.getItem('role') || 'viewer');
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tracking');
  const [fleetViewMode, setFleetViewMode] = useState('list'); // 'list' | 'grid'

  // Restore authenticated session seamlessly across browser refreshes
  useEffect(() => {
    async function restoreSession() {
      const existingToken = getAccessToken();
      const rToken = getRefreshToken();

      if (existingToken) {
        setToken(existingToken);
        const user = getUserProfile();
        if (user?.role) setRole(user.role);
        setAuthLoading(false);
        return;
      }

      if (rToken) {
        try {
          const newToken = await refreshAccessToken();
          if (newToken) {
            setToken(newToken);
            const user = getUserProfile();
            if (user?.role) setRole(user.role);
          }
        } catch (err) {
          console.warn("Silent session restoration failed:", err);
        }
      }
      setAuthLoading(false);
    }

    restoreSession();
  }, []);
  
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [telemetry, setTelemetry] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [routes, setRoutes] = useState({});
  const [geofences, setGeofences] = useState({});
  const [currentAddress, setCurrentAddress] = useState({});
  const [currentArea, setCurrentArea] = useState({});
  const [currentStreet, setCurrentStreet] = useState({});

  // Route History & Replay State
  const [historyTrail, setHistoryTrail] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimerRef = useRef(null);

  // Fetch Route History Trail for selected vehicle
  const fetchRouteHistory = async (vId) => {
    if (!vId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/${vId}`);
      if (res.ok) {
        const pts = await res.json();
        setHistoryTrail(pts);
        setReplayIndex(0);
      }
    } catch (err) {
      console.warn("Failed to fetch route history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Navigation & ETA Tab State
  const [destAddressInput, setDestAddressInput] = useState('');
  const [navRouteData, setNavRouteData] = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navAddressSuggestions, setNavAddressSuggestions] = useState([]);

  // Stoppage & Dwell Time Analytics State
  const [stoppageList, setStoppageList] = useState([]);
  const [stoppagesLoading, setStoppagesLoading] = useState(false);

  // Search Destination Address using Nominatim
  const handleSearchDestination = async (query) => {
    if (!query || query.length < 3) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setNavAddressSuggestions(data.slice(0, 5));
      }
    } catch (err) {
      console.warn("Geocoding search warning:", err);
    }
  };

  // Calculate OSRM Driving Route & ETA
  const calculateNavRoute = async (destLat, destLng, destName) => {
    const currentVehData = telemetry[selectedVehicleId] || {};
    const originLat = currentVehData.lat || 11.02366;
    const originLng = currentVehData.lng || 76.9424;

    setNavLoading(true);
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(osrmUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distKm = (route.distance / 1000).toFixed(1);
          const durationMins = Math.round(route.duration / 60);

          setNavRouteData({
            origin: [originLat, originLng],
            destination: [destLat, destLng],
            destName: destName || destAddressInput,
            distanceKm: distKm,
            durationMins,
            coordinates: route.geometry.coordinates.map(c => [c[1], c[0]]),
            steps: route.legs[0]?.steps || []
          });
        }
      }
    } catch (err) {
      console.error("OSRM Route calculation error:", err);
    } finally {
      setNavLoading(false);
      setNavAddressSuggestions([]);
    }
  };

  // Fetch & Analyze Stoppages (> 3 mins dwell time)
  const fetchStoppageAnalytics = async (vId) => {
    if (!vId) return;
    setStoppagesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(vId)}`);
      if (res.ok) {
        const pts = await res.json();
        const stops = [];
        let currentStopGroup = [];

        pts.forEach((p) => {
          const isStationary = (p.speed || 0) <= 3;
          if (isStationary) {
            currentStopGroup.push(p);
          } else {
            if (currentStopGroup.length >= 2) {
              const first = currentStopGroup[0];
              const last = currentStopGroup[currentStopGroup.length - 1];
              const t1 = new Date(first.timestamp).getTime();
              const t2 = new Date(last.timestamp).getTime();
              const durationMins = Math.round((t2 - t1) / 60000);

              if (durationMins >= 3) {
                stops.push({
                  id: `stop-${stops.length + 1}`,
                  lat: first.lat,
                  lng: first.lng,
                  address: first.address || first.street || `${first.lat.toFixed(4)}, ${first.lng.toFixed(4)}`,
                  arrivalTime: new Date(first.timestamp).toLocaleTimeString(),
                  departureTime: new Date(last.timestamp).toLocaleTimeString(),
                  durationMins,
                  pointsCount: currentStopGroup.length
                });
              }
            }
            currentStopGroup = [];
          }
        });

        if (currentStopGroup.length >= 2) {
          const first = currentStopGroup[0];
          const last = currentStopGroup[currentStopGroup.length - 1];
          const t1 = new Date(first.timestamp).getTime();
          const t2 = new Date(last.timestamp).getTime();
          const durationMins = Math.round((t2 - t1) / 60000);

          if (durationMins >= 3) {
            stops.push({
              id: `stop-${stops.length + 1}`,
              lat: first.lat,
              lng: first.lng,
              address: first.address || first.street || `${first.lat.toFixed(4)}, ${first.lng.toFixed(4)}`,
              arrivalTime: new Date(first.timestamp).toLocaleTimeString(),
              departureTime: new Date(last.timestamp).toLocaleTimeString(),
              durationMins,
              pointsCount: currentStopGroup.length
            });
          }
        }

        setStoppageList(stops);
      }
    } catch (err) {
      console.warn("Failed to fetch stoppage analytics:", err);
    } finally {
      setStoppagesLoading(false);
    }
  };

  // Fetch Live Alerts from Backend & Firebase
  const fetchLiveAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (err) {
      console.warn("Failed to fetch alerts:", err);
    }
  };

  useEffect(() => {
    fetchLiveAlerts();
  }, []);


  // Clean up legacy URL parameters without forced page reloads
  useEffect(() => {
    if (window.location.search.includes('ver=')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);


  // Reverse Geocoding Effect for Area & Street Name
  useEffect(() => {
    if (!selectedVehicleId) return;
    const t = telemetry[selectedVehicleId] || {};
    if (!t.isOnline || t.status === 'offline' || !t.lat || !t.lng) {
      setCurrentStreet(prev => ({ ...prev, [selectedVehicleId]: 'Offline' }));
      setCurrentArea(prev => ({ ...prev, [selectedVehicleId]: 'Offline' }));
      setCurrentAddress(prev => ({ ...prev, [selectedVehicleId]: 'Offline' }));
      return;
    }
    if (t.address && t.street && t.address !== 'Offline') {
      setCurrentStreet(prev => ({ ...prev, [selectedVehicleId]: t.street }));
      setCurrentArea(prev => ({ ...prev, [selectedVehicleId]: t.area || t.suburb || 'Live Area' }));
      setCurrentAddress(prev => ({ ...prev, [selectedVehicleId]: t.address }));
      return;
    }


    const lat = t.lat;
    const lng = t.lng;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

    if (currentAddress[key]) {
      setCurrentStreet(prev => ({ ...prev, [selectedVehicleId]: currentStreet[key] || `${lat.toFixed(5)}, ${lng.toFixed(5)}` }));
      setCurrentArea(prev => ({ ...prev, [selectedVehicleId]: currentArea[key] || `${lat.toFixed(5)}, ${lng.toFixed(5)}` }));
      setCurrentAddress(prev => ({ ...prev, [selectedVehicleId]: currentAddress[key] || `${lat.toFixed(5)}, ${lng.toFixed(5)}` }));
      return;
    }

    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`)
      .then(res => res.json())
      .then(data => {
        if (data && (data.address || data.display_name)) {
          const a = data.address || {};
          const street = a.road || a.pedestrian || a.footway || a.street || a.highway || a.building || a.amenity || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          const area = a.suburb || a.neighbourhood || a.quarter || a.residential || a.city_district || a.locality || a.city || 'Live Location';
          const city = a.city || a.town || a.county || a.state_district || '';
          const state = a.state || '';
          const pin = a.postcode ? `PIN: ${a.postcode}` : '';

          const fullAddr = [street, area, city, state, pin].filter(Boolean).join(', ');

          setCurrentStreet(prev => ({ ...prev, [key]: street, [selectedVehicleId]: street }));
          setCurrentArea(prev => ({ ...prev, [key]: area, [selectedVehicleId]: area }));
          setCurrentAddress(prev => ({ ...prev, [key]: fullAddr, [selectedVehicleId]: fullAddr }));
        }
      })
      .catch(() => {
        const rawCoords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setCurrentStreet(prev => ({ ...prev, [key]: rawCoords, [selectedVehicleId]: rawCoords }));
        setCurrentArea(prev => ({ ...prev, [key]: rawCoords, [selectedVehicleId]: rawCoords }));
        setCurrentAddress(prev => ({ ...prev, [key]: rawCoords, [selectedVehicleId]: rawCoords }));
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
    { id: 'usr-1', username: 'admin', role: 'admin', name: 'System Administrator', assignedVehicle: '', status: 'Active' }
  ]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('operator');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserVeh, setNewUserVeh] = useState('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceTopic, setNewDeviceTopic] = useState('');
  const [newDeviceBroker, setNewDeviceBroker] = useState('mqtt://test.mosquitto.org:1883');

  // Dedicated Emergency SMS Phone Numbers Form State (Max 5 Numbers for ESP32 GSM Module)
  const [smsTargetVehicleId, setSmsTargetVehicleId] = useState('');
  const [smsAlertStatus, setSmsAlertStatus] = useState('ON'); // 'ON' or 'OFF'
  const [smsPhone1, setSmsPhone1] = useState('');
  const [smsPhone2, setSmsPhone2] = useState('');
  const [smsPhone3, setSmsPhone3] = useState('');
  const [smsPhone4, setSmsPhone4] = useState('');
  const [smsPhone5, setSmsPhone5] = useState('');

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
    const baseKm = t.todayRunningKm || 0;
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

  // Mobile Hamburger Navigation Drawer State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Map and Chart Refs
  const dashboardMapRef = useRef(null);
  const trackingMapRef = useRef(null);
  const dashboardMapInstance = useRef(null);
  const trackingMapInstance = useRef(null);
  const dashboardMarkerInstance = useRef(null);
  const trackingMarkerInstance = useRef(null);
  const routeLineRef = useRef(null);
  const geofenceCircleRef = useRef(null);

  const engineChartRef = useRef(null);
  const engineChartInstance = useRef(null);
  const prevCoordsRef = useRef(null);
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
    try {
      await apiLogout();
    } catch (e) {}
    setToken(null);
    setRole('viewer');
    localStorage.removeItem('role');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userProfile');
  };

  // Fetch Vehicles with local fallback
  const fetchVehicles = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/vehicles`);
      if (res.ok) {
        let data = await res.json();
        if (Array.isArray(data)) {
          data = data.map(v => ({
            ...v,
            name: v.name || `Tracker (${v.id})`
          }));
          setVehicles(data);
          if (data.length > 0) {
            setSelectedVehicleId(prev => (prev && data.some(v => v.id === prev)) ? prev : data[0].id);
          } else {
            setSelectedVehicleId('');
          }

          // Immediately fetch live telemetry for all vehicles so status is correct from first render
          // This prevents the "all online" flash before WebSocket connects
          try {
            const tRes = await fetch(`${API_BASE}/api/telemetry`);
            if (tRes.ok) {
              const tData = await tRes.json();
              if (tData && typeof tData === 'object') {
                for (const vid in tData) {
                  applyTelemetryUpdate(vid, tData[vid]);
                }
              }
            }
          } catch (tErr) {
            console.warn('Telemetry prefetch warning:', tErr.message);
          }

          return;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch vehicles from server DB:', err);
    }
  };

  // Fetch telemetry history logs with local fallback
  const fetchCharts = async (vid) => {
    if (!vid) return;
    try {
      const resCharts = await fetch(`${API_BASE}/api/charts/${vid}`);
      const dCharts = await resCharts.json();
      setChartsHistory(dCharts);

      const resShock = await fetch(`${API_BASE}/api/shock/${vid}`);
      const dShock = await resShock.json();
      setShockDataList(dShock);

      const resSum = await fetch(`${API_BASE}/api/summaries/${vid}`);
      const dSum = await resSum.json();
      setDailySummary(dSum);
    } catch (err) {
      console.warn("Telemetry history chart fetch note:", err.message);
    }
  };


  // Simulate cargo vibration shock spike
  const triggerShockSpike = async () => {
    if (!selectedVehicleId) return;
    try {
      await fetch(`${API_BASE}/api/control/trigger-shock`, {
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
      await fetch(`${API_BASE}/api/control/toggle-power`, {
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
      await fetch(`${API_BASE}/api/geofences/${selectedVehicleId}`, {
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
      const res = await fetch(`${API_BASE}/api/vehicles`, {
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

  // Auto-sync Emergency SMS Phone input fields when selected device changes
  useEffect(() => {
    if (vehicles.length > 0 && !smsTargetVehicleId) {
      setSmsTargetVehicleId(vehicles[0].id);
    }
  }, [vehicles]);

  useEffect(() => {
    if (!smsTargetVehicleId) return;
    const targetVeh = vehicles.find(v => v.id === smsTargetVehicleId);
    const phones = targetVeh?.phoneNumbers || [];
    setSmsAlertStatus(targetVeh?.smsAlertStatus || 'ON');
    setSmsPhone1(phones[0] || '');
    setSmsPhone2(phones[1] || '');
    setSmsPhone3(phones[2] || '');
    setSmsPhone4(phones[3] || '');
    setSmsPhone5(phones[4] || '');
  }, [smsTargetVehicleId, vehicles]);

  // Save & Sync Emergency Phone Numbers for Selected Device over MQTT
  const handleSaveSmsContacts = async (e) => {
    e.preventDefault();
    if (!smsTargetVehicleId) {
      alert("Please select a device to configure SMS contacts.");
      return;
    }

    const selectedVeh = vehicles.find(v => v.id === smsTargetVehicleId);
    if (!selectedVeh) return;

    const phoneNumbers = [smsPhone1, smsPhone2, smsPhone3, smsPhone4, smsPhone5]
      .map(p => p.trim())
      .filter(p => p.length > 0);

    try {
      const res = await fetch(`${API_BASE}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedVeh,
          phoneNumbers,
          smsAlertStatus
        })
      });

      if (res.ok) {
        await fetchVehicles();
        alert(`📲 Updated Emergency SMS Numbers for device "${smsTargetVehicleId}" (${phoneNumbers.length} numbers, alert_status: [${smsAlertStatus}]) synced over MQTT topic [sedhupathi/${smsTargetVehicleId}/number]!`);
      } else {
        alert("Failed to update emergency contacts on server.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving emergency contacts to database.");
    }
  };

  // Trigger Manual Test SMS over MQTT for ESP32 GSM module
  const handleTestSms = async (e) => {
    if (e) e.preventDefault();
    if (!smsTargetVehicleId) {
      alert("Please select a target device first.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/control/test-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: smsTargetVehicleId })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`📲 Test SMS Trigger Dispatched over MQTT!\n\nTarget Numbers (${data.phoneNumbers?.length}): ${data.phoneNumbers?.join(', ')}\nMQTT Topic: [${data.topic}]\n\nYour ESP32 GSM module will now fire AT commands to send the SMS!`);
      } else {
        alert(`Failed to send test SMS: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error triggering test SMS.");
    }
  };

  // Add New System User & Map Device / MQTT Topic / Broker
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserName) return;

    const userClean = newUserName.trim();
    const deviceIdClean = (newDeviceId.trim() || `gps-obd-tracker-0${vehicles.length + 1}`).toLowerCase().replace(/\s+/g, '-');
    const topicClean = newDeviceTopic.trim() || `sedhupathi/${deviceIdClean}/data`;
    const brokerClean = newDeviceBroker.trim() || `mqtt://test.mosquitto.org:1883`;
    const deviceNameClean = newVehicleName.trim() || `${userClean}'s Device (${deviceIdClean})`;

    try {
      // 1. Post to backend API to register new vehicle / device & persist to DB
      const res = await fetch(`${API_BASE}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: deviceIdClean,
          name: deviceNameClean,
          userName: userClean,
          topic: topicClean,
          broker: brokerClean,
          vin: `OBD_TRK_${Math.floor(1000 + Math.random() * 9000)}`
        })
      });

      if (res.ok) {
        // 2. Add new user to systemUsers list
        const newUserObj = {
          id: `usr-${Date.now()}`,
          username: userClean.toLowerCase().replace(/\s+/g, '_'),
          role: newUserRole,
          name: userClean,
          assignedVehicle: deviceIdClean,
          topic: topicClean,
          broker: brokerClean,
          status: 'Active'
        };
        setSystemUsers(prev => [...prev, newUserObj]);

        // 3. Clear form inputs
        setNewUserName('');
        setNewUserPassword('');
        setNewDeviceId('');
        setNewDeviceTopic('');
        setNewVehicleName('');

        // 4. Refresh vehicle list from DB and select the new device
        await fetchVehicles();
        setSelectedVehicleId(deviceIdClean);

        alert(`💾 Registered User "${userClean}" and saved Device "${deviceIdClean}" on Broker "${brokerClean}" & Topic "${topicClean}" to DB!`);
      } else {
        alert("Failed to register device on server database.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving user and device to database.");
    }
  };

  // Delete System User permanently from Database
  const handleDeleteUser = async (id) => {
    if (systemUsers.length <= 1) {
      alert("Cannot delete the last remaining admin account.");
      return;
    }
    if (!window.confirm("Are you sure you want to permanently delete this user account from the database?")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        setSystemUsers(prev => prev.filter(u => u.id !== id));
        alert(`🗑️ Successfully deleted user account from Database.`);
      } else {
        alert("Failed to delete user account from server database.");
      }
    } catch (err) {
      console.error("Backend delete user error:", err);
      alert("Error deleting user from database.");
    }
  };

  // Delete Vehicle / Device & Associated User Mapping permanently from DB
  const handleDeleteVehicle = async (vIdInput) => {
    const vId = typeof vIdInput === 'object' ? vIdInput?.id : vIdInput;
    if (!vId) return;

    if (!window.confirm(`Are you sure you want to permanently delete device "${vId}" from the database?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/vehicles/${encodeURIComponent(vId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setTelemetry(prev => {
          const updated = { ...prev };
          delete updated[vId];
          return updated;
        });
        const remaining = vehicles.filter(v => v.id !== vId && v.name !== vId);
        setVehicles(remaining);
        setSystemUsers(prev => prev.filter(u => u.assignedVehicle !== vId));
        setSelectedVehicleId(remaining[0]?.id || '');
        alert(`🗑️ Successfully deleted device "${vId}" permanently from Database.`);
        await fetchVehicles();
      } else {
        alert(`Failed to delete device "${vId}": ${data.error || 'Server error'}`);
      }
    } catch (err) {
      console.error("Backend delete vehicle error:", err);
      alert(`Error deleting device "${vId}" from database: ${err.message}`);
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

  // Helper to deduplicate telemetry updates and prevent UI blinking
  const applyTelemetryUpdate = (vid, data) => {
    if (!vid || !data) return;
    setTelemetry(prev => {
      const existing = prev[vid];
      if (existing &&
          existing.lat === data.lat &&
          existing.lng === data.lng &&
          existing.speed === data.speed &&
          existing.heading === data.heading &&
          existing.status === data.status &&
          existing.isOnline === data.isOnline &&
          existing.rpm === data.rpm &&
          existing.fuelLevel === data.fuelLevel &&
          existing.satellites === data.satellites) {
        return prev; // Skip state change if telemetry hasn't changed
      }
      return {
        ...prev,
        [vid]: data
      };
    });
  };

  // Firebase Real-Time Listener with deduplication
  useEffect(() => {
    const unsubscribe = subscribeToTelemetry((liveData) => {
      if (liveData && Object.keys(liveData).length > 0) {
        for (const vid in liveData) {
          applyTelemetryUpdate(vid, liveData[vid]);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // WebSockets setup for live hardware telemetry
  useEffect(() => {
    let ws = null;

    try {
      const isHttps = window.location.protocol === 'https:';
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if (!isLocalhost && isHttps) {
        console.log("ℹ️ HTTPS deployment detected: Telemetry streams dynamically via Firebase & HTTP polling.");
      } else {
        const backendHost = isLocalhost ? 'localhost' : '64.227.179.37';
        const wsUrl = `ws://${backendHost}:3001`;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.type === 'TELEMETRY_UPDATE') {
            if (payload.vehicleId && payload.data) {
              applyTelemetryUpdate(payload.vehicleId, payload.data);
            }
          } else if (payload.type === 'ALERT_TRIGGERED' && payload.alert) {
            setAlerts(prev => [payload.alert, ...prev]);
            console.log("🚨 REALTIME ALERT RECEIVED:", payload.alert);
          }
        };
      }
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

  // Render & Update Leaflet Map — Dashboard Home = ALL devices, Tracking = single selected vehicle
  useEffect(() => {
    if (activeTab !== 'home' && activeTab !== 'tracking') return;
    const container = activeTab === 'home' ? dashboardMapRef.current : trackingMapRef.current;
    if (!container) return;

    const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
    const currentData = selectedVehicle ? (telemetry[selectedVehicleId] || {}) : {};
    const hasValidCoords = !!selectedVehicle && currentData.lat != null && currentData.lng != null && currentData.isOnline === true;
    const mapInstanceRef = activeTab === 'home' ? dashboardMapInstance : trackingMapInstance;
    const markerRef = activeTab === 'home' ? dashboardMarkerInstance : trackingMarkerInstance;

    // For home: centre on first online device, fallback to Coimbatore
    const onlineDevices = vehicles.filter(v => telemetry[v.id]?.isOnline === true && telemetry[v.id]?.lat != null);
    const firstOnline = onlineDevices[0] ? telemetry[onlineDevices[0].id] : null;
    const centerCoords = activeTab === 'home'
      ? (firstOnline ? [firstOnline.lat, firstOnline.lng] : [11.02366, 76.9424])
      : (hasValidCoords ? [currentData.lat, currentData.lng]
          : (mapInstanceRef.current ? [mapInstanceRef.current.getCenter().lat, mapInstanceRef.current.getCenter().lng] : [11.00659, 77.01404]));

    // Initialize map if not yet created or container changed
    if (!mapInstanceRef.current || mapInstanceRef.current._container !== container) {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      markerRef.current = null;
      routeLineRef.current = null;
      geofenceCircleRef.current = null;
      if (container._leaflet_id) delete container._leaflet_id;

      const map = L.map(container, { zoomControl: false }).setView(centerCoords, activeTab === 'home' ? 13 : (hasValidCoords ? 16 : 13));
      mapInstanceRef.current = map;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd', maxZoom: 20
      }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      setTimeout(() => { if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize(); }, 250);
    }

    // ═══ DASHBOARD HOME: ALL devices on ONE single multi-vehicle map ═══
    if (activeTab === 'home' && mapInstanceRef.current) {
      if (mapInstanceRef.current._fleetMarkersGroup) {
        mapInstanceRef.current._fleetMarkersGroup.clearLayers();
      } else {
        mapInstanceRef.current._fleetMarkersGroup = L.layerGroup().addTo(mapInstanceRef.current);
      }

      const devicesWithCoords = [];

      vehicles.forEach(v => {
        const t = telemetry[v.id] || telemetry[v.topic] || Object.values(telemetry).find(x => x.vehicleId === v.id || x.topic === v.topic) || {};
        const isOnline = t.isOnline === true;
        const hasCoords = typeof t.lat === 'number' && typeof t.lng === 'number' && !isNaN(t.lat) && t.lat !== 0;
        if (!hasCoords) return; // Skip if no GPS coords

        devicesWithCoords.push([t.lat, t.lng]);

        const color = isOnline ? '#10b981' : '#ef4444';
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;background:${color};border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 0 16px ${color};display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;font-weight:bold">${isOnline ? '🟢' : '🔴'}</div>`,
          className: '', iconSize: [36, 36], iconAnchor: [18, 18]
        });

        const marker = L.marker([t.lat, t.lng], { icon })
          .addTo(mapInstanceRef.current._fleetMarkersGroup);

        marker.bindPopup(`
          <div style="font-family:sans-serif;font-size:12px;color:#0f172a;padding:4px;min-width:180px">
            <strong style="color:#0284c7;font-size:13px">📡 ${v.name} (${v.id})</strong><br/>
            <b>Status:</b> <span style="color:${color};font-weight:700">${isOnline ? '🟢 ONLINE / LIVE' : '🔴 OFFLINE'}</span><br/>
            <b>Speed:</b> ${t.speed || 0} km/h<br/>
            <b>Location:</b> ${t.address || `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`}
          </div>`);
      });

      // Auto-fit map bounds to frame ALL devices on the multi-vehicle map
      if (devicesWithCoords.length > 1) {
        mapInstanceRef.current.fitBounds(devicesWithCoords, { padding: [50, 50], maxZoom: 15 });
      } else if (devicesWithCoords.length === 1) {
        mapInstanceRef.current.setView(devicesWithCoords[0], 14);
      }

      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, 300);

      return;
    }

    // ═══ LIVE TRACKING TAB: Single selected vehicle ═══
    if (activeTab === 'tracking' && mapInstanceRef.current) {
      if (hasValidCoords) {
        const currentCoords = [currentData.lat, currentData.lng];
        const heading = currentData.heading || 0;
        const markerColor = '#06b6d4';
        const markerSymbol = '🛰️';
        const vehNameDisplay = selectedVehicle?.name || selectedVehicleId || 'GPS Tracker';
        const popupContent = `
          <div style="color:#0f172a;font-family:sans-serif;padding:4px;font-size:12px;min-width:180px">
            <strong style="font-size:13px;color:#0891b2">${markerSymbol} ${vehNameDisplay}</strong><br/>
            <strong>Status:</strong> <span style="color:#10b981;font-weight:bold">🟢 Live GPS Stream</span><br/>
            <strong>Lat:</strong> ${currentData.lat.toFixed(6)} | <strong>Lng:</strong> ${currentData.lng.toFixed(6)}
          </div>`;

        if (markerRef.current) {
          markerRef.current.setLatLng(currentCoords);
          markerRef.current.getPopup()?.setContent(popupContent);
          const iconEl = markerRef.current.getElement()?.querySelector('.map-veh-icon-inner');
          if (iconEl) iconEl.style.transform = `rotate(${heading}deg)`;
        } else {
          const vehicleIcon = L.divIcon({
            className: 'map-veh-icon',
            html: `<div class="map-veh-icon-inner" style="transform:rotate(${heading}deg);width:34px;height:34px;background-color:${markerColor};border:2px solid #fff;border-radius:50%;box-shadow:0 0 16px ${markerColor};display:flex;align-items:center;justify-content:center;font-size:18px;transition:transform 0.3s ease">${markerSymbol}</div>`,
            iconSize: [34, 34], iconAnchor: [17, 17]
          });
          markerRef.current = L.marker(currentCoords, { icon: vehicleIcon }).addTo(mapInstanceRef.current);
          markerRef.current.bindPopup(popupContent).openPopup();
          mapInstanceRef.current.setView(currentCoords, 16);
          prevCoordsRef.current = currentCoords;
        }

        const prev = prevCoordsRef.current;
        if (!prev || Math.abs(prev[0] - currentCoords[0]) > 0.0001 || Math.abs(prev[1] - currentCoords[1]) > 0.0001) {
          mapInstanceRef.current.panTo(currentCoords, { animate: true, duration: 0.5 });
          prevCoordsRef.current = currentCoords;
        }
      } else {
        if (markerRef.current) { mapInstanceRef.current.removeLayer(markerRef.current); markerRef.current = null; }
      }
    }
  }, [activeTab, selectedVehicleId, telemetry, vehicles]);

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

  if (authLoading) {
    return (
      <div className="auth-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--accent-cyan)' }}>
          <Shield size={36} style={{ marginBottom: '0.75rem' }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>🔐 Verifying Armstrong GPS Session Security...</div>
        </div>
      </div>
    );
  }

  // Auth screen
  if (!token || token === 'guest-token') {
    return (
      <div className="auth-wrapper">
        <div className="auth-box" style={{ maxWidth: '420px' }}>
          <div className="auth-header">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <div className="brand-icon">
                <Shield size={18} />
              </div>
            </div>
            <h1 className="auth-title">ARMSTRONG TELEMATICS</h1>
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
                <span><strong>Factory Operator Mode:</strong> Monitor factory departures, assign trip routes, live alerts &amp; report downloads.</span>
              ) : (
                <span><strong>Customer / Driver Mode:</strong> Live GPS tracking of assigned vehicle, speed, route progress &amp; ETA.</span>
              )}
            </div>

            <button type="submit" className="action-btn" style={{ width: '100%', marginTop: '0.25rem' }}>
              Authenticate &amp; Launch Panel
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
      {/* Mobile Drawer Backdrop Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Side Bar navigation panel */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="brand-icon">
              <Shield size={16} />
            </div>
            <span className="brand-name">ARMSTRONG GPS</span>
          </div>

          <button
            type="button"
            className="mobile-close-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMobileMenuOpen(false);
            }}
            aria-label="Close Navigation Menu"
          >
            <X size={20} style={{ color: '#000000', stroke: '#000000', strokeWidth: 2.5 }} />
          </button>
        </div>

        <nav className={`nav-menu-container ${mobileMenuOpen ? 'open' : ''}`}>
          <ul className="nav-menu">
            {role !== 'viewer' && (
              <li>
                <span className={`nav-link ${activeTab === 'home' ? 'active' : ''}`} onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }}>
                  <Gauge size={14} /> {role === 'operator' ? 'Factory Operations' : 'Dashboard Home'}
                </span>
              </li>
            )}
            <li>
              <span className={`nav-link ${activeTab === 'tracking' ? 'active' : ''}`} onClick={() => { setActiveTab('tracking'); setMobileMenuOpen(false); }}>
                <Map size={14} /> {role === 'viewer' ? 'My Live Tracking' : 'Live Tracking'}
              </span>
            </li>
            <li>
              <span className={`nav-link ${activeTab === 'gallery' ? 'active' : ''}`} onClick={() => { setActiveTab('gallery'); setMobileMenuOpen(false); }}>
                <LayoutGrid size={14} style={{ color: 'var(--accent-cyan)' }} /> Fleet Gallery Grid
              </span>
            </li>
            {role === 'admin' && (
              <li>
                <span className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}>
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
          <div className="topbar-main">
            <button
              type="button"
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <Menu size={18} style={{ color: '#000000', stroke: '#000000', strokeWidth: 2.5 }} />
              <span>MENU</span>
            </button>

            <h2 className="page-title">
              {activeTab === 'home' && 'Dashboard Home'}
              {activeTab === 'tracking' && 'Live Tracking'}
              {activeTab === 'gallery' && 'Fleet Gallery Overview'}
              {activeTab === 'navigation' && 'Google Maps Nav & ETA'}
              {activeTab === 'stoppages' && 'Stoppage Analytics'}
              {activeTab === 'engine' && 'Engine Health'}
              {activeTab === 'fuel' && 'Fuel Monitoring'}
              {activeTab === 'battery' && 'Backup Battery Status'}
              {activeTab === 'summary' && 'Daily Running Summary'}
              {activeTab === 'reports' && 'Reports Generation'}
              {activeTab === 'settings' && 'User Management'}
            </h2>
          </div>

          <div className="topbar-actions">
            {activeTab !== 'home' && (
              <div className="topbar-device-select-box">
                <span className="select-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>📡 Select Device:</span>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="topbar-select"
                >
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      📡 {v.name} ({v.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.85rem' }}>
                
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

              </div>

              {/* SECTION B: MULTI-VEHICLE LIVE MAP (Full Width) */}
              <div className="dashboard-main-row" style={{ display: 'block', width: '100%' }}>
                
                {/* Multi-vehicle live tracking map */}
                <div className="panel-container" style={{ padding: 0, overflow: 'hidden', height: '420px', minHeight: '420px', width: '100%' }}>
                  <div className="panel-header" style={{ padding: '0.65rem 1rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="panel-title"><Map size={14} /> Multi-Vehicle Fleet Live Map</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                      Showing {filteredVehicles.length} of {vehicles.length} vehicles {statusFilter !== 'all' ? `(Filter: ${statusFilter.toUpperCase()})` : ''}
                    </span>
                  </div>
                  <div ref={dashboardMapRef} style={{ height: '380px', minHeight: '380px', width: '100%' }}></div>
                </div>

              </div>

              {/* SECTION C & D: DAY-WISE DATE FILTERS & FLEET VEHICLES LIST / GRID VIEW */}
              <div className="panel-container">
                
                {/* Day-Wise & List/Grid View Filter Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <span className="panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Gauge size={16} style={{ color: 'var(--accent-cyan)' }} /> Fleet Vehicles &amp; Performance Status
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                      Showing data for: <strong style={{ color: 'var(--accent-cyan)' }}>
                        {dateFilterMode === 'today' ? 'Today (Live)' : dateFilterMode === 'yesterday' ? 'Yesterday Rollup' : dateFilterMode === 'week' ? 'This Week Summary' : dateFilterMode === 'month' ? 'This Month Summary' : `Custom Range (${fromDate} to ${toDate})`}
                      </strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    
                    {/* Inline List View vs Grid View Switcher */}
                    <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color)' }}>
                      <button
                        type="button"
                        onClick={() => setFleetViewMode('list')}
                        style={{
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.72rem',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: fleetViewMode === 'list' ? 'var(--accent-cyan)' : 'transparent',
                          color: fleetViewMode === 'list' ? '#fff' : 'var(--text-secondary)',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        ≡ List View
                      </button>
                      <button
                        type="button"
                        onClick={() => setFleetViewMode('grid')}
                        style={{
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.72rem',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: fleetViewMode === 'grid' ? 'var(--accent-cyan)' : 'transparent',
                          color: fleetViewMode === 'grid' ? '#fff' : 'var(--text-secondary)',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <LayoutGrid size={12} /> Grid View
                      </button>
                    </div>

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

                {/* Fleet Vehicles View: List View vs Grid View */}
                {fleetViewMode === 'list' ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em' }}>
                          <th style={{ padding: '0.6rem 0.75rem' }}>Tracker ID</th>
                          <th style={{ padding: '0.6rem 0.75rem' }}>Tracker Name</th>
                          <th style={{ padding: '0.6rem 0.75rem' }}>User Name</th>
                          <th style={{ padding: '0.6rem 0.75rem' }}>MQTT Topic</th>
                          <th style={{ padding: '0.6rem 0.75rem' }}>Current Location</th>
                          <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
                          <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVehicles.length === 0 ? (
                          <tr>
                            <td colSpan="7" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                              No active hardware devices registered in database. Use <b>User Management</b> to register a device.
                            </td>
                          </tr>
                        ) : (
                          filteredVehicles.map((v) => {
                            const t = telemetry[v.id] || {};
                            const mappedUser = systemUsers.find(u => u.assignedVehicle === v.id);
                            const isLive = t.isOnline === true && t.lat != null && typeof t.lat === 'number';
                            const toAddr = isLive ? (t.address || currentAddress[v.id] || `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`) : 'Location Unavailable — Device Offline';
                            const isMoving = isLive && (t.speed || 0) > 0;

                            return (
                              <tr
                                key={v.id}
                                style={{
                                  borderBottom: '1px solid var(--border-color)',
                                  backgroundColor: 'transparent',
                                  transition: 'background-color 0.2s'
                                }}
                              >
                                <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                                  {v.id}
                                </td>
                                <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                                  {v.name}
                                </td>
                                <td style={{ padding: '0.65rem 0.75rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                                  👤 {v.userName || mappedUser?.name || 'System Admin'}
                                </td>
                                <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#38bdf8' }}>
                                  {v.topic || `sedhupathi/${v.id}/data`}
                                </td>
                                <td style={{ padding: '0.65rem 0.75rem', color: isLive ? 'var(--text-primary)' : 'var(--accent-red)', fontWeight: isLive ? 500 : 600 }}>
                                  📍 {toAddr}
                                </td>
                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                  {!isLive ? (
                                    <span
                                      style={{
                                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                        color: '#ef4444',
                                        fontWeight: 800,
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid #ef4444',
                                        fontSize: '0.7rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      🔴 OFFLINE
                                    </span>
                                  ) : isMoving ? (
                                    <span
                                      style={{
                                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                        color: '#16a34a',
                                        fontWeight: 800,
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid #16a34a',
                                        fontSize: '0.7rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      🟢 MOVING ({t.speed || 0} km/h)
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                        color: '#d97706',
                                        fontWeight: 800,
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid #d97706',
                                        fontSize: '0.7rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      🟡 PARKED / IDLE
                                    </span>
                                  )}
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
                ) : (
                  <div className="admin-fleet-grid">
                    {filteredVehicles.map(v => {
                      const tData = telemetry[v.id] || {};
                      const isOff = !telemetry[v.id] || tData.isOnline !== true;
                      return (
                        <div key={v.id} className="fleet-card">
                          <div className="fleet-card-header">
                            <span className="fleet-card-title">
                              📡 {v.name}
                            </span>
                            <span className={isOff ? 'badge-offline' : 'badge-online'}>
                              {isOff ? '🔴 OFFLINE' : '🟢 LIVE GPS'}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                            <div><strong>Tracker ID:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{v.id}</span></div>
                            <div><strong>Assigned Driver:</strong> {v.userName || 'Unassigned'}</div>
                            <div><strong>VIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{v.vin}</span></div>
                            <div><strong>Coordinates:</strong> {!isOff && tData.lat ? `${tData.lat.toFixed(5)}, ${tData.lng.toFixed(5)}` : 'Offline'}</div>
                            <div><strong>Address:</strong> <span style={{ color: isOff ? 'var(--accent-red)' : 'var(--accent-cyan)', fontWeight: 600 }}>{isOff ? 'Offline' : (tData.address || 'Locating...')}</span></div>
                            <div><strong>Backup Battery:</strong> <span style={{ color: '#10b981', fontWeight: 700 }}>{tData.backupBatteryPercent || 100}%</span></div>
                          </div>

                          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={() => { setSelectedVehicleId(v.id); setActiveTab('tracking'); }}
                              className="action-btn"
                              style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                            >
                              <Eye size={12} /> Focus on Map
                            </button>
                            <button
                              onClick={() => { setSelectedVehicleId(v.id); setActiveTab('history'); fetchRouteHistory(v.id); }}
                              className="action-btn secondary"
                              style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                            >
                              <Clock size={12} /> View History
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>

            </div>
          )}

          {/* MAP TAB */}
          {activeTab === 'tracking' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(currentData.isOnline !== true || !currentData.lat) && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.18)', border: '1px solid #ef4444', borderRadius: '6px', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertOctagon size={18} style={{ color: '#ef4444' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>
                      🔴 HARDWARE TRACKER IS OFFLINE / POWERED OFF
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                    Last Heartbeat: {currentData.lastSeen ? new Date(currentData.lastSeen).toLocaleTimeString() : 'Offline'}
                  </span>
                </div>
              )}

              <div className="responsive-two-col-grid">
                <div className="panel-container tracking-map-card" style={{ padding: 0, overflow: 'hidden', height: '480px', minHeight: '340px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    zIndex: 1000,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    border: `1px solid ${currentData.isOnline === true ? '#10b981' : '#ef4444'}`,
                    color: currentData.isOnline === true ? '#10b981' : '#ef4444',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}>
                    <span style={{ backgroundColor: currentData.isOnline === true ? '#10b981' : '#ef4444', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', animation: currentData.isOnline === true ? 'pulse 1.5s infinite' : 'none' }}></span>
                    {currentData.isOnline === true
                      ? `📡 LIVE: ${selectedVehicle?.name || 'Device'} (${selectedVehicleId})`
                      : `🔴 OFFLINE: ${selectedVehicle?.name || 'Device'} — No MQTT Signal`
                    }
                  </div>
                  <div ref={trackingMapRef} style={{ width: '100%', height: '100%', minHeight: '340px', borderRadius: '6px', zIndex: 1 }}></div>
                </div>
                <div className="panel-container">
                  <span className="panel-title"><Compass size={14} /> 📡 {selectedVehicle ? selectedVehicle.name : 'Device'} Details</span>
                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Interactive Map</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: currentData.isOnline === true ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {currentData.isOnline === true ? '🟢 Live (Leaflet OSM)' : '🔴 Offline Mode'}
                  </span>
                </div>

                  <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Hardware Device Status</span>
                    <strong style={{ fontSize: '0.72rem', color: (currentData.isOnline !== true || !currentData.lat) ? 'var(--accent-red)' : currentData.fix ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                      {(currentData.isOnline !== true || !currentData.lat) ? '🔴 POWERED OFF / OFFLINE' : currentData.fix ? '🟢 ONLINE / LIVE GPS FIX' : '🟡 ONLINE / INDOOR STANDBY'}
                    </strong>
                  </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Direction Arrow</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.heading || 0}° Heading</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>GPS Accuracy</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>±{currentData.accuracy || 2.5} m</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Altitude</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.altitude || 0} m</span>
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
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{currentData.isOnline === true && currentData.lat ? 'Live Hardware Stream' : 'Offline'}</span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>🛣️ Street / Road</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-cyan)', textAlign: 'right', maxWidth: '160px', wordBreak: 'break-word' }}>
                    {currentData.isOnline !== true || !currentData.lat ? 'Offline' : (currentData.street || currentStreet[selectedVehicleId] || `${currentData.lat.toFixed(5)}, ${currentData.lng.toFixed(5)}`)}
                  </span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>🏡 Area / Locality</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', textAlign: 'right', maxWidth: '160px', wordBreak: 'break-word' }}>
                    {currentData.isOnline !== true || !currentData.lat ? 'Offline' : (currentData.area || currentArea[selectedVehicleId] || `${currentData.lat.toFixed(5)}, ${currentData.lng.toFixed(5)}`)}
                  </span>
                </div>

                <div className="param-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>📍 Full Address &amp; PIN</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', maxWidth: '160px', wordBreak: 'break-word' }}>
                    {currentData.isOnline !== true || !currentData.lat ? 'Offline' : (currentData.address || currentAddress[selectedVehicleId] || `${currentData.lat.toFixed(5)}, ${currentData.lng.toFixed(5)}`)}
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
                </div>
              </div>
            </div>
          </div>
          </div>
          )}

          {/* FLEET GALLERY GRID PAGE */}
          {activeTab === 'gallery' && (
            <div className="panel-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <LayoutGrid size={20} style={{ color: 'var(--accent-cyan)' }} /> Armstrong GPS Fleet Gallery Overview
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Real-time gallery monitoring across all registered hardware tracking devices in your fleet.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span className="badge-online">🟢 {vehicles.filter(v => telemetry[v.id]?.isOnline === true).length} Online</span>
                  <span className="badge-offline">🔴 {vehicles.filter(v => !telemetry[v.id] || telemetry[v.id]?.isOnline !== true).length} Offline</span>
                </div>
              </div>

              <div className="admin-fleet-grid">
                {vehicles.map(v => {
                  const tData = telemetry[v.id] || {};
                  const isOnline = tData.isOnline === true && tData.lat != null && typeof tData.lat === 'number' && tData.lat !== 0;
                  const isOff = !isOnline;
                  return (
                    <div key={v.id} className="fleet-card" style={{ borderTop: `4px solid ${isOff ? '#ef4444' : '#0284c7'}`, overflow: 'hidden', boxSizing: 'border-box', width: '100%' }}>
                      <div className="fleet-card-header">
                        <span className="fleet-card-title" style={{ fontSize: '1.1rem' }}>
                          📡 {v.name}
                        </span>
                        <span className={isOff ? 'badge-offline' : 'badge-online'}>
                          {isOff ? '🔴 OFFLINE' : '🟢 LIVE GPS'}
                        </span>
                      </div>

                      {/* Interactive Mini-Map Component for each vehicle card */}
                      <FleetCardMiniMap vehicle={v} telemetryData={tData} />

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', margin: '0.5rem 0', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box', width: '100%' }}>
                        <div>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Device Speed</span>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isOff ? 'var(--text-muted)' : 'var(--accent-cyan)' }}>
                            {isOff ? '0 km/h' : `${tData.speed || 0} km/h`}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Backup Battery</span>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981' }}>
                            {tData.backupBatteryPercent || 100}%
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                        <div><strong>Tracker ID:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{v.id}</span></div>
                        <div><strong>Assigned Driver:</strong> {v.userName || 'Unassigned'}</div>
                        <div><strong>Address:</strong> <span style={{ color: isOff ? 'var(--accent-red)' : 'var(--accent-cyan)', fontWeight: 600 }}>{isOff ? 'Offline' : (tData.address || 'Locating...')}</span></div>
                      </div>

                      <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => { setSelectedVehicleId(v.id); setActiveTab('tracking'); }}
                          className="action-btn"
                          style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                        >
                          <Eye size={12} /> Focus on Map
                        </button>
                        <button
                          onClick={() => { setSelectedVehicleId(v.id); setActiveTab('history'); fetchRouteHistory(v.id); }}
                          className="action-btn secondary"
                          style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                        >
                          <Clock size={12} /> View History
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* GOOGLE MAPS NAVIGATION & REAL-TIME ETA TAB */}
          {activeTab === 'navigation' && (
            <div className="responsive-two-col-grid">
              <div className="panel-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#06b6d4' }}>
                  <Navigation size={16} /> Destination Route Search
                </span>

                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                    Enter Destination Address
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      placeholder="e.g. Gandhipuram, Coimbatore"
                      value={destAddressInput}
                      onChange={(e) => { setDestAddressInput(e.target.value); handleSearchDestination(e.target.value); }}
                      style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.9)', color: '#fff', border: '1px solid var(--border-color)', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', outline: 'none' }}
                    />
                  </div>

                  {navAddressSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: '#0f172a', border: '1px solid #06b6d4', borderRadius: '6px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', boxShadow: '0 8px 16px rgba(0,0,0,0.5)' }}>
                      {navAddressSuggestions.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setDestAddressInput(String(item.display_name));
                            calculateNavRoute(parseFloat(item.lat), parseFloat(item.lon), String(item.display_name));
                          }}
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: '#cbd5e1', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          📍 {String(item.display_name)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Preset Quick Destinations */}
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Quick Preset Destinations:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {[
                      { name: 'Coimbatore Airport', lat: 11.0300, lng: 77.0434 },
                      { name: 'Gandhipuram Bus Stand', lat: 11.0168, lng: 76.9558 },
                      { name: 'Railway Station', lat: 10.9980, lng: 76.9637 },
                      { name: 'TIDEL Park', lat: 11.0284, lng: 77.0270 }
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setDestAddressInput(p.name);
                          calculateNavRoute(p.lat, p.lng, p.name);
                        }}
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid rgba(6,182,212,0.4)', backgroundColor: 'rgba(6,182,212,0.1)', color: '#06b6d4', cursor: 'pointer' }}
                      >
                        📍 {String(p.name)}
                      </button>
                    ))}
                  </div>
                </div>

                {navRouteData && (
                  <div style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid #06b6d4', borderRadius: '8px', padding: '0.75rem', marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#06b6d4', marginBottom: '0.3rem' }}>
                      🏁 Destination Directions &amp; ETA
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <div><b>Destination:</b> {String(navRouteData.destName)}</div>
                      <div><b>Distance:</b> <span style={{ color: '#10b981', fontWeight: 700 }}>{navRouteData.distanceKm} km</span></div>
                      <div><b>Estimated Time (ETA):</b> <span style={{ color: '#06b6d4', fontWeight: 700 }}>{navRouteData.durationMins} mins</span></div>
                    </div>
                  </div>
                )}

                {/* Tracker Current Location NOW */}
                <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '0.3rem' }}>
                    📡 Tracker Location NOW
                  </span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    <div><b>Vehicle:</b> {selectedVehicle?.name || 'GPS Tracker'}</div>
                    <div><b>Live Coordinates:</b> {currentData.lat ? `${currentData.lat.toFixed(5)}, ${currentData.lng.toFixed(5)}` : 'Offline'}</div>
                    <div><b>Status:</b> <span style={{ color: currentData.isOnline === false ? '#ef4444' : '#10b981', fontWeight: 700 }}>{currentData.isOnline === false ? '🔴 Offline' : '🟢 Live GPS'}</span></div>
                  </div>
                </div>
              </div>

              <div className="panel-container" style={{ padding: 0, overflow: 'hidden', height: '100%', minHeight: '380px' }}>
                <NavRouteMap navData={navRouteData} vehicleData={currentData} />
              </div>
            </div>
          )}

          {/* STOPPAGE AND DWELL TIME ANALYTICS TAB */}
          {activeTab === 'stoppages' && (
            <div className="responsive-two-col-grid">
              <div className="panel-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="panel-title" style={{ color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Compass size={16} /> Stoppage &amp; Dwell List
                  </span>
                  <button
                    onClick={() => fetchStoppageAnalytics(selectedVehicleId)}
                    className="action-btn"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                  >
                    🔄 Analyze
                  </button>
                </div>

                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.72rem', color: '#f8fafc' }}>
                  <b>Total Stops Detected:</b> <span style={{ color: '#ef4444', fontWeight: 800 }}>{stoppageList.length} Stoppages</span> (&gt; 3 mins)
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '4px' }}>
                  {stoppagesLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      ⏳ Analyzing historical GPS telemetry for stoppage dwell times...
                    </div>
                  ) : stoppageList.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      🛑 No extended stoppages (&gt; 3 mins) detected for selected vehicle.
                    </div>
                  ) : (
                    stoppageList.map((stop, idx) => (
                      <div
                        key={stop.id}
                        style={{
                          padding: '0.65rem',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          borderLeft: '4px solid #ef4444',
                          border: '1px solid var(--border-color)',
                          borderLeftWidth: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                          <strong style={{ color: '#ef4444', fontSize: '0.78rem' }}>🛑 Stop #{idx + 1}</strong>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                            {stop.durationMins} mins dwell
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <div>📍 <b>Address:</b> {stop.address}</div>
                          <div>🕒 <b>Arrived:</b> {stop.arrivalTime} | <b>Departed:</b> {stop.departureTime}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="panel-container" style={{ padding: 0, overflow: 'hidden', minHeight: '380px' }}>
                <StoppageMap stoppages={stoppageList} historyPoints={historyTrail} selectedVehicle={selectedVehicle} />
              </div>
            </div>
          )}

          {/* ENGINE TAB */}
          {activeTab === 'engine' && (
            <div className="responsive-two-col-grid">
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



          {/* ROUTE HISTORY REPLAY TAB */}
          {activeTab === 'history' && (
            <div className="panel-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={18} style={{ color: '#8b5cf6' }} /> Route History Trail &amp; Playback Replay
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Replay exact historical travel paths stored in Firebase Firestore <span style={{ fontFamily: 'var(--font-mono)' }}>telemetry_history</span>.
                  </p>
                </div>
                <button
                  onClick={() => fetchRouteHistory(selectedVehicleId)}
                  className="action-btn"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                >
                  🔄 Refresh Trail
                </button>
              </div>

              {/* 1-HOUR DEVICE OFF / STATIONARY HIGHLIGHT BANNER */}
              {(currentData.isOnline === false || currentData.status === 'offline' || (currentData.speed === 0)) && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '2px solid #ef4444', borderRadius: '8px', padding: '0.85rem 1.15rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ backgroundColor: '#ef4444', color: '#fff', padding: '0.4rem', borderRadius: '50%', display: 'flex' }}>
                      <AlertOctagon size={22} />
                    </div>
                    <div>
                      <h4 style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        🛑 1-HOUR DEVICE OFF / STATIONARY ALERT: {selectedVehicle?.name || selectedVehicleId}
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: '#cbd5e1', margin: '0.2rem 0 0 0' }}>
                        Vehicle is currently <b>POWERED OFF / STATIONARY</b>. Last active heartbeat recorded: <strong style={{ color: '#06b6d4' }}>{currentData.lastSeen ? new Date(currentData.lastSeen).toLocaleTimeString() : 'Offline'}</strong>.
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.25)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid #ef4444' }}>
                    ⚠️ OFF FOR &gt; 60 MINS
                  </span>
                </div>
              )}

              {/* TELEMATICS ON/OFF DURATION & DISTANCE HISTORY OVERVIEW */}
              {historyTrail.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  <div className="panel-container" style={{ padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>🟢 Total ON / Driving Time</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', display: 'block', marginTop: '0.2rem' }}>
                      {Math.floor(historyTrail.filter(p => (p.speed || 0) > 3).length * 0.5 / 60)}h {Math.round(historyTrail.filter(p => (p.speed || 0) > 3).length * 0.5 % 60)}m
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Device online &amp; moving</span>
                  </div>

                  <div className="panel-container" style={{ padding: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>⚡ Total ON &amp; Parked Time</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b', display: 'block', marginTop: '0.2rem' }}>
                      {Math.floor(historyTrail.filter(p => (p.speed || 0) <= 3).length * 0.5 / 60)}h {Math.round(historyTrail.filter(p => (p.speed || 0) <= 3).length * 0.5 % 60)}m
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Power ON &amp; Stationary (0 km/h)</span>
                  </div>

                  <div className="panel-container" style={{ padding: '0.75rem', backgroundColor: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>🛣️ Total Travel Distance</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#06b6d4', display: 'block', marginTop: '0.2rem' }}>
                      {(historyTrail.reduce((acc, pt, i) => {
                        if (i === 0) return 0;
                        const prev = historyTrail[i - 1];
                        if (!prev.lat || !pt.lat) return acc;
                        const R = 6371;
                        const dLat = (pt.lat - prev.lat) * Math.PI / 180;
                        const dLng = (pt.lng - prev.lng) * Math.PI / 180;
                        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(prev.lat * Math.PI / 180) * Math.cos(pt.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                        return acc + (R * c);
                      }, 0)).toFixed(1)} km
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Accumulated GPS trail</span>
                  </div>

                  <div className="panel-container" style={{ padding: '0.75rem', backgroundColor: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>📍 Recorded GPS Points</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#8b5cf6', display: 'block', marginTop: '0.2rem' }}>
                      {historyTrail.length} Coordinates
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Firestore telemetry history</span>
                  </div>
                </div>
              )}

              {historyLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  ⏳ Loading historical GPS trail data from Firebase Firestore...
                </div>
              ) : historyTrail.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  📜 No historical route points recorded yet for vehicle <strong>{selectedVehicleId}</strong>. As physical GPS hardware streams live coordinates, history points will automatically log here!
                </div>
              ) : (
                <div>
                  <div className="replay-controls-bar">
                    <button
                      onClick={() => setIsReplaying(!isReplaying)}
                      className="action-btn"
                      style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      {isReplaying ? <Pause size={14} /> : <Play size={14} />}
                      {isReplaying ? 'Pause Replay' : 'Start Playback'}
                    </button>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Point {replayIndex + 1} of {historyTrail.length}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max={historyTrail.length - 1}
                      value={replayIndex}
                      onChange={(e) => setReplayIndex(Number(e.target.value))}
                      style={{ flex: 1, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {historyTrail[replayIndex]?.timestamp ? new Date(historyTrail[replayIndex].timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>

                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--accent-cyan)' }}>
                      📍 Playback Position Details:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', fontSize: '0.78rem' }}>
                      <div><strong>Latitude:</strong> {historyTrail[replayIndex]?.lat?.toFixed(5)}</div>
                      <div><strong>Longitude:</strong> {historyTrail[replayIndex]?.lng?.toFixed(5)}</div>
                      <div><strong>Speed:</strong> {historyTrail[replayIndex]?.speed || 0} km/h</div>
                    </div>
                  </div>

                  {/* DETAILED TELEMATICS HISTORY LOGS TABLE */}
                  <div style={{ marginTop: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        📜 Full Movement &amp; Stoppage Telematics Logs ({historyTrail.length} Recorded Points)
                      </span>
                    </div>

                    <div style={{ overflowX: 'auto', maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 10 }}>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                            <th style={{ padding: '0.5rem 0.65rem' }}>Point #</th>
                            <th style={{ padding: '0.5rem 0.65rem' }}>Timestamp</th>
                            <th style={{ padding: '0.5rem 0.65rem' }}>Status Log</th>
                            <th style={{ padding: '0.5rem 0.65rem' }}>Speed</th>
                            <th style={{ padding: '0.5rem 0.65rem' }}>Coordinates</th>
                            <th style={{ padding: '0.5rem 0.65rem' }}>Location Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyTrail.map((pt, idx) => {
                            const isOff = pt.status === 'OFF' || pt.deviceStatus?.includes('OFF');
                            const isMoving = (pt.speed || 0) > 3;
                            const badgeText = pt.deviceStatus || (isOff ? '🔴 POWERED OFF / DISCONNECTED' : (isMoving ? '🟢 DEVICE ON / MOVING' : '⚡ DEVICE ON / PARKED (0 km/h)'));
                            return (
                              <tr
                                key={idx}
                                style={{
                                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                                  backgroundColor: idx === replayIndex ? 'rgba(6, 182, 212, 0.15)' : (idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')
                                }}
                              >
                                <td style={{ padding: '0.45rem 0.65rem', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                                  #{idx + 1}
                                </td>
                                <td style={{ padding: '0.45rem 0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                  {pt.timestamp ? new Date(pt.timestamp).toLocaleTimeString() : 'N/A'}
                                </td>
                                <td style={{ padding: '0.45rem 0.65rem' }}>
                                  <span style={{
                                    backgroundColor: isOff ? 'rgba(239, 68, 68, 0.2)' : (isMoving ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                                    color: isOff ? '#ef4444' : (isMoving ? '#10b981' : '#f59e0b'),
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.68rem'
                                  }}>
                                    {badgeText}
                                  </span>
                                </td>
                                <td style={{ padding: '0.45rem 0.65rem', fontWeight: 700, color: isMoving ? '#10b981' : 'var(--text-muted)' }}>
                                  {Math.round(pt.speed || 0)} km/h
                                </td>
                                <td style={{ padding: '0.45rem 0.65rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#38bdf8' }}>
                                  {pt.lat ? `${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}` : 'N/A'}
                                </td>
                                <td style={{ padding: '0.45rem 0.65rem', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  📍 {pt.address || 'Saibaba Colony, Coimbatore'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 1-HOUR STATIONARY IDLE ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div className="panel-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={18} style={{ color: '#ef4444' }} /> 1-Hour Stationary &amp; Idle Alert Center
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Real-time notifications sent to Admins, Operators, and Drivers when a vehicle remains stationary for &gt;= 60 minutes.
                  </p>
                </div>
                <button onClick={fetchLiveAlerts} className="action-btn secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                  🔄 Refresh Alerts
                </button>
              </div>

              {alerts.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: '#10b981', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <CheckCircle2 size={32} style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                  <strong>All Clear! No Stationary or Idle Alerts Triggered</strong>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Vehicles are moving actively or within normal operation limits.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {alerts.map(a => (
                    <div key={a.id} style={{ background: 'rgba(239, 68, 68, 0.06)', borderLeft: '4px solid #ef4444', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <AlertTriangle size={14} /> {a.title || '1-Hour Stationary Alert'}
                        </strong>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                          {a.message}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          📍 Location: {a.address} | Duration: <strong>{a.durationMinutes || 60} mins</strong>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                        {new Date(a.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FUEL MONITORING TAB */}
          {activeTab === 'fuel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="responsive-three-col-grid">
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
              <div className="responsive-four-col-grid">
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
            <div className="responsive-two-col-grid">
              
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
            <div className="responsive-two-col-grid">
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
                  <strong>Route Deviation &amp; Geofence Report</strong>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              <div>
                <h3 style={{ fontSize: '1rem', color: 'var(--accent-cyan)', marginBottom: '0.85rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.35rem' }}>
                  👥 User &amp; Hardware Device Management
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  
                  {/* 1. Register & Save Hardware Device */}
                  <div className="panel-container">
                    <span className="panel-title">Register &amp; Save Device</span>
                    <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <div className="form-group">
                        <label>Full User Name</label>
                        <input type="text" className="form-input" placeholder="e.g. John Driver" value={newUserName} onChange={e => setNewUserName(e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>Tracker ID / Device ID</label>
                        <input type="text" className="form-input" placeholder="e.g. gps-obd-tracker-02" value={newDeviceId} onChange={e => setNewDeviceId(e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>Tracker Name / Alias</label>
                        <input type="text" className="form-input" placeholder="e.g. Truck 2 - OBD Tracker" value={newVehicleName} onChange={e => setNewVehicleName(e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>MQTT Topic Name</label>
                        <input type="text" className="form-input" placeholder="e.g. sedhupathi/gps-obd-tracker-02/data" value={newDeviceTopic} onChange={e => setNewDeviceTopic(e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label>MQTT Broker Host / Name</label>
                        <input type="text" className="form-input" placeholder="e.g. mqtt://test.mosquitto.org:1883" value={newDeviceBroker} onChange={e => setNewDeviceBroker(e.target.value)} required />
                      </div>

                      <button type="submit" className="action-btn" style={{ marginTop: '0.5rem', backgroundColor: 'var(--accent-cyan)' }}>
                        💾 Save Device
                      </button>
                    </form>
                  </div>

                  {/* 2. DEDICATED SEPARATE FORM: Emergency SMS Alert Contacts (Max 5 Numbers) */}
                  <div className="panel-container">
                    <span className="panel-title" style={{ color: 'var(--accent-orange)' }}>
                      📱 Emergency SMS Alert Contacts
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      Configure up to 5 phone numbers synced directly to ESP32 GSM module via MQTT for cellular SMS alerts.
                    </p>

                    <form onSubmit={handleSaveSmsContacts} style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <div className="form-group">
                        <label style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>Select Target Device / Vehicle</label>
                        <select
                          className="form-input"
                          value={smsTargetVehicleId}
                          onChange={e => setSmsTargetVehicleId(e.target.value)}
                          style={{ width: '100%', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}
                        >
                          {vehicles.map(v => (
                            <option key={v.id} value={v.id}>
                              📡 {v.name} ({v.id})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* SMS Alert Master Status (ON / OFF) to block unwanted SMS alerts */}
                      <div className="form-group" style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <label style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>SMS Alert Master Status</span>
                          <span style={{ color: smsAlertStatus === 'ON' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 800 }}>
                            {smsAlertStatus === 'ON' ? '🟢 ON (Alerts Active)' : '🔴 OFF (Alerts Blocked)'}
                          </span>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => setSmsAlertStatus('ON')}
                            style={{
                              padding: '0.35rem',
                              fontSize: '0.72rem',
                              borderRadius: '4px',
                              border: '1px solid',
                              borderColor: smsAlertStatus === 'ON' ? 'var(--accent-green)' : 'var(--border-color)',
                              backgroundColor: smsAlertStatus === 'ON' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                              color: smsAlertStatus === 'ON' ? 'var(--accent-green)' : 'var(--text-muted)',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🟢 Enable Alerts (ON)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSmsAlertStatus('OFF')}
                            style={{
                              padding: '0.35rem',
                              fontSize: '0.72rem',
                              borderRadius: '4px',
                              border: '1px solid',
                              borderColor: smsAlertStatus === 'OFF' ? 'var(--accent-red)' : 'var(--border-color)',
                              backgroundColor: smsAlertStatus === 'OFF' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                              color: smsAlertStatus === 'OFF' ? 'var(--accent-red)' : 'var(--text-muted)',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🔴 Block Alerts (OFF)
                          </button>
                        </div>
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.72rem' }}>Phone Number 1 (Primary Contact)</label>
                        <input type="tel" className="form-input" placeholder="e.g. +919876543210" value={smsPhone1} onChange={e => setSmsPhone1(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label style={{ fontSize: '0.72rem' }}>Phone Number 2</label>
                        <input type="tel" className="form-input" placeholder="e.g. +919876543211" value={smsPhone2} onChange={e => setSmsPhone2(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label style={{ fontSize: '0.72rem' }}>Phone Number 3</label>
                        <input type="tel" className="form-input" placeholder="e.g. +919876543212" value={smsPhone3} onChange={e => setSmsPhone3(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label style={{ fontSize: '0.72rem' }}>Phone Number 4</label>
                        <input type="tel" className="form-input" placeholder="e.g. +919876543213" value={smsPhone4} onChange={e => setSmsPhone4(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label style={{ fontSize: '0.72rem' }}>Phone Number 5</label>
                        <input type="tel" className="form-input" placeholder="e.g. +919876543214" value={smsPhone5} onChange={e => setSmsPhone5(e.target.value)} />
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                        <button type="submit" className="action-btn" style={{ flex: 1, backgroundColor: 'var(--accent-orange)', color: '#000', fontWeight: 800 }}>
                          💾 Save &amp; Sync SMS Numbers
                        </button>
                        <button type="button" onClick={handleTestSms} className="action-btn" style={{ flex: 1, backgroundColor: 'var(--accent-cyan)', color: '#000', fontWeight: 800 }}>
                          📲 Send Test SMS Now
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* 2. Registered Devices & Delete Manager */}
                  <div className="panel-container">
                    <span className="panel-title">Registered Devices</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      All registered devices below are stored in the database. Click <b>Delete</b> to remove them.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '520px', overflowY: 'auto' }}>
                      {vehicles.length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>
                          No registered devices in database. Fill out the form to save a device.
                        </p>
                      ) : (
                        vehicles.map(v => {
                          const mappedUser = systemUsers.find(u => u.assignedVehicle === v.id);
                          const phones = v.phoneNumbers || [];
                          return (
                            <div
                              key={v.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: '#ffffff',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                                  📡 {v.name}
                                </strong>
                                <div style={{ fontSize: '0.72rem', color: '#0284c7', fontFamily: 'var(--font-mono)' }}>
                                  🆔 Tracker ID: <b>{v.id}</b>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#475569' }}>
                                  🛰️ Topic: <code style={{ color: '#0369a1' }}>{v.topic || `sedhupathi/${v.id}/data`}</code>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  🌐 Broker: <code style={{ color: '#047857' }}>{v.broker || 'mqtt://test.mosquitto.org:1883'}</code>
                                </div>
                                {phones.length > 0 && (
                                  <div style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 600 }}>
                                    📱 SMS Emergency Contacts ({phones.length}): {phones.join(', ')}
                                  </div>
                                )}
                                {(v.userName || mappedUser?.name) && (
                                  <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>
                                    👤 User: {v.userName || mappedUser?.name}
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => handleDeleteVehicle(v.id)}
                                title={`Delete ${v.name}`}
                                style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  color: 'var(--accent-red)',
                                  padding: '0.4rem 0.65rem',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 600
                                }}
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
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
