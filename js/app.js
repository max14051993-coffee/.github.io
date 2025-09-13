  /* ==== настройки ==== */
  const MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbms6-9Pie6VdyXzbjiMwWeIF-mxMvMiyFHaRI1DJE0nPNkSG99lewaeeU8YIuj7Y8vxzJGOD2md1v/pub?gid=1055803810&single=true&output=csv';

  const theme = (new URLSearchParams(location.search).get('style') || 'light').toLowerCase();
  document.body.dataset.theme = theme;
  const FLAG_MODE = (new URLSearchParams(location.search).get('flag') || 'img').toLowerCase(); // 'img' | 'emoji'

  /* ==== карта ==== */
  mapboxgl.accessToken = MAPBOX_TOKEN;
  const map = new mapboxgl.Map({
    container: 'map',
    style: theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
    center: [12, 20], zoom: 2.2, attributionControl: true, renderWorldCopies: false
  });
  map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
  map.doubleClickZoom.disable();

  map.on('load', () => {
    if (!map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', { type: 'raster-dem', url: 'mapbox://mapbox.terrain-rgb', tileSize: 512 });
    }
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.6 });
    if (!map.getLayer('sky')) {
      map.addLayer({ id: 'sky', type: 'sky', paint: { 'sky-type':'atmosphere', 'sky-atmosphere-sun':[10,25], 'sky-atmosphere-sun-intensity': 10 } });
    }
    map.setFog({ range:[0.6, 12], color:'#f6efe7', 'high-color':'#d4c7b8', 'horizon-blend':0.2, 'star-intensity':0 });
  });

  /* ==== утилиты ==== */
  const normKey = (k) => String(k||'').toLowerCase().replace(/\s+/g,' ').trim();
  const normalizeName = (s) => String(s||'').replace(/\s+/g,' ').trim();
  const toNumber = (v) => (typeof v==='number') ? v : (typeof v==='string' ? parseFloat(v.replace(',', '.')) : NaN);
  const escapeHtml = (s) => String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])[m]);
  const escapeAttr = (s) => String(s||'').replace(/"/g,'&quot;');

  function pickSmart(row, candidates){
    for (const k of candidates) if (row[k] !== undefined && row[k] !== '') return row[k];
    const nRow = {}; for (const key in row) nRow[normKey(key)] = row[key];
    for (const cand of candidates){ const nCand = normKey(cand); if (nRow[nCand] !== undefined && nRow[nCand] !== '') return nRow[nCand]; }
    const allKeys = Object.keys(row);
    for (const cand of candidates){
      const nCand = normKey(cand);
      for (const key of allKeys){
        if (normKey(key).startsWith(nCand) && row[key] !== '') return row[key];
      }
    }
    return '';
  }

  function normalizeProcessName(raw){
    const s = String(raw||'').toLowerCase();
    if (!s) return 'other';
    if (/(honey|red honey|yellow honey|white honey|black honey)/.test(s)) return 'honey';
    if (/(anaer|carbonic|cm|термо|thermal|macerat|carbonique)/.test(s)) return 'anaerobic';
    if (/(wash|fully washed|wet|мыта|мытый|вымыт)/.test(s)) return 'washed';
    if (/(natur|dry|сух)/.test(s)) return 'natural';
    if (/(yeast|који|koji|enzym|фермент|co-?ferment|double|triple|wine)/.test(s)) return 'experimental';
    return 'other';
  }
  function processColors(pType){
    switch(pType){
      case 'washed':      return { point:'#2e7d32', bg:'#d7f0df', br:'#82b998', txt:'#205b3a' };
      case 'natural':     return { point:'#c0392b', bg:'#ffd9d2', br:'#e59883', txt:'#7a1d12' };
      case 'honey':       return { point:'#c77f0a', bg:'#ffe9c6', br:'#e9b86a', txt:'#6b4800' };
      case 'anaerobic':   return { point:'#6a3cbc', bg:'#e6d7ff', br:'#b79de5', txt:'#3b2b6f' };
      case 'experimental':return { point:'#2c5aa0', bg:'#dde9f7', br:'#9bb9e6', txt:'#1f3a63' };
      default:            return { point:'#777777', bg:'#eeeeee', br:'#cccccc', txt:'#333333' };
    }
  }

  function extractDriveId(url){
    const m = String(url||'').match(/(?:\/d\/|id=)([-\w]{25,})/);
    return m ? m[1] : null;
  }
  function driveImgHtml(url){
    if (!url) return '';
    if (/thumbnail\?id=/.test(url)) return `<img class="popup-cover" loading="lazy" src="${escapeAttr(url)}" alt="photo">`;
    const id = extractDriveId(url);
    const chain = id ? [
      `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
      `https://lh3.googleusercontent.com/d/${id}=w1600`,
      `https://drive.google.com/uc?export=view&id=${id}`,
      `https://drive.google.com/uc?export=download&id=${id}`
    ] : [url];
    const first = chain.shift();
    return `<img class="popup-cover" loading="lazy" src="${escapeAttr(first)}"
             alt="photo" onerror="driveImgFallback(this, ${JSON.stringify(chain)})">`;
  }
  function driveImgFallback(img, list){ if (!list || !list.length) { img.remove(); return; } img.src = list.shift(); }
  window.driveImgFallback = driveImgFallback;

  function flagFromRow(flagEmojiCell, iso2Cell){
    const emoji = String(flagEmojiCell||'').trim();
    if (FLAG_MODE==='emoji' && emoji) return emoji;
    const code = String(iso2Cell||'').trim().toLowerCase();
    return (code.length===2)
      ? `<img src="https://flagcdn.com/24x18/${code}.png" alt="${code.toUpperCase()}" width="24" height="18" style="vertical-align:-2px;border-radius:2px">`
      : (FLAG_MODE==='emoji' ? emoji : '');
  }

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
    consumedCity:    ['Consumed city','Consumed city '],
    consumedAddr:    ['Consumed address'],
    recipe:          ['Recipe'],
    roasterName:     ['Roaster name'],
    roasterCity:     ['Roaster city'],
    fileUpload:      ['File upload','File upload '],
    lat:             ['Latitude (lat)','Latitude'],
    lng:             ['Longitude (lng)','Longitude'],
    photoUrl:        ['Photo (URL)'],
    geocodeSource:   ['Geocode source'],
    geocodeAccuracy: ['Geocode accuracy'],
    matchedName:     ['Matched name'],
    countryIso2:     ['Country ISO2'],
    flagEmoji:       ['Flag emoji']
  };

function rowsToGeoJSON(rows) {
  const features = [];
  for (const row of rows) {
    const lat = toNumber(pickSmart(row, HEADERS.lat));
    const lng = toNumber(pickSmart(row, HEADERS.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const farmLng5 = +lng.toFixed(5);
    const farmLat5 = +lat.toFixed(5);

    let photo = pickSmart(row, HEADERS.photoUrl);
    if (!photo) photo = pickSmart(row, HEADERS.fileUpload);

    const processRaw  = pickSmart(row, HEADERS.process);
    const processNorm = normalizeProcessName(processRaw);

    const p = {
      timestamp:       pickSmart(row, HEADERS.timestamp),
      email:           pickSmart(row, HEADERS.email),
      uploader:        pickSmart(row, HEADERS.uploader),
      originCountry:   pickSmart(row, HEADERS.originCountry),
      originRegion:    pickSmart(row, HEADERS.originRegion),
      farmName:        pickSmart(row, HEADERS.farmName),
      process:         processRaw,
      process_norm:    processNorm,
      brewMethod:      pickSmart(row, HEADERS.brewMethod),
      whereConsumed:   pickSmart(row, HEADERS.whereConsumed),
      cafeName:        pickSmart(row, HEADERS.cafeName),
      cafeUrl:         pickSmart(row, HEADERS.cafeUrl),
      consumedCity:    pickSmart(row, HEADERS.consumedCity),
      consumedAddr:    pickSmart(row, HEADERS.consumedAddr),
      recipe:          pickSmart(row, HEADERS.recipe),
      roasterName:     pickSmart(row, HEADERS.roasterName),
      roasterCity:     pickSmart(row, HEADERS.roasterCity),
      photoUrl:        photo,
      matchedName:     pickSmart(row, HEADERS.matchedName),
      countryIso2:     pickSmart(row, HEADERS.countryIso2),
      flagEmoji:       pickSmart(row, HEADERS.flagEmoji),

      // ✅ идентификатор фермы для точного мэчинга
      farmLng5,
      farmLat5
    };

    features.push({ type:'Feature', geometry:{ type:'Point', coordinates:[lng,lat] }, properties:p });
  }
  return { type:'FeatureCollection', features };
}


  function fitToData(geojson){
    if (!geojson.features.length) return;
    const b = new mapboxgl.LngLatBounds();
    geojson.features.forEach(f => b.extend(f.geometry.coordinates));
    map.fitBounds(b, { padding: 40, duration: 700, maxZoom: 10 });
  }

  function popupHTML(p) {
    const flag = flagFromRow(p.flagEmoji, p.countryIso2);
    const country = p.originCountry ? ((flag ? flag + ' ' : '') + escapeHtml(p.originCountry)) : '';
    const region  = escapeHtml(p.originRegion || '');
    const place   = [country, region].filter(Boolean).join(', ');
    const roaster = (p.roasterName ? escapeHtml(p.roasterName) : '') +
                    (p.roasterCity ? ' (' + escapeHtml(p.roasterCity) + ')' : '');
    const photo = `<div class="popup-cover-box">${ p.photoUrl ? driveImgHtml(p.photoUrl) : '' }</div>`;

    const rows = [];
    if (p.brewMethod) rows.push(emojiRow('🧉','Method', escapeHtml(p.brewMethod)));

    if (p.whereConsumed || p.consumedCity || p.consumedAddr || p.cafeUrl) {
      const bits = [];
      if (p.whereConsumed) bits.push(escapeHtml(p.whereConsumed));
      if (p.consumedCity)  bits.push(escapeHtml(p.consumedCity));
      let whereHtml = bits.join(' — ');
      if (p.cafeUrl) whereHtml += ` <a href="${escapeAttr(p.cafeUrl)}" target="_blank" rel="noopener" title="Ссылка на заведение">🔗</a>`;
      rows.push(emojiRow('📍','Where', whereHtml));
      if (p.consumedAddr) rows.push(`<div class="row" style="margin-left:1.6em;color:#666">${escapeHtml(p.consumedAddr)}</div>`);
    }

    if (p.recipe)   rows.push(emojiRow('📋','Recipe', escapeHtml(p.recipe)));
    if (roaster)    rows.push(emojiRow('🏭','Roaster', roaster));
    if (p.uploader) rows.push(emojiRow('👤','By', escapeHtml(p.uploader)));

    const pType = p.process_norm || 'other';
    const col = processColors(pType);
    const badge = p.process
      ? `<div class="process-badge" style="background:${col.bg};border-color:${col.br};color:${col.txt}">${escapeHtml(p.process)}</div>`
      : '';

    return `
      <div class="popup-card">
        ${badge}
        ${photo}
        <div class="popup-body">
          <div class="popup-title">${escapeHtml(p.farmName || 'Без названия')}</div>
          <div class="meta">${place || '—'}</div>
          ${rows.join('')}
        </div>
      </div>
    `;

    function emojiRow(emoji, title, val){
      return `<div class="row"><span class="row-emoji" title="${escapeAttr(title)}">${emoji}</span><span>${val||''}</span></div>`;
    }
  }

  /* ==== геокодинг городов (кеш, кейсы) ==== */
  const CITY_CACHE_NS = 'coffee_city_cache_v1';
  const cityCache = JSON.parse(localStorage.getItem(CITY_CACHE_NS) || '{}');
  const cacheSave = () => localStorage.setItem(CITY_CACHE_NS, JSON.stringify(cityCache));

  async function geocodeCityName(name){
    const key = String(name||'').trim().toLowerCase();
    if (!key) return null;
    if (cityCache[key]) return cityCache[key];
    const url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
      encodeURIComponent(name) + '.json?' + new URLSearchParams({
        access_token: MAPBOX_TOKEN, types: 'place,locality', language: 'ru,en', limit: '1'
      });
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const f = (json.features||[])[0];
    if (!f || !Array.isArray(f.center)) return null;
    const [lng, lat] = f.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const pt = {lng, lat};
    cityCache[key] = pt; cacheSave();
    return pt;
  }

  async function geocodeCities(names){
    const out = {};
    for (const raw of names){
      const name = String(raw||'').trim();
      if (!name) continue;
      const pt = await geocodeCityName(name);
      if (pt){
        out[name] = pt;                                     // исходный ключ
        out[normalizeName(name).toLowerCase()] = pt;        // нормализованный ключ
      }
    }
    return out;
  }

  /* ====== Глобальный кеш координат городов для подсветки ====== */
  let CITY_COORDS = {};
  function getCityPt(name, cityMap){
    const raw = String(name||'').trim();
    if (!raw) return null;
    const norm = normalizeName(raw).toLowerCase();
    return cityMap[norm] || cityMap[raw] || cityMap[raw.toLowerCase()] || null;
  }

  /* ==== линии: свойства хранят округлённые коор-ты городов ==== */
function buildRouteFeatures(pointFeatures, cityMap){
  const lines = [];

  // Helper to push new line feature
  function addLine(kind, coordinates, extraProps){
    lines.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { kind, ...extraProps }
    });
  }

  for (const f of pointFeatures){
    const p = f.properties;

    // Берём «ид» фермы из свойств (а не из geometry кликнутой фичи)
    const farmLng5 = +p.farmLng5;
    const farmLat5 = +p.farmLat5;

    const [farmLng, farmLat] = f.geometry.coordinates;

    const rc = getCityPt(p.roasterCity,  cityMap);
    const uc = getCityPt(p.consumedCity, cityMap);

    if (rc){
      const rLng5 = +rc.lng.toFixed(5);
      const rLat5 = +rc.lat.toFixed(5);

      addLine('farm_to_roaster', [[farmLng, farmLat], [rc.lng, rc.lat]], {
        farmLng5,
        farmLat5,
        roasterLng5: rLng5,
        roasterLat5: rLat5
      });

      if (uc){
        const uLng5 = +uc.lng.toFixed(5);
        const uLat5 = +uc.lat.toFixed(5);

        addLine('roaster_to_consumed', [[rc.lng, rc.lat], [uc.lng, uc.lat]], {
          roasterLng5: rLng5,
          roasterLat5: rLat5,
          consumedLng5: uLng5,
          consumedLat5: uLat5
        });
      }
    }
  }

  return lines;
}


  /* ==== точечные «городские» фичи (обжарщики/где пил) ==== */
  const HOME_RE = /(home|дом|house|дома)/i;
  function buildCityPoints(pointFeatures, cityMap){
    const agg = new Map();
    for (const f of pointFeatures){
      const p = f.properties;

      if (p.roasterCity){
        const city = normalizeName(p.roasterCity);
        const pt = cityMap[city] || cityMap[city.toLowerCase()];
        if (pt){
          const key = city.toLowerCase();
          const o = agg.get(key) || { city, lng:pt.lng, lat:pt.lat, roasters:new Set(), places:new Set(), home:false };
          const rn = normalizeName(p.roasterName);
          if (rn) o.roasters.add(rn.toLowerCase());
          agg.set(key, o);
        }
      }
      if (p.consumedCity){
        const city = normalizeName(p.consumedCity);
        const pt = cityMap[city] || cityMap[city.toLowerCase()];
        if (pt){
          const key = city.toLowerCase();
          const o = agg.get(key) || { city, lng:pt.lng, lat:pt.lat, roasters:new Set(), places:new Set(), home:false };
          const cafe = normalizeName(p.cafeName);
          if (cafe) o.places.add(cafe.toLowerCase());
          if (p.whereConsumed && HOME_RE.test(p.whereConsumed)) o.home = true;
          agg.set(key, o);
        }
      }
    }

    const features = [];
    for (const o of agg.values()){
      const roasters = [...o.roasters].map(s => s.replace(/\b\w/g, c=>c.toUpperCase()));
      const places   = [...o.places].map(s => s.replace(/\b\w/g, c=>c.toUpperCase()));
      const kind = roasters.length && (places.length || o.home) ? 'both' : (roasters.length ? 'roaster' : 'consumed');
      const size = Math.max(roasters.length + places.length + (o.home?1:0), 1);
      features.push({
        type:'Feature',
        geometry:{ type:'Point', coordinates:[o.lng,o.lat] },
        properties:{ city:o.city, roasters, places, home:o.home, kind, size }
      });
    }
    return { type:'FeatureCollection', features };
  }

  function cityPopupHTML(props){
    const rows = [];
    if (props.roasters && props.roasters.length){
      rows.push(row('🏭', props.roasters.join(', ')));
    }
    const placeBits = [];
    if (props.places && props.places.length) placeBits.push(...props.places);
    if (props.home) placeBits.push('дом');
    if (placeBits.length){
      rows.push(row('🔻', placeBits.join(', ')));
    }
    return `
      <div class="popup-card">
        <div class="popup-body">
          <div class="popup-title">${escapeHtml(props.city)}</div>
          ${rows.join('')}
        </div>
      </div>
    `;
    function row(emoji, text){
      return `<div class="row"><span class="row-emoji">${emoji}</span><span>${escapeHtml(text)}</span></div>`;
    }
  }

  /* ==== подсветка маршрутов: матч по координатам ==== */
function highlightRouteFor(p, coord){
  if (!map.getLayer('route-highlight')) return;

  if (map.getLayoutProperty('route-highlight','visibility') !== 'visible'){
    map.setLayoutProperty('route-highlight','visibility','visible');
  }

  const filters = ['any'];

  // ✅ сначала пробуем идентификатор из свойств (из CSV)
  let farmLng5 = Number.isFinite(p.farmLng5) ? +p.farmLng5 : null;
  let farmLat5 = Number.isFinite(p.farmLat5) ? +p.farmLat5 : null;

  // fallback: если вдруг нет — округлим координату geometry клика
  if ((farmLng5===null || farmLat5===null) && Array.isArray(coord)){
    farmLng5 = +coord[0].toFixed(5);
    farmLat5 = +coord[1].toFixed(5);
  }

  const rc = getCityPt(p.roasterCity,  CITY_COORDS);
  const uc = getCityPt(p.consumedCity, CITY_COORDS);

  if (rc && farmLng5!==null && farmLat5!==null){
    const rLng5 = +rc.lng.toFixed(5), rLat5 = +rc.lat.toFixed(5);
    filters.push(['all',
      ['==',['get','kind'],'farm_to_roaster'],
      ['==',['get','farmLng5'], farmLng5],
      ['==',['get','farmLat5'], farmLat5],
      ['==',['get','roasterLng5'], rLng5],
      ['==',['get','roasterLat5'], rLat5],
    ]);
  }

  if (rc && uc){
    const rLng5 = +rc.lng.toFixed(5), rLat5 = +rc.lat.toFixed(5);
    const uLng5 = +uc.lng.toFixed(5), uLat5 = +uc.lat.toFixed(5);
    filters.push(['all',
      ['==',['get','kind'],'roaster_to_consumed'],
      ['==',['get','roasterLng5'], rLng5],
      ['==',['get','roasterLat5'], rLat5],
      ['==',['get','consumedLng5'], uLng5],
      ['==',['get','consumedLat5'], uLat5],
    ]);
  }

  map.setFilter('route-highlight', filters.length>1 ? filters : ['==',['get','kind'],'___nope___']);
}


  function clearRouteHighlight(){
    if (!map.getLayer('route-highlight')) return;
    map.setFilter('route-highlight', ['==',['get','kind'],'___nope___']);
    // если переключатель "🧵" выключен — снова прячем слой подсветки
    const t = document.querySelector('#toggleRoutes');
    if (!t || !t.checked){
      map.setLayoutProperty('route-highlight','visibility','none');
    }
  }

  /* ==== мульти-попап ==== */
  const EPS = 1e-6;
  const sameCoord = (a,b) => Math.abs(a[0]-b[0])<EPS && Math.abs(a[1]-b[1])<EPS;

  function dedupeFeatures(arr){
    const seen = new Set();
    const out = [];
    for (const f of arr){
      const c = f.geometry.coordinates;
      const key = JSON.stringify([
        +c[0].toFixed(7), +c[1].toFixed(7),
        f.properties?.timestamp || '',
        f.properties?.farmName || '',
        f.properties?.roasterName || '',
        f.properties?.uploader || '',
        f.properties?.process || '',
        f.properties?.recipe || '',
        f.properties?.photoUrl || ''
      ]);
      if (!seen.has(key)){ seen.add(key); out.push(f); }
    }
    return out;
  }

  function showMultiPopup(features, coord){
    let i = 0;
    const popup = new mapboxgl.Popup({ offset:12, maxWidth:'360px' }).setLngLat(coord);

    const render = () => {
      const f = features[i];
      const p = f.properties;
      const nav = (features.length>1)
        ? `<div class="popup-nav" style="display:flex;align-items:center;justify-content:space-between;margin:8px 14px 14px;gap:8px">
             <button type="button" data-prev style="padding:8px 12px;border:1px solid var(--glass-br);background:var(--glass);border-radius:10px;cursor:pointer;touch-action:manipulation">◀</button>
             <div class="idx" style="font:12px/1.1 system-ui;color:var(--muted)">${i+1} из ${features.length}</div>
             <button type="button" data-next style="padding:8px 12px;border:1px solid var(--glass-br);background:var(--glass);border-radius:10px;cursor:pointer;touch-action:manipulation">▶</button>
           </div>` : '';
      popup.setHTML(popupHTML(p) + nav);

      setTimeout(()=> {
        const el = popup.getElement();
        el?.querySelector('[data-prev]')?.addEventListener('click', ()=>{
          i=(i-1+features.length)%features.length; render();
        }, {passive:true});
        el?.querySelector('[data-next]')?.addEventListener('click', ()=>{
          i=(i+1)%features.length; render();
        }, {passive:true});
      }, 0);

      // подсветка строго для текущего элемента
      highlightRouteFor(p, f.geometry.coordinates);
    };

    popup.on('close', clearRouteHighlight);
    popup.addTo(map);
    render();
  }

  /* ==== страны-заливка ==== */
  const WORLDVIEW = 'US';
  function getVisitedCountriesIso2(pointFeatures){
    const set = new Set();
    for (const f of pointFeatures){
      const c = String(f.properties?.countryIso2 || '').trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(c)) set.add(c);
    }
    return set;
  }
  function buildVisitedFilter(iso2List){
    return [
      'all',
      ['==', ['get','disputed'], 'false'],
      ['any', ['==','all',['get','worldview']], ['in', WORLDVIEW, ['get','worldview']]],
      ['in', ['get','iso_3166_1'], ['literal', iso2List]]
    ];
  }
  function ensureCountriesLayers(){
    if (!map.getSource('countries')){
      map.addSource('countries', { type:'vector', url:'mapbox://mapbox.country-boundaries-v1' });
    }
    const beforeId = 'admin-1-boundary-bg';
    if (!map.getLayer('countries-visited-fill')){
      map.addLayer({
        id:'countries-visited-fill', type:'fill', source:'countries',
        'source-layer':'country_boundaries',
        paint:{ 'fill-color':'#76a96b', 'fill-opacity':0.35 }
      }, beforeId);
      map.setLayoutProperty('countries-visited-fill','visibility','none');
    }
    if (!map.getLayer('countries-visited-outline')){
      map.addLayer({
        id:'countries-visited-outline', type:'line', source:'countries',
        'source-layer':'country_boundaries',
        paint:{ 'line-color':'#567a58', 'line-width':0.8, 'line-opacity':0.85 }
      }, beforeId);
      map.setLayoutProperty('countries-visited-outline','visibility','none');
    }
  }
  function setCountriesVisibility(state){
    const vis = state ? 'visible' : 'none';
    if (map.getLayer('countries-visited-fill'))   map.setLayoutProperty('countries-visited-fill',   'visibility', vis);
    if (map.getLayer('countries-visited-outline'))map.setLayoutProperty('countries-visited-outline','visibility', vis);
  }

  /* ==== переключатели ==== */
  let visitedFilterList = [];
  let controlsRoot = null;
  let allPointFeatures = [];
  let ownerName = '';
  let initialTitle = 'My coffee experience';
  let mineTitle = 'My coffee experience';

  function buildControlsHTML(pointsCount, countriesCount){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="row">
        <span class="chip" title="Точек">☕ <span id="pointsCount">${pointsCount}</span></span>
        <span class="chip" title="Стран">🌍 <span id="countriesCount">${countriesCount}</span></span>
      </div>
      <div class="row" style="margin-top:8px">
        <label title="Показывать маршруты"><input type="checkbox" id="toggleRoutes"> 🧵</label>
        <label title="Закрашивать страны"><input type="checkbox" id="toggleVisited"> 🎨🌍</label>
        <label title="Только мои записи"><input type="checkbox" id="toggleMine"> 🙋</label>
      </div>
    `;
    return wrap;
  }
  function bindControlHandlers(rootDoc){
    const routes = rootDoc.querySelector('#toggleRoutes');
    const visited = rootDoc.querySelector('#toggleVisited');
    const mine = rootDoc.querySelector('#toggleMine');
    if (routes && !routes._bound){
      routes.addEventListener('change', (e)=> setRoutesVisibility(e.target.checked), {passive:true});
      routes._bound = true;
    }
    if (visited && !visited._bound){
      visited.addEventListener('change', (e)=> setCountriesVisibility(e.target.checked), {passive:true});
      visited._bound = true;
    }
    if (mine && !mine._bound){
      mine.addEventListener('change', (e)=> setMineFilter(e.target.checked), {passive:true});
      mine._bound = true;
    }
  }
  function updateCounts(pointsCount, countriesCount){
    const p = controlsRoot?.querySelector('#pointsCount');
    if (p) p.textContent = pointsCount;
    const c = controlsRoot?.querySelector('#countriesCount');
    if (c) c.textContent = countriesCount;
  }
  function setMineFilter(state){
    const features = state
      ? allPointFeatures.filter(f => (f.properties?.uploader||'').trim() === ownerName)
      : allPointFeatures;
    const srcBrews = map.getSource('brews');
    if (srcBrews) {
      const geo = { type:'FeatureCollection', features };
      srcBrews.setData(geo);
      const routesSrc = map.getSource('routes');
      if (routesSrc) {
        const lineFeatures = buildRouteFeatures(features, CITY_COORDS);
        routesSrc.setData({ type:'FeatureCollection', features: lineFeatures });
      }
      const citySrc = map.getSource('city-points');
      if (citySrc) {
        const cityPoints = buildCityPoints(features, CITY_COORDS);
        citySrc.setData(cityPoints);
      }
      visitedFilterList = [...getVisitedCountriesIso2(features)];
      const filt = buildVisitedFilter(visitedFilterList);
      if (map.getLayer('countries-visited-fill'))   map.setFilter('countries-visited-fill', filt);
      if (map.getLayer('countries-visited-outline'))map.setFilter('countries-visited-outline', filt);
      updateCounts(features.length, visitedFilterList.length);
    }
    const titleEl = document.getElementById('collectionTitle');
    if (titleEl) titleEl.textContent = state ? mineTitle : initialTitle;
  }
  function isMobile(){ return window.matchMedia('(max-width: 680px)').matches; }
  function placeControls(){
    const desktop = document.getElementById('desktopControls');
    const mobile = document.getElementById('mobileControls');
    if (!controlsRoot) return;
    if (isMobile()){
      if (controlsRoot.parentElement !== mobile){
        mobile.innerHTML = ''; mobile.appendChild(controlsRoot);
      }
    } else {
      if (controlsRoot.parentElement !== desktop){
        desktop.innerHTML = ''; desktop.appendChild(controlsRoot);
      }
    }
    bindControlHandlers(controlsRoot);
  }
  function debounce(fn, ms=150){ let t=0; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
  window.addEventListener('resize', debounce(() => {
    placeControls();
    map.resize();
  }, 150));

  function setRoutesVisibility(state){
    const vis = state ? 'visible' : 'none';
    ['route-farm-roaster','route-roaster-consumed','route-highlight'].forEach(id=>{
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
    if (!state) clearRouteHighlight();
  }

  /* ==== ачивки ==== */
  const ACHIEVEMENTS = [
    { id:'first_sip',   emoji:'☕️', title:'Первый глоток', color:{ bg:'#d1fae5', br:'#99f6e4', txt:'#065f46' }, earned:(m)=> m.total>=1 },
    { id:'countries_3', emoji:'🌍', title:'Страны ×3',     color:{ bg:'#fef3c7', br:'#fde68a', txt:'#92400e' }, earned:(m)=> m.countries>=3 },
    { id:'processes_3', emoji:'🧪', title:'Процессы ×3',   color:{ bg:'#ede9fe', br:'#ddd6fe', txt:'#4c1d95' }, earned:(m)=> m.processTypes>=3 }
  ];
  function computeMetrics(pointFeatures){
    const countriesSet = getVisitedCountriesIso2(pointFeatures);
    const proc = new Set();
    for (const f of pointFeatures){
      const t = (f.properties?.process_norm)||'';
      if (t && t !== 'other') proc.add(t);
    }
    return { total: pointFeatures.length, countries: countriesSet.size, processTypes: proc.size };
  }
  function renderAchievements(metrics){
    const earned = ACHIEVEMENTS.filter(a => a.earned(metrics));
    const el = document.getElementById('achievements');
    el.innerHTML = earned.map(a =>
      `<div class="ach-badge" style="background:${a.color.bg};border-color:${a.color.br};color:${a.color.txt}" title="${escapeAttr(a.title)}">
         <span class="ach-emoji">${a.emoji}</span><span class="ach-title">${a.title}</span>
       </div>`
    ).join('');
  }

  /* ==== загрузка CSV и добавление слоёв ==== */
  Papa.parse(CSV_URL, {
    download: true, header: true, dynamicTyping: false,
    complete: async (results) => {
      const geojsonPoints = rowsToGeoJSON(results.data || []);
      const pointFeatures = geojsonPoints.features;
      allPointFeatures = pointFeatures;

      // uploader в шапку
      const uploaders = [...new Set(pointFeatures.map(f => (f.properties?.uploader||'').trim()).filter(Boolean))];
      ownerName = uploaders[0] || '';
      const owner = uploaders[0] ? (uploaders.length>1 ? `${uploaders[0]} +${uploaders.length-1}` : uploaders[0]) : '';
      initialTitle = owner ? `My coffee experience — ${owner}` : 'My coffee experience';
      mineTitle = ownerName ? `My coffee experience — ${ownerName}` : 'My coffee experience';
      document.getElementById('collectionTitle').textContent = initialTitle;

      // города
      const want = new Set();
      for (const f of pointFeatures){
        const p = f.properties;
        if (p.roasterCity)  want.add(String(p.roasterCity).trim());
        if (p.consumedCity) want.add(String(p.consumedCity).trim());
      }
      const uniqueCities = [...want].filter(Boolean);
      const cityCoordsMap = await geocodeCities(uniqueCities);

      /* сохраняем глобально для подсветки */
      CITY_COORDS = cityCoordsMap;

      const lineFeatures = buildRouteFeatures(pointFeatures, cityCoordsMap);
      const cityPoints = buildCityPoints(pointFeatures, cityCoordsMap);

      // страны
      visitedFilterList = [...getVisitedCountriesIso2(pointFeatures)];

      // панель
      controlsRoot = buildControlsHTML(pointFeatures.length, visitedFilterList.length);
      placeControls();
      const mineToggle = controlsRoot.querySelector('#toggleMine');
      if (mineToggle && mineToggle.checked) setMineFilter(true);

      // ачивки
      renderAchievements(computeMetrics(pointFeatures));

      function addLayers(){
        if (!map.getSource('brews')) {
          map.addSource('brews', { type:'geojson', data:geojsonPoints, cluster:true, clusterMaxZoom:14, clusterRadius:50 });
        } else {
          map.getSource('brews').setData(geojsonPoints);
        }
        if (!map.getSource('routes')) {
          map.addSource('routes', { type:'geojson', data:{ type:'FeatureCollection', features: lineFeatures } });
        } else {
          map.getSource('routes').setData({ type:'FeatureCollection', features: lineFeatures });
        }
        if (!map.getSource('city-points')) {
          map.addSource('city-points', { type:'geojson', data: cityPoints });
        } else {
          map.getSource('city-points').setData(cityPoints);
        }

        ensureCountriesLayers();
        const filt = buildVisitedFilter(visitedFilterList);
        map.setFilter('countries-visited-fill', filt);
        map.setFilter('countries-visited-outline', filt);
        setCountriesVisibility(false);

        if (!map.getLayer('route-farm-roaster')){
          map.addLayer({ id:'route-farm-roaster', type:'line', source:'routes',
            filter:['==',['get','kind'],'farm_to_roaster'],
            paint:{ 'line-color':'#006d2c', 'line-width':2, 'line-opacity':0.6 } });
        }
        if (!map.getLayer('route-roaster-consumed')){
          map.addLayer({ id:'route-roaster-consumed', type:'line', source:'routes',
            filter:['==',['get','kind'],'roaster_to_consumed'],
            paint:{ 'line-color':'#08519c', 'line-width':2, 'line-opacity':0.6, 'line-dasharray':[2,2] } });
        }
        if (!map.getLayer('route-highlight')){
          map.addLayer({ id:'route-highlight', type:'line', source:'routes',
            filter:['==', ['get','kind'], '___nope___'],
            paint:{ 'line-color':'#ff7f00', 'line-width':5, 'line-opacity':0.9 } });
        }
        setRoutesVisibility(false);

        if (!map.getLayer('clusters')){
          map.addLayer({
            id:'clusters', type:'circle', source:'brews', filter:['has','point_count'],
            paint:{
              'circle-color': ['step',['get','point_count'],'#9ecae1',10,'#6baed6',30,'#3182bd'],
              'circle-radius': ['step',['get','point_count'],16,10,20,30,26]
            }
          });
          map.addLayer({
            id:'cluster-count', type:'symbol', source:'brews', filter:['has','point_count'],
            layout:{ 'text-field': ['get','point_count_abbreviated'], 'text-size':12 },
            paint:{ 'text-color':'#08306b' }
          });
          map.addLayer({
            id:'unclustered', type:'circle', source:'brews', filter:['!', ['has','point_count']],
            paint:{
              'circle-color': [
                'match', ['get','process_norm'],
                'washed',      '#2e7d32',
                'natural',     '#c0392b',
                'honey',       '#c77f0a',
                'anaerobic',   '#6a3cbc',
                'experimental','#2c5aa0',
                /* other */    '#777777'
              ],
              'circle-radius':6,
              'circle-stroke-width':1,
              'circle-stroke-color':'#fff'
            }
          });

          map.on('click','clusters',(e)=>{
            const f = map.queryRenderedFeatures(e.point,{layers:['clusters']})[0];
            map.getSource('brews').getClusterExpansionZoom(f.properties.cluster_id,(err,zoom)=>{
              if (!err) map.easeTo({center:f.geometry.coordinates, zoom});
            });
          });

          map.on('click','unclustered',(e)=>{
            const clicked = e.features[0];
            const coord = clicked.geometry.coordinates;
            const buf = 6;
            const box = [[e.point.x-buf, e.point.y-buf],[e.point.x+buf, e.point.y+buf]];
            const inBox = map.queryRenderedFeatures(box, { layers:['unclustered'] });
            const nearSame = inBox.filter(f => sameCoord(f.geometry.coordinates, coord));
            const features = dedupeFeatures(nearSame.length ? nearSame : [clicked]);
            showMultiPopup(features, coord);
          });

          map.on('click', (e) => {
            const feats = map.queryRenderedFeatures(e.point, {layers:['unclustered','clusters']});
            if (!feats.length) clearRouteHighlight();
          });

          map.on('mouseenter','clusters',()=>map.getCanvas().style.cursor='pointer');
          map.on('mouseleave','clusters',()=>map.getCanvas().style.cursor='');
          map.on('mouseenter','unclustered',()=>map.getCanvas().style.cursor='pointer');
          map.on('mouseleave','unclustered',()=>map.getCanvas().style.cursor='');
        }

        if (!map.getLayer('city-points')){
          map.addLayer({
            id:'city-points',
            type:'circle',
            source:'city-points',
            paint:{
              'circle-color': [
                'match', ['get','kind'],
                'both',     '#8e44ad',
                'roaster',  '#006d2c',
                'consumed', '#08519c',
                '#666666'
              ],
              'circle-opacity':0.75,
              'circle-stroke-color':'#ffffff',
              'circle-stroke-width':1.2,
              'circle-radius':['interpolate',['linear'],['get','size'],1,6,3,8,6,11,10,14]
            }
          });
          map.on('click','city-points',(e)=>{
            const f = e.features[0];
            new mapboxgl.Popup({offset:10})
              .setLngLat(f.geometry.coordinates)
              .setHTML(cityPopupHTML(f.properties))
              .addTo(map);
          });
          map.on('mouseenter','city-points',()=>map.getCanvas().style.cursor='pointer');
          map.on('mouseleave','city-points',()=>map.getCanvas().style.cursor='');
        }

        fitToData(geojsonPoints);
      }

      if (map.isStyleLoaded && map.isStyleLoaded()) addLayers();
      else map.on('load', addLayers);
    },
    error: (err) => {
      const b = document.getElementById('badge');
      b.innerHTML = '<div style="padding:10px 12px">Ошибка загрузки CSV</div>';
      console.error('CSV error:', err);
    }
  });
