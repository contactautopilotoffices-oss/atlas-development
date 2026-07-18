import urllib.request, json
query = '[out:json];(way["building"](19.055,72.855,19.075,72.875);relation["building"](19.055,72.855,19.075,72.875););out geom;'
req = urllib.request.Request('https://overpass.kumi.systems/api/interpreter', data=query.encode('utf-8'))
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        features = []
        for el in data.get('elements', []):
            if el.get('type') == 'way' and 'geometry' in el:
                coords = [[g['lon'], g['lat']] for g in el['geometry']]
                features.append({'type': 'Feature', 'properties': {'name': el.get('tags', {}).get('name')}, 'geometry': {'type': 'Polygon', 'coordinates': [coords]}})
        with open('bkc_buildings.json', 'w') as f:
            json.dump({'type': 'FeatureCollection', 'features': features}, f)
        print(f'Saved {len(features)} buildings.')
except Exception as e:
    print(e)
