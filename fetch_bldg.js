const https = require('https');
const fs = require('fs');

const query = `[out:json];
(
  way["building"](19.055,72.855,19.075,72.875);
  relation["building"](19.055,72.855,19.075,72.875);
);
out geom;`;

const req = https.request({
  hostname: 'overpass-api.de',
  path: '/api/interpreter',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const features = [];
      parsed.elements.forEach(el => {
        if (el.type === 'way' && el.geometry) {
          const coords = el.geometry.map(g => [g.lon, g.lat]);
          features.push({
            type: 'Feature',
            properties: {
              name: el.tags.name || null,
              id: el.id
            },
            geometry: {
              type: 'Polygon',
              coordinates: [coords]
            }
          });
        }
      });
      const geojson = { type: 'FeatureCollection', features };
      fs.writeFileSync('bkc_buildings.geojson', JSON.stringify(geojson));
      console.log('Saved ' + features.length + ' buildings to bkc_buildings.geojson');
    } catch(err) {
      console.error('Error parsing response:', err.message);
    }
  });
});
req.write(query);
req.end();
