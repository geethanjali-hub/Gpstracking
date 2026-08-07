import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://test.mosquitto.org:1883');

client.on('connect', () => {
  console.log('Connected to MQTT test broker');
  
  const livePayload = {
    location: {
      fix: true,
      lat: 11.006590,
      lng: 77.014040,
      speed_kph: 38.5,
      heading_deg: 175.0,
      altitude_m: 310.0,
      satellites: 10,
      hdop: 1.1,
      source: "gps"
    },
    engine: {
      rpm: 1520,
      coolant_temp_c: 85.0,
      engine_load_pct: 32,
      throttle_pct: 15,
      check_engine: false,
      source: "simulated"
    },
    fuel: {
      fuel_level_pct: 74.5,
      fuel_consumption_lph: 2.3,
      source: "simulated"
    },
    battery: {
      battery_voltage: 4.1,
      battery_pct: 95.0,
      power_source: "vehicle",
      charging: true
    }
  };

  client.publish('sedhupathi/gps-obd-tracker-01/data', JSON.stringify(livePayload), () => {
    console.log('✅ Live ESP32 payload published to test.mosquitto.org -> sedhupathi/gps-obd-tracker-01/data');
    client.end();
  });
});
