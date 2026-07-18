const https = require('https');
const query = `[out:json];
(
  node["name"~"Vibgyor|Parinee|Adani|Naman|Inspire"](19.04,72.82,19.08,72.89);
  way["name"~"Vibgyor|Parinee|Adani|Naman|Inspire"](19.04,72.82,19.08,72.89);
);
out center;`;

const req = https.request({
  hostname: 'overpass-api.de',
  path: '/api/interpreter',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'AtlasDigitalTwin'
  }
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      parsed.elements.forEach(el => {
        const lat = el.lat || el.center.lat;
        const lon = el.lon || el.center.lon;
        console.log(`${el.tags.name}: ${lat}, ${lon}`);
      });
    } catch(e) { console.log(data); }
  });
});
req.write(query);
req.end();
