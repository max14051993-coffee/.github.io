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

// Specialty coffee producers grouped by geography to drive achievements.
const AFRICA_ISO = new Set([
  'BI', 'CM', 'CD', 'ET', 'KE', 'MG', 'MW', 'MZ', 'RW', 'SS', 'TZ', 'UG', 'ZM', 'ZW', 'ST',
]);

const ASIA_ISO = new Set([
  'CN', 'ID', 'IN', 'LA', 'MM', 'MY', 'NP', 'PH', 'LK', 'TH', 'TL', 'TW', 'VN', 'YE',
]);

const SOUTH_AMERICA_ISO = new Set([
  'BO', 'BR', 'CO', 'EC', 'PE', 'VE',
]);

const CENTRAL_AMERICA_ISO = new Set([
  'CR', 'GT', 'HN', 'MX', 'NI', 'PA', 'SV',
]);

const CARIBBEAN_ISO = new Set([
  'CU', 'DO', 'HT', 'JM', 'PR',
]);

const NORTH_AMERICA_ISO = new Set([
  'US', ...CENTRAL_AMERICA_ISO, ...CARIBBEAN_ISO,
]);

const OCEANIA_ISO = new Set([
  'FJ', 'NC', 'PG', 'SB', 'VU',
]);

const LATIN_AMERICA_ISO = new Set([
  ...SOUTH_AMERICA_ISO,
  ...CENTRAL_AMERICA_ISO,
  ...CARIBBEAN_ISO,
]);

const ISLAND_COUNTRIES = new Set([
  'CU', 'DO', 'HT', 'ID', 'JM', 'KM', 'MG', 'NC', 'PG', 'PR', 'RE', 'SB', 'ST', 'TW', 'VU', 'FJ',
]);

const COFFEE_CONTINENTS = new Set(['Africa', 'Asia', 'North America', 'South America', 'Oceania']);

function getContinentByIso(iso) {
  if (!iso) return null;
  if (AFRICA_ISO.has(iso)) return 'Africa';
  if (ASIA_ISO.has(iso)) return 'Asia';
  if (SOUTH_AMERICA_ISO.has(iso)) return 'South America';
  if (NORTH_AMERICA_ISO.has(iso)) return 'North America';
  if (OCEANIA_ISO.has(iso)) return 'Oceania';
  return null;
}

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
  const cached = cityCache[key];
  if (cached && cached.countryCode) return cached;
  const fallback = cached || null;
  const url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
    encodeURIComponent(name) + '.json?' + new URLSearchParams({
      access_token: mapboxToken,
      types: 'place,locality',
      language: 'ru,en',
      limit: '1',
    });
  const res = await fetch(url);
  if (!res.ok) return fallback;
  const json = await res.json();
  const feature = (json.features || [])[0];
  if (!feature || !Array.isArray(feature.center)) return fallback;
  const [lng, lat] = feature.center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;
  const context = Array.isArray(feature.context) ? feature.context : [];
  const countryContext = context.find((ctx) => typeof ctx?.id === 'string' && ctx.id.startsWith('country.'))
    || (feature.id && feature.id.startsWith('country.') ? feature : null);
  const shortCode = countryContext?.short_code
    || countryContext?.properties?.short_code
    || feature?.properties?.short_code
    || '';
  const countryCode = shortCode ? shortCode.split('-').pop().toUpperCase() : '';
  const countryName = countryContext?.text || countryContext?.place_name || '';
  const point = { lng, lat };
  if (countryCode) point.countryCode = countryCode;
  if (countryName) point.countryName = countryName;
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

export function computeMetrics(pointFeatures, cityMap = {}) {
  const countriesSet = getVisitedCountriesIso2(pointFeatures);
  const continentSet = new Set();
  const processTypes = new Set();
  const countryRegions = new Map();
  const globalRegions = new Set();
  const ethiopiaRegions = new Set();
  const colombiaRegions = new Set();
  const experimentalMethods = new Set();
  const africanCountries = new Set();
  const asianCountries = new Set();
  const latinCountries = new Set();
  const islandCountries = new Set();
  const espressoCities = new Set();
  const brewCanonical = new Set();
  const consumedCityCounts = new Map();
  const cafeSet = new Set();
  const roastersByCity = new Map();
  const roasterCountrySet = new Set();

  const filterHits = { v60: false, kalita: false, aeropress: false };

  let washedCount = 0;
  let naturalCount = 0;
  let honeyCount = 0;
  let homeCups = 0;
  let geotagWashed = false;
  let geotagHoney = false;
  let hasHoney = false;
  let hasAnaerobic = false;
  let hasCarbonic = false;

  for (const feature of pointFeatures) {
    const properties = feature.properties || {};
    const iso = String(properties.countryIso2 || '').trim().toUpperCase();
    if (iso) {
      const continent = getContinentByIso(iso);
      if (continent) continentSet.add(continent);
      if (AFRICA_ISO.has(iso)) africanCountries.add(iso);
      if (ASIA_ISO.has(iso)) asianCountries.add(iso);
      if (LATIN_AMERICA_ISO.has(iso)) latinCountries.add(iso);
      if (ISLAND_COUNTRIES.has(iso)) islandCountries.add(iso);
    }

    const region = normalizeName(properties.originRegion).toLowerCase();
    if (region) {
      const key = `${iso || 'XX'}::${region}`;
      globalRegions.add(key);
      if (!countryRegions.has(iso)) countryRegions.set(iso, new Set());
      countryRegions.get(iso).add(region);
      if (iso === 'ET') ethiopiaRegions.add(region);
      if (iso === 'CO') colombiaRegions.add(region);
    }

    const processNorm = String(properties.process_norm || '').trim();
    const processRaw = String(properties.process || '').trim().toLowerCase();
    if (processNorm && processNorm !== 'other') processTypes.add(processNorm);
    if (processNorm === 'washed') washedCount += 1;
    if (processNorm === 'natural') naturalCount += 1;
    if (processNorm === 'honey') {
      honeyCount += 1;
      hasHoney = true;
    }
    if (processNorm === 'anaerobic') {
      hasAnaerobic = true;
      if (processRaw) experimentalMethods.add(processRaw);
      else experimentalMethods.add(processNorm);
    }
    if (processNorm === 'experimental') {
      const label = processRaw || processNorm;
      if (label) experimentalMethods.add(label);
    }
    if (/carbonic|карбоник/.test(processRaw)) {
      hasCarbonic = true;
      experimentalMethods.add(processRaw || 'carbonic');
    }

    const roasterPt = properties.roasterCity ? getCityPt(properties.roasterCity, cityMap) : null;
    if (processNorm === 'washed' && roasterPt) geotagWashed = true;
    if (processNorm === 'honey' && roasterPt) geotagHoney = true;
    if (roasterPt?.countryCode) roasterCountrySet.add(String(roasterPt.countryCode).toUpperCase());

    const roasterName = normalizeName(properties.roasterName).toLowerCase();
    const roasterCity = normalizeName(properties.roasterCity).toLowerCase();
    if (roasterName && roasterCity) {
      if (!roastersByCity.has(roasterCity)) roastersByCity.set(roasterCity, new Set());
      roastersByCity.get(roasterCity).add(roasterName);
    }

    const consumedCity = normalizeName(properties.consumedCity).toLowerCase();
    if (consumedCity) {
      consumedCityCounts.set(consumedCity, (consumedCityCounts.get(consumedCity) || 0) + 1);
    }

    const brewKey = normalizeName(properties.brewMethod).toLowerCase();
    if (brewKey) {
      let matched = false;
      if (/espresso|эспрессо|ristretto|доппио/.test(brewKey)) {
        brewCanonical.add('espresso');
        matched = true;
        if (consumedCity) espressoCities.add(consumedCity);
      }
      if (/v\s?60/.test(brewKey)) {
        brewCanonical.add('v60');
        filterHits.v60 = true;
        matched = true;
      }
      if (/kalita/.test(brewKey)) {
        brewCanonical.add('kalita');
        filterHits.kalita = true;
        matched = true;
      }
      if (/aero|аэро|аэропресс/.test(brewKey)) {
        brewCanonical.add('aeropress');
        filterHits.aeropress = true;
        matched = true;
      }
      if (/batch/.test(brewKey)) {
        brewCanonical.add('batch brew');
        matched = true;
      }
      if (/(french\s?press|press\s?pot|френч|пресс-пот)/.test(brewKey)) {
        brewCanonical.add('french press');
        matched = true;
      }
      if (/syphon|siphon|сифон/.test(brewKey)) {
        brewCanonical.add('syphon');
        matched = true;
      }
      if (/chemex/.test(brewKey)) {
        brewCanonical.add('chemex');
        matched = true;
      }
      if (/cold\s?(brew|drip)|колд/.test(brewKey)) {
        brewCanonical.add('cold brew');
        matched = true;
      }
      if (/turk|ibrik|джезв/.test(brewKey)) {
        brewCanonical.add('ibrik');
        matched = true;
      }
      if (/clever/.test(brewKey)) {
        brewCanonical.add('clever');
        matched = true;
      }
      if (!matched) brewCanonical.add(brewKey);
    }

    if (properties.whereConsumed && HOME_RE.test(properties.whereConsumed)) {
      homeCups += 1;
    }

    const cafeName = normalizeName(properties.cafeName).toLowerCase();
    if (cafeName) cafeSet.add(cafeName);
  }

  let homeCityKey = '';
  let maxCityVisits = 0;
  for (const [city, count] of consumedCityCounts.entries()) {
    if (count > maxCityVisits) {
      homeCityKey = city;
      maxCityVisits = count;
    }
  }

  const roastersInHomeCity = homeCityKey && roastersByCity.has(homeCityKey)
    ? roastersByCity.get(homeCityKey).size
    : 0;

  let maxRegionsInCountry = 0;
  for (const regions of countryRegions.values()) {
    const size = regions.size;
    if (size > maxRegionsInCountry) maxRegionsInCountry = size;
  }

  const hasAllCoffeeContinents = [...COFFEE_CONTINENTS].every((continent) => continentSet.has(continent));

  return {
    total: pointFeatures.length,
    countries: countriesSet.size,
    processTypes: processTypes.size,
    countryCodes: [...countriesSet],
    continents: [...continentSet],
    hasAllCoffeeContinents,
    washedCount,
    naturalCount,
    honeyCount,
    hasHoney,
    hasAnaerobic,
    hasCarbonic,
    geotagWashed,
    geotagHoney,
    experimentalMethods: [...experimentalMethods],
    africanCountries: [...africanCountries],
    asianCountries: [...asianCountries],
    latinCountries: [...latinCountries],
    islandCountries: [...islandCountries],
    espressoCities: [...espressoCities],
    brewMethods: [...brewCanonical],
    filterHits,
    homeCups,
    consumedCities: [...consumedCityCounts.keys()],
    cafes: [...cafeSet],
    roastersInHomeCity,
    roasterCountries: [...roasterCountrySet],
    uniqueRegions: globalRegions.size,
    ethiopiaRegions: ethiopiaRegions.size,
    colombiaRegions: colombiaRegions.size,
    maxRegionsInCountry,
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
  const metrics = computeMetrics(pointFeatures, cityCoordsMap);

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
