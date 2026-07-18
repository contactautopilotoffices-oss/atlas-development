const fs = require('fs');
let data = fs.readFileSync('data.js', 'utf8');

const geoOrigin = 'const GEO_ORIGIN = { lat: 19.0625, lon: 72.8624 };';
const newGeoToMeters = `
function lngToMercX(lon) { return lon / 360 + 0.5; }
function latToMercY(lat) { return 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI); }
const originMercX = lngToMercX(GEO_ORIGIN.lon);
const originMercY = latToMercY(GEO_ORIGIN.lat);
const MER_SCALE = 1 / (40075016.68 * Math.cos(GEO_ORIGIN.lat * Math.PI / 180));

function geoToMeters(lat, lon) {
  const mx = lngToMercX(lon);
  const my = latToMercY(lat);
  return {
    lat: lat,
    lng: lon,
    x: (mx - originMercX) / MER_SCALE,
    z: -(my - originMercY) / MER_SCALE // Negative maps positive Z to Mapbox South
  };
}
`;

data = data.replace(geoOrigin, geoOrigin + '\n' + newGeoToMeters);

// Replace hardcoded buildings with geoToMeters coordinates!
const replacements = {
  'id:"capital"': '...geoToMeters(19.063220, 72.861896)',
  'id:"naman"': '...geoToMeters(19.0636, 72.8625)',
  'id:"parinee"': '...geoToMeters(19.061031, 72.868160)',
  'id:"adani"': '...geoToMeters(19.0655, 72.8644)',
  'id:"onebkc"': '...geoToMeters(19.060562, 72.865035)',
  'id:"vibgyor"': '...geoToMeters(19.0645, 72.8643)',
  'id:"trident"': '...geoToMeters(19.066690, 72.867918)',
  'id:"jio-world"': '...geoToMeters(19.063947, 72.866494)',
  'id:"laxmi"': '...geoToMeters(19.063071, 72.864041)',
  'id:"wockhardt"': '...geoToMeters(19.0635, 72.8650)',
  'id:"mtnl"': '...geoToMeters(19.0615, 72.8685)',
  'id:"ilfs"': '...geoToMeters(19.0625, 72.8690)',
  'id:"sebi"': '...geoToMeters(19.0645, 72.8655)',
  'id:"nse"': '...geoToMeters(19.0620, 72.8600)',
  'id:"usconsulate"': '...geoToMeters(19.0660, 72.8620)',
  'id:"sofitel"': '...geoToMeters(19.0670, 72.8690)',
  'id:"school"': '...geoToMeters(19.0680, 72.8670)',
  'id:"mca"': '...geoToMeters(19.0610, 72.8670)',
  'id:"mmrda"': '...geoToMeters(19.0650, 72.8610)',
  'id:"vaibhav"': '...geoToMeters(19.0640, 72.8605)'
};

for (const [id, geo] of Object.entries(replacements)) {
  const regex = new RegExp('(' + id + '.*?type:".*?",)\\s*x:.*?,\\s*z:.*?,', 'gs');
  data = data.replace(regex, '$1\n    ' + geo + ',');
}

// Remove the old geoToMeters at the bottom if it was there
data = data.replace(/function geoToMeters.*?}/s, '');

fs.writeFileSync('data.js', data);
console.log('Fixed data.js');
