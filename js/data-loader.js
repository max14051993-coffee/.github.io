import { normKey, normalizeName, toNumber } from './utils.js';

const HEADERS = {
  timestamp:       ['Timestamp'],
  email:           ['Email Address'],
  uploader:        ['Uploader'],
  originCountry:   ['Origin country'],
  originRegion:    ['Origin region'],
  farmName:        ['Farm name'],
  process:         ['Process'],
  brewMethod:      ['Brew method'],
  whereConsumed:   ['Where consumed'],
  cafeName:        ['Cafe name'],
  cafeUrl:         ['Cafe URL'],
  consumedCity:    ['Consumed city', 'Consumed city '],
  consumedAddr:    ['Consumed address'],
  recipe:          ['Recipe'],
  roasterName:     ['Roaster name'],
  roasterCity:     ['Roaster city'],
  fileUpload:      ['File upload', 'File upload '],
  lat:             ['Latitude (lat)', 'Latitude'],
  lng:             ['Longitude (lng)', 'Longitude'],
  photoUrl:        ['Photo (URL)'],
  geocodeSource:   ['Geocode source'],
  geocodeAccuracy: ['Geocode accuracy'],
  matchedName:     ['Matched name'],
  countryIso2:     ['Country ISO2'],
  flagEmoji:       ['Flag emoji'],
};

function makeRowPicker(row) {
  const normalizedRow = {};
  for (const key in row) normalizedRow[normKey(key)] = row[key];
  const allKeys = Object.keys(normalizedRow);
  return function pick(candidates) {
    for (const k of candidates) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
    }
    for (const cand of candidates) {
      const normalizedCandidate = normKey(cand);
      if (normalizedRow[normalizedCandidate] !== undefined && normalizedRow[normalizedCandidate] !== '') {
        return normalizedRow[normalizedCandidate];
      }
    }
    for (const cand of candidates) {
      const normalizedCandidate = normKey(cand);
      for (const key of allKeys) {
        if (key.startsWith(normalizedCandidate) && normalizedRow[key] !== '') return normalizedRow[key];
      }
    }
    return '';
  };
}

function normalizeProcessName(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'other';
  if (/(honey|red honey|yellow honey|white honey|black honey)/.test(s)) return 'honey';
  if (/(anaer|carbonic|cm|термо|thermal|macerat|carbonique)/.test(s)) return 'anaerobic';
  if (/(wash|fully washed|wet|мыта|мытый|вымыт)/.test(s)) return 'washed';
  if (/(natur|dry|сух)/.test(s)) return 'natural';
  if (/(yeast|који|koji|enzym|фермент|co-?ferment|double|triple|wine)/.test(s)) return 'experimental';
  return 'other';
}

export function rowsToGeoJSON(rows) {
  const features = [];
  for (const row of rows) {
    const pick = makeRowPicker(row);
    const lat = toNumber(pick(HEADERS.lat));
    const lng = toNumber(pick(HEADERS.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const farmLng5 = +lng.toFixed(5);
    const farmLat5 = +lat.toFixed(5);

    let photo = pick(HEADERS.photoUrl);
    if (!photo) photo = pick(HEADERS.fileUpload);

    const processRaw = pick(HEADERS.process);
    const processNorm = normalizeProcessName(processRaw);

    const properties = {
      timestamp:       pick(HEADERS.timestamp),
      email:           pick(HEADERS.email),
      uploader:        pick(HEADERS.uploader),
      originCountry:   pick(HEADERS.originCountry),
      originRegion:    pick(HEADERS.originRegion),
      farmName:        pick(HEADERS.farmName),
      process:         processRaw,
      process_norm:    processNorm,
      brewMethod:      pick(HEADERS.brewMethod),
      whereConsumed:   pick(HEADERS.whereConsumed),
      cafeName:        pick(HEADERS.cafeName),
      cafeUrl:         pick(HEADERS.cafeUrl),
      consumedCity:    pick(HEADERS.consumedCity),
      consumedAddr:    pick(HEADERS.consumedAddr),
      recipe:          pick(HEADERS.recipe),
      roasterName:     pick(HEADERS.roasterName),
      roasterCity:     pick(HEADERS.roasterCity),
      photoUrl:        photo,
      matchedName:     pick(HEADERS.matchedName),
      countryIso2:     pick(HEADERS.countryIso2),
      flagEmoji:       pick(HEADERS.flagEmoji),
      farmLng5,
      farmLat5,
    };

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties,
    });
  }
  return { type: 'FeatureCollection', features };
}

const CITY_CACHE_NS = 'coffee_city_cache_v1';
const cityCache = typeof window !== 'undefined'
  ? JSON.parse(window.localStorage.getItem(CITY_CACHE_NS) || '{}')
  : {};

function cacheSave() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CITY_CACHE_NS, JSON.stringify(cityCache));
}

async function geocodeCityName(name, mapboxToken) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  if (cityCache[key]) return cityCache[key];
  const url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
    encodeURIComponent(name) + '.json?' + new URLSearchParams({
      access_token: mapboxToken,
      types: 'place,locality',
      language: 'ru,en',
      limit: '1',
    });
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const feature = (json.features || [])[0];
  if (!feature || !Array.isArray(feature.center)) return null;
  const [lng, lat] = feature.center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const point = { lng, lat };
  cityCache[key] = point;
  cacheSave();
  return point;
}

export async function geocodeCities(names, mapboxToken) {
  const tasks = names.map(async (raw) => {
    const name = String(raw || '').trim();
    if (!name) return null;
    const pt = await geocodeCityName(name, mapboxToken);
    return pt ? { name, pt } : null;
  });
  const results = await Promise.all(tasks);
  const out = {};
  for (const result of results) {
    if (!result) continue;
    const { name, pt } = result;
    out[name] = pt;
    out[normalizeName(name).toLowerCase()] = pt;
  }
  return out;
}

export function getCityPt(name, cityMap) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const norm = normalizeName(raw).toLowerCase();
  return cityMap[norm] || cityMap[raw] || cityMap[raw.toLowerCase()] || null;
}

export function buildRouteFeatures(pointFeatures, cityMap) {
  const lines = [];

  function addLine(kind, coordinates, extraProps) {
    lines.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { kind, ...extraProps },
    });
  }

  for (const feature of pointFeatures) {
    const properties = feature.properties || {};
    const [farmLng, farmLat] = feature.geometry.coordinates;
    const farmLng5 = +properties.farmLng5;
    const farmLat5 = +properties.farmLat5;

    const roasterCity = getCityPt(properties.roasterCity, cityMap);
    const consumedCity = getCityPt(properties.consumedCity, cityMap);

    if (roasterCity) {
      const rLng5 = +roasterCity.lng.toFixed(5);
      const rLat5 = +roasterCity.lat.toFixed(5);

      addLine('farm_to_roaster', [[farmLng, farmLat], [roasterCity.lng, roasterCity.lat]], {
        farmLng5,
        farmLat5,
        roasterLng5: rLng5,
        roasterLat5: rLat5,
      });

      if (consumedCity) {
        const uLng5 = +consumedCity.lng.toFixed(5);
        const uLat5 = +consumedCity.lat.toFixed(5);

        addLine('roaster_to_consumed', [[roasterCity.lng, roasterCity.lat], [consumedCity.lng, consumedCity.lat]], {
          roasterLng5: rLng5,
          roasterLat5: rLat5,
          consumedLng5: uLng5,
          consumedLat5: uLat5,
        });
      }
    }
  }

  return lines;
}

const HOME_RE = /(home|дом|house|дома)/i;

export function buildCityPoints(pointFeatures, cityMap) {
  const aggregated = new Map();
  for (const feature of pointFeatures) {
    const properties = feature.properties || {};

    if (properties.roasterCity) {
      const city = normalizeName(properties.roasterCity);
      const pt = cityMap[city] || cityMap[city.toLowerCase()];
      if (pt) {
        const key = city.toLowerCase();
        const current = aggregated.get(key) || {
          city,
          lng: pt.lng,
          lat: pt.lat,
          roasters: new Set(),
          places: new Set(),
          home: false,
        };
        const roasterName = normalizeName(properties.roasterName);
        if (roasterName) current.roasters.add(roasterName.toLowerCase());
        aggregated.set(key, current);
      }
    }

    if (properties.consumedCity) {
      const city = normalizeName(properties.consumedCity);
      const pt = cityMap[city] || cityMap[city.toLowerCase()];
      if (pt) {
        const key = city.toLowerCase();
        const current = aggregated.get(key) || {
          city,
          lng: pt.lng,
          lat: pt.lat,
          roasters: new Set(),
          places: new Set(),
          home: false,
        };
        const cafeName = normalizeName(properties.cafeName);
        if (cafeName) current.places.add(cafeName.toLowerCase());
        if (properties.whereConsumed && HOME_RE.test(properties.whereConsumed)) current.home = true;
        aggregated.set(key, current);
      }
    }
  }

  const features = [];
  for (const item of aggregated.values()) {
    const roasters = [...item.roasters].map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
    const places = [...item.places].map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
    const kind = roasters.length && (places.length || item.home)
      ? 'both'
      : (roasters.length ? 'roaster' : 'consumed');
    const size = Math.max(roasters.length + places.length + (item.home ? 1 : 0), 1);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
      properties: { city: item.city, roasters, places, home: item.home, kind, size },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function getVisitedCountriesIso2(pointFeatures) {
  const set = new Set();
  for (const feature of pointFeatures) {
    const code = String(feature.properties?.countryIso2 || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) set.add(code);
  }
  return set;
}

const WORLDVIEW = 'US';

export function buildVisitedFilter(iso2List) {
  return [
    'all',
    ['==', ['get', 'disputed'], 'false'],
    ['any', ['==', 'all', ['get', 'worldview']], ['in', WORLDVIEW, ['get', 'worldview']]],
    ['in', ['get', 'iso_3166_1'], ['literal', iso2List]],
  ];
}

export function computeMetrics(pointFeatures) {
  const countriesSet = getVisitedCountriesIso2(pointFeatures);
  const processes = new Set();
  for (const feature of pointFeatures) {
    const type = (feature.properties?.process_norm) || '';
    if (type && type !== 'other') processes.add(type);
  }
  return {
    total: pointFeatures.length,
    countries: countriesSet.size,
    processTypes: processes.size,
  };
}

function parseCsv(csvUrl) {
  return new Promise((resolve, reject) => {
    const PapaLib = typeof window !== 'undefined' ? window.Papa : undefined;
    if (!PapaLib) {
      reject(new Error('PapaParse is not loaded'));
      return;
    }
    PapaLib.parse(csvUrl, {
      download: true,
      header: true,
      dynamicTyping: false,
      complete: (results) => resolve(results.data || []),
      error: reject,
    });
  });
}

export async function loadData({ csvUrl, mapboxToken }) {
  const rows = await parseCsv(csvUrl);
  const geojsonPoints = rowsToGeoJSON(rows);
  const pointFeatures = geojsonPoints.features;

  const uploaders = [...new Set(pointFeatures.map((f) => (f.properties?.uploader || '').trim()).filter(Boolean))];
  const primaryUploader = (uploaders[0] || '').trim();
  const ownerName = primaryUploader;
  const ownerLabel = primaryUploader
    ? (uploaders.length > 1 ? `${primaryUploader} +${uploaders.length - 1}` : primaryUploader)
    : '';

  const wantedCities = new Set();
  for (const feature of pointFeatures) {
    const properties = feature.properties || {};
    if (properties.roasterCity) wantedCities.add(String(properties.roasterCity).trim());
    if (properties.consumedCity) wantedCities.add(String(properties.consumedCity).trim());
  }
  const uniqueCities = [...wantedCities].filter(Boolean);
  const cityCoordsMap = await geocodeCities(uniqueCities, mapboxToken);

  const lineFeatures = buildRouteFeatures(pointFeatures, cityCoordsMap);
  const cityPoints = buildCityPoints(pointFeatures, cityCoordsMap);
  const visitedCountries = [...getVisitedCountriesIso2(pointFeatures)];
  const metrics = computeMetrics(pointFeatures);

  return {
    geojsonPoints,
    pointFeatures,
    ownerName,
    ownerLabel,
    cityCoordsMap,
    lineFeatures,
    cityPoints,
    visitedCountries,
    metrics,
  };
}
