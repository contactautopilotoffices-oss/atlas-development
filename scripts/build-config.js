/* Build-time generator for config.js.
   Reads MAPBOX_TOKEN from the environment and writes the same window.MAPBOX_TOKEN
   file that index.html expects. This lets Vercel inject the token at build time
   without committing it to Git. */

const fs = require('fs');
const path = require('path');

const token = process.env.MAPBOX_TOKEN;
if (!token) {
  console.error('Error: MAPBOX_TOKEN environment variable is not set.');
  process.exit(1);
}

const outPath = path.join(__dirname, '..', 'config.js');
const content = `window.MAPBOX_TOKEN = "${token}";\n`;

fs.writeFileSync(outPath, content, 'utf8');
console.log('Generated config.js with MAPBOX_TOKEN.');
