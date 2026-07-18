const https = require('https');
const query = `[out:json];
(
  way["building"]["name"~"Capital|BKC|Trident|Jio|Parinee|Adani|Naman|Vibgyor|Laxmi"](19.05,72.85,19.07,72.88);
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
        const lat = el.center ? el.center.lat : el.lat;
        const lon = el.center ? el.center.lon : el.lon;
        console.log(`${el.tags.name}: ${lat}, ${lon}`);
      });
    } catch(e) { console.log(data); }
  });
});
req.write(query);
req.end();
