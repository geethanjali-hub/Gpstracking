import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://test.mosquitto.org:1883');

client.on('connect', () => {
  console.log('Connected to MQTT test broker');
  
  const livePayload = {
    device_id: "gps-obd-tracker-01",
    location: {
      fix: true,
      lat: 11.006590,
      lng: 77.014040,
      speed_kph: 35.0,
      heading_deg: 180.0,
      altitude_m: 314.0,
      satellites: 9,
      hdop: 1.1,
      source: "gps"
    },
    engine: {
      rpm: 1450,
      coolant_temp_c: 85.0,
      engine_load_pct: 30,
      throttle_pct: 15,
      check_engine: false,
      source: "simulated"
    },
    fuel: {
      fuel_level_pct: 75.0,
      fuel_consumption_lph: 2.0,
      source: "simulated"
    },
    battery: {
      battery_voltage: 13.8,
      battery_pct: 95.0,
      power_source: "vehicle",
      charging: true
    }
  };

  client.publish('sedhupathi/gps-obd-tracker-01/data', JSON.stringify(livePayload), () => {
    console.log('✅ Published live GPS coordinates (11.00659, 77.01404) to sedhupathi/gps-obd-tracker-01/data');
    client.end();
  });
});
