const fs = require('fs');
const xml = fs.readFileSync('osm2.xml', 'utf8');
const nodes = {};
const regexNode = /<node id="(\d+)" lat="([\d\.]+)" lon="([\d\.]+)"/g;
let m;
while(m = regexNode.exec(xml)) nodes[m[1]] = [parseFloat(m[3]), parseFloat(m[2])];
console.log('Nodes:', Object.keys(nodes).length);
const ways = [];
const regexWay = /<way id="\d+".*?>(.*?)<\/way>/gs;
while(m = regexWay.exec(xml)){
  const wayStr = m[1];
  if(wayStr.includes('k="building"')){
    const nameMatch = wayStr.match(/k="name" v="([^"]+)"/);
    const nds = [];
    const ndRegex = /<nd ref="(\d+)"/g;
    let n;
    while(n = ndRegex.exec(wayStr)) if(nodes[n[1]]) nds.push(nodes[n[1]]);
    if(nds.length > 0) ways.push({ name: nameMatch ? nameMatch[1] : null, coords: nds });
  }
}
console.log('Buildings with name:', ways.filter(w=>w.name).map(w=>w.name));
fs.writeFileSync('bkc_buildings.json', JSON.stringify(ways));
