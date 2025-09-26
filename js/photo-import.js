const OCR_LANGUAGES = 'eng+rus';
const FIELD_KEYS = ['coffeeName', 'roasterName', 'country', 'region', 'farm', 'process', 'brewMethod', 'notes'];

const FIELD_LABELS = {
  coffeeName: 'Название кофе',
  roasterName: 'Ростер',
  country: 'Страна',
  region: 'Регион',
  farm: 'Ферма / кооператив',
  process: 'Обработка',
  brewMethod: 'Метод заваривания',
  notes: 'Заметки',
};

const PROCESS_HINTS = ['natural', 'washed', 'honey', 'anaerobic', 'carbonic', 'experimental'];

const BREW_METHOD_PATTERNS = [
  /(espresso|эспрессо)/i,
  /(v60|kalita|chemex|пуровер|pour\s*over|filter)/i,
  /(aeropress|аэропресс)/i,
  /(french\s*press|френч\s*пресс)/i,
  /(turk|турк|джезв|ibrik|cezve)/i,
  /(moka|мока|гейзер)/i,
  /(cold\s*brew|колд\s*брю)/i,
  /(batch\s*brew|batchbrew|брювер)/i,
  /(capsule|капсул)/i,
];

const COUNTRY_MATCHERS = [
  { name: 'Brazil', pattern: /(brazil|бразил)/i },
  { name: 'Colombia', pattern: /(colomb|колумб)/i },
  { name: 'Costa Rica', pattern: /(costa\s*rica|коста\s*рика)/i },
  { name: 'El Salvador', pattern: /(el\s*salvador|сальвадор)/i },
  { name: 'Ethiopia', pattern: /(ethiop|эфиоп)/i },
  { name: 'Guatemala', pattern: /(guatemal|гватемал)/i },
  { name: 'Honduras', pattern: /(hondur|гондурас)/i },
  { name: 'Kenya', pattern: /(kenya|кени[яи])/i },
  { name: 'Nicaragua', pattern: /(nicaragua|никараг)/i },
  { name: 'Panama', pattern: /(panama|панам)/i },
  { name: 'Peru', pattern: /(peru|перу)/i },
  { name: 'Rwanda', pattern: /(rwanda|руанд)/i },
  { name: 'Tanzania', pattern: /(tanzan|танзани)/i },
  { name: 'Uganda', pattern: /(uganda|уганда)/i },
  { name: 'Burundi', pattern: /(burundi|бурунд)/i },
  { name: 'Mexico', pattern: /(mexic|мексик)/i },
  { name: 'Yemen', pattern: /(yemen|йемен)/i },
  { name: 'Indonesia', pattern: /(indones|индонез)/i },
  { name: 'Sumatra', pattern: /(sumatr|суматр)/i },
  { name: 'Papua New Guinea', pattern: /(papua|папуа|png)/i },
  { name: 'China', pattern: /(china|китай)/i },
  { name: 'India', pattern: /(india|индия)/i },
  { name: 'Vietnam', pattern: /(vietnam|вьетнам)/i },
  { name: 'Thailand', pattern: /(thailand|таиланд)/i },
  { name: 'Laos', pattern: /(laos|лаос)/i },
  { name: 'Myanmar', pattern: /(myanmar|бирма|мьянма)/i },
  { name: 'Dominican Republic', pattern: /(dominican|доминикан)/i },
  { name: 'Jamaica', pattern: /(jamaic|ямайк)/i },
  { name: 'Cuba', pattern: /(cuba|куба)/i },
  { name: 'Haiti', pattern: /(haiti|гаити)/i },
  { name: 'Ecuador', pattern: /(ecuador|эквадор)/i },
  { name: 'Bolivia', pattern: /(bolivi|боливи)/i },
  { name: 'Guinea', pattern: /(guinea|гвиней)/i },
  { name: 'Cameroon', pattern: /(cameroon|камерун)/i },
  { name: 'Democratic Republic of the Congo', pattern: /(congo|конго|rdc|drc)/i },
  { name: 'Zambia', pattern: /(zambi|замби)/i },
  { name: 'Zimbabwe', pattern: /(zimbabw|зимбаб)/i },
  { name: 'Malawi', pattern: /(malawi|малави)/i },
  { name: 'Timor-Leste', pattern: /(timor|тимор)/i },
  { name: 'Taiwan', pattern: /(taiwan|тайван)/i },
  { name: 'Philippines', pattern: /(philippin|филиппин)/i },
];

const REGION_KEYWORDS = /(region|регион|province|провинц|county|округ|area|зона|district|дистрикт|state|штат|терруар|terroir|valley|долин)/i;
const FARM_KEYWORDS = /(farm|estate|mill|station|washing|producer|cooperativ|coop|кооперат|ферм|станц|милл|хасиенд|finca|beneficio)/i;
const VARIETY_KEYWORDS = /(sl\s*-?\d+|bourbon|бурбон|caturra|катур|typica|типик|heirloom|gesha|geisha|гейш|кастильо|catuai|катуаи|pacas|pacamara|maragogype|марагоджип|рубика|ruiru|batian|руиру|руиру\s*11|кофе\s*арабика)/i;

function hasLabelStructure(line) {
  return /^\s*[^:–—-]{1,60}\s*[:–—-]/.test(line || '');
}

function detectCountryName(text) {
  if (!text) return '';
  const value = String(text);
  for (const { name, pattern } of COUNTRY_MATCHERS) {
    if (pattern.test(value)) return name;
  }
  return '';
}

function isProcessDescriptor(text) {
  return Boolean(detectProcessFromLine(text));
}

function splitOriginValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return { country: '', region: '', farm: '' };

  const separators = /[,;\/\u2022]|\s+-\s+/;
  const tokens = normalized
    .split(separators)
    .map((token) => normalizeText(token))
    .filter(Boolean);

  let country = detectCountryName(normalized);
  const filtered = [];

  tokens.forEach((token) => {
    const tokenCountry = detectCountryName(token);
    if (!country && tokenCountry) {
      country = tokenCountry;
      return;
    }
    if (country && tokenCountry && tokenCountry === country) {
      return;
    }
    filtered.push(token);
  });

  let region = '';
  let farm = '';

  filtered.forEach((token) => {
    if (!region && REGION_KEYWORDS.test(token)) {
      const cleaned = normalizeText(token.replace(REGION_KEYWORDS, '').replace(/^[:\-\s]+/, ''));
      region = cleaned || token;
    }
  });

  if (!region && filtered.length) {
    const candidate = filtered.find((token) => !isProcessDescriptor(token) && !FARM_KEYWORDS.test(token) && !VARIETY_KEYWORDS.test(token));
    if (candidate) region = candidate;
  }

  filtered.forEach((token) => {
    if (!farm && FARM_KEYWORDS.test(token)) {
      const cleaned = normalizeText(token.replace(FARM_KEYWORDS, '').replace(/^[:\-\s]+/, ''));
      farm = cleaned || token;
    }
  });

  if (!farm && filtered.length > 1) {
    const candidate = filtered.find(
      (token) => token !== region && !isProcessDescriptor(token) && !VARIETY_KEYWORDS.test(token),
    );
    if (candidate) farm = candidate;
  }

  if (region && country && region.toLowerCase() === country.toLowerCase()) {
    region = '';
  }

  if (farm && region && farm.toLowerCase() === region.toLowerCase()) {
    farm = '';
  }

  if (farm && country && detectCountryName(farm) === country) {
    farm = '';
  }

  return { country, region, farm };
}

function $(selector) {
  return document.querySelector(selector);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function enhanceImageData(imageData) {
  const { data } = imageData;
  const contrast = 1.25;
  const brightness = 10;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = (gray - 128) * contrast + 128 + brightness;
    if (gray < 0) gray = 0;
    if (gray > 255) gray = 255;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  return imageData;
}

async function prepareImageForOcr(file) {
  const image = await loadImageFromFile(file);
  const maxDimension = 1600;
  const minDimension = 900;
  const largestSide = Math.max(image.width, image.height) || 1;
  let scale = 1;
  if (largestSide > maxDimension) {
    scale = maxDimension / largestSide;
  } else if (largestSide < minDimension) {
    scale = Math.min(2, minDimension / largestSide);
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context not available');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const enhanced = enhanceImageData(imageData);
    ctx.putImageData(enhanced, 0, 0);
  } catch (err) {
    console.warn('Image enhancement skipped:', err);
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Canvas toBlob returned null'));
      }
    }, 'image/png');
  });

  return blob;
}

function byField(field, root) {
  return root.querySelector(
    `input[data-field="${field}"], textarea[data-field="${field}"], select[data-field="${field}"]`,
  );
}

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeOcrOutput(rawText) {
  if (!rawText) return '';
  let text = String(rawText)
    .replace(/\r\n?/g, '\n')
    .replace(/([:;])\s*\n\s*/g, '$1 ');

  const replacements = [
    { pattern: /[‘’´`]/g, replacement: "'" },
    { pattern: /[“”«»]/g, replacement: '"' },
    { pattern: /[–—]/g, replacement: '-' },
    { pattern: /[і]/g, replacement: 'и' },
    { pattern: /[ї]/g, replacement: 'и' },
    { pattern: /[є]/g, replacement: 'е' },
    { pattern: /[ґ]/g, replacement: 'г' },
    { pattern: /[ӏ]/g, replacement: 'л' },
  ];

  replacements.forEach(({ pattern, replacement }) => {
    text = text.replace(pattern, replacement);
  });

  text = text
    .replace(/(^|[^0-9a-zа-яё])3([а-яё])/giu, (_, prefix, letter) => `${prefix}з${letter}`)
    .replace(/([а-яё])3([^а-яё]|$)/giu, (_, letter, suffix) => `${letter}з${suffix}`)
    .replace(/([а-яё])[0o]([а-яё])/giu, (_, left, right) => `${left}о${right}`)
    .replace(/([а-яё])1([а-яё])/giu, (_, left, right) => `${left}л${right}`)
    .replace(/\s{2,}/g, ' ');

  return text.trim();
}

function detectProcessFromLine(line) {
  const lowered = line.toLowerCase();
  if (/(honey|red honey|yellow honey|white honey|black honey|медов)/.test(lowered)) return 'Honey';
  if (/(anaer|carbonic|мц|фермент|који|koji|wine|macera)/.test(lowered)) return 'Anaerobic';
  if (/(wash|fully washed|мыта|мытый|вымыт|wet)/.test(lowered)) return 'Washed';
  if (/(natur|dry|natural|натурал|сух)/.test(lowered)) return 'Natural';
  if (/(experimental|ferment|double|triple|enzym)/.test(lowered)) return 'Experimental';
  return '';
}

function detectBrewMethodFromLine(line) {
  if (!line) return '';
  for (const pattern of BREW_METHOD_PATTERNS) {
    const match = line.match(pattern);
    if (match?.[0]) {
      return normalizeText(match[0]);
    }
  }
  return '';
}

function cleanKeywordValue(value, pattern) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  const cleaned = normalizeText(normalized.replace(pattern, '').replace(/^[:\-\s]+/, ''));
  return cleaned || normalized;
}

function createLineEntries(lines) {
  const continuationParents = new Map();
  const entries = lines.map((raw, index) => {
    const normalized = normalizeText(raw);
    const match = raw.match(/^\s*([^:–—-]+?)\s*[:–—-]\s*(.*)$/);
    let label = '';
    let value = normalized;
    let valueIndex = index;
    if (match) {
      label = normalizeText(match[1]);
      value = normalizeText(match[2]);
      if (!value) {
        const nextRaw = lines[index + 1];
        if (nextRaw) {
          const nextNormalized = normalizeText(nextRaw);
          if (nextNormalized && !hasLabelStructure(nextRaw)) {
            value = nextNormalized;
            valueIndex = index + 1;
            continuationParents.set(index + 1, index);
          }
        }
      }
    }

    const originFromValue = splitOriginValue(value);
    const originFromNormalized = splitOriginValue(normalized);
    const process = detectProcessFromLine(normalized);
    const brew = detectBrewMethodFromLine(normalized);

    return {
      index,
      raw,
      normalized,
      label,
      lowerLabel: label.toLowerCase(),
      value,
      valueIndex,
      originFromValue,
      originFromNormalized,
      process,
      brew,
      hasProcessKeyword: /(process|обработ|method|метод)/.test(label.toLowerCase()),
      hasBrewKeyword: /(brew|завар|способ|method)/.test(label.toLowerCase()),
      hasNotesKeyword: /(notes|вкус|flavor|tasting|profile)/.test(label.toLowerCase()),
      hasRoasterKeyword: /(roaster|roastery|обжар|rost|ростер)/.test(label.toLowerCase()),
      hasCoffeeKeyword: /(coffee|название|lot|blend|кофе|сорт)/.test(label.toLowerCase()),
      relatedIndices: valueIndex !== index ? [index, valueIndex] : [index],
      isContinuation: false,
    };
  });

  return entries.map((entry) => ({
    ...entry,
    isContinuation: continuationParents.has(entry.index),
  }));
}

function combineOriginFromEntry(entry) {
  return {
    country: entry.originFromValue.country || entry.originFromNormalized.country,
    region: entry.originFromValue.region || entry.originFromNormalized.region,
    farm: entry.originFromValue.farm || entry.originFromNormalized.farm,
  };
}

function markUsedLines(usedLines, entry) {
  if (!entry) return;
  entry.relatedIndices.forEach((idx) => {
    if (typeof idx === 'number') usedLines.add(idx);
  });
}

function findBestOriginField(entries, field, extracted) {
  let best = null;
  entries.forEach((entry) => {
    if (entry.isContinuation) return;
    const combined = combineOriginFromEntry(entry);
    let candidate = combined[field];
    if (!candidate && field === 'country') {
      candidate = detectCountryName(entry.value) || detectCountryName(entry.normalized);
    }
    if (!candidate && field === 'region') {
      if (REGION_KEYWORDS.test(entry.label) || REGION_KEYWORDS.test(entry.value)) {
        candidate = cleanKeywordValue(entry.value, REGION_KEYWORDS);
      }
    }
    if (!candidate && field === 'farm') {
      if (FARM_KEYWORDS.test(entry.label) || FARM_KEYWORDS.test(entry.value)) {
        candidate = cleanKeywordValue(entry.value, FARM_KEYWORDS);
      }
    }
    if (!candidate) return;

    if (field === 'region' && extracted.country && candidate.toLowerCase() === extracted.country.toLowerCase()) {
      return;
    }
    if (field === 'farm') {
      if (extracted.region && candidate.toLowerCase() === extracted.region.toLowerCase()) return;
      if (extracted.country && detectCountryName(candidate) === extracted.country) return;
      if (VARIETY_KEYWORDS.test(candidate)) return;
    }

    let score = 0;
    if (field === 'country' && /(origin|country|страна)/.test(entry.lowerLabel)) score += 4;
    if (field === 'region' && REGION_KEYWORDS.test(entry.label)) score += 3;
    if (field === 'farm' && FARM_KEYWORDS.test(entry.label)) score += 3;
    if (combined[field]) score += 2;
    if (entry.index <= 2) score += 1;

    if (!best || score > best.score) {
      best = { value: candidate, entry, score };
    }
  });

  return best;
}

function applyOriginAnalysis(entries, extracted, usedLines) {
  const originCandidates = entries
    .map((entry) => {
      if (entry.isContinuation) return null;
      const combined = combineOriginFromEntry(entry);
      if (!combined.country && !combined.region && !combined.farm) return null;
      let score = 0;
      if (/(origin|country|страна)/.test(entry.lowerLabel)) score += 5;
      if (REGION_KEYWORDS.test(entry.label)) score += 3;
      if (FARM_KEYWORDS.test(entry.label)) score += 3;
      if (combined.country) score += 3;
      if (combined.region) score += 2;
      if (combined.farm) score += 2;
      if (/,|;|\//.test(entry.value)) score += 1;
      score += Math.max(0, 3 - entry.index) * 0.5;
      return { entry, combined, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  originCandidates.forEach(({ entry, combined }) => {
    let updated = false;
    if (!extracted.country && combined.country) {
      extracted.country = combined.country;
      updated = true;
    }
    if (!extracted.region && combined.region) {
      if (!extracted.country || combined.region.toLowerCase() !== extracted.country.toLowerCase()) {
        extracted.region = combined.region;
        updated = true;
      }
    }
    if (!extracted.farm && combined.farm) {
      const normalizedFarm = combined.farm;
      const sameAsRegion = extracted.region && normalizedFarm.toLowerCase() === extracted.region.toLowerCase();
      const sameAsCountry = extracted.country && detectCountryName(normalizedFarm) === extracted.country;
      if (!sameAsRegion && !sameAsCountry && !VARIETY_KEYWORDS.test(normalizedFarm)) {
        extracted.farm = normalizedFarm;
        updated = true;
      }
    }
    if (updated) {
      markUsedLines(usedLines, entry);
    }
  });

  if (!extracted.country) {
    const bestCountry = findBestOriginField(entries, 'country', extracted);
    if (bestCountry) {
      extracted.country = bestCountry.value;
      markUsedLines(usedLines, bestCountry.entry);
    }
  }

  if (!extracted.region) {
    const bestRegion = findBestOriginField(entries, 'region', extracted);
    if (bestRegion) {
      extracted.region = bestRegion.value;
      markUsedLines(usedLines, bestRegion.entry);
    }
  }

  if (!extracted.farm) {
    const bestFarm = findBestOriginField(entries, 'farm', extracted);
    if (bestFarm) {
      extracted.farm = bestFarm.value;
      markUsedLines(usedLines, bestFarm.entry);
    }
  }
}

function parseFieldsFromText(rawText) {
  const normalized = normalizeOcrOutput(rawText);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u2014\u2013]/g, '-').trim())
    .filter(Boolean);

  const entries = createLineEntries(lines);

  const extracted = {
    coffeeName: '',
    roasterName: '',
    country: '',
    region: '',
    farm: '',
    process: '',
    brewMethod: '',
    notes: '',
  };

  const usedLines = new Set();

  entries.forEach((entry) => {
    if (entry.isContinuation) return;
    const { value, label, lowerLabel } = entry;
    if (!value) return;

    if (/(origin|страна|country)/.test(lowerLabel)) {
      const combined = combineOriginFromEntry(entry);
      if (combined.country && !extracted.country) extracted.country = combined.country;
      if (combined.region && !extracted.region) extracted.region = combined.region;
      if (combined.farm && !extracted.farm) extracted.farm = combined.farm;
      if (!combined.country && !combined.region && !combined.farm && !extracted.country) {
        const detectedCountry = detectCountryName(value) || detectCountryName(entry.normalized);
        if (detectedCountry) extracted.country = detectedCountry;
      }
      markUsedLines(usedLines, entry);
      return;
    }

    if (!extracted.region && label && REGION_KEYWORDS.test(label)) {
      const regionValue = cleanKeywordValue(value, REGION_KEYWORDS);
      if (regionValue) {
        extracted.region = regionValue;
        markUsedLines(usedLines, entry);
        return;
      }
    }

    if (!extracted.farm && label && FARM_KEYWORDS.test(label)) {
      const farmValue = cleanKeywordValue(value, FARM_KEYWORDS);
      if (farmValue && !VARIETY_KEYWORDS.test(farmValue)) {
        extracted.farm = farmValue;
        markUsedLines(usedLines, entry);
        return;
      }
    }

    if (!extracted.roasterName && entry.hasRoasterKeyword) {
      extracted.roasterName = value;
      markUsedLines(usedLines, entry);
      return;
    }

    if (!extracted.process && entry.hasProcessKeyword) {
      extracted.process = entry.process || value;
      markUsedLines(usedLines, entry);
      return;
    }

    if (!extracted.brewMethod && entry.hasBrewKeyword) {
      extracted.brewMethod = entry.brew || value;
      markUsedLines(usedLines, entry);
      return;
    }

    if (!extracted.notes && entry.hasNotesKeyword) {

      extracted.notes = value;
      markUsedLines(usedLines, entry);
      return;
    }

    if (!extracted.coffeeName && entry.hasCoffeeKeyword) {
      extracted.coffeeName = value;
      markUsedLines(usedLines, entry);
    }
  });

  applyOriginAnalysis(entries, extracted, usedLines);

  if (!extracted.process) {
    const processEntry = entries.find((entry) => !entry.isContinuation && entry.process);
    if (processEntry) {
      extracted.process = processEntry.process;
      markUsedLines(usedLines, processEntry);
    }
  }

  if (!extracted.brewMethod) {
    const brewEntry = entries.find((entry) => !entry.isContinuation && entry.brew);
    if (brewEntry) {
      extracted.brewMethod = brewEntry.hasBrewKeyword ? brewEntry.value : brewEntry.brew;
      markUsedLines(usedLines, brewEntry);
    }
  }

  if (extracted.region && extracted.country && extracted.region.toLowerCase() === extracted.country.toLowerCase()) {
    extracted.region = '';
  }

  if (extracted.farm && extracted.region && extracted.farm.toLowerCase() === extracted.region.toLowerCase()) {
    extracted.farm = '';
  }

  if (extracted.farm && extracted.country && detectCountryName(extracted.farm) === extracted.country) {
    extracted.farm = '';
  }

  if (!extracted.notes) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (usedLines.has(i)) continue;
      const candidate = normalizeText(lines[i]);
      if (candidate) {
        extracted.notes = candidate;
        usedLines.add(i);
        break;
      }
    }
  }

  if (!extracted.coffeeName) {
    for (let i = 0; i < lines.length; i += 1) {
      if (usedLines.has(i)) continue;
      const candidate = normalizeText(lines[i]);
      if (candidate) {
        extracted.coffeeName = candidate;
        usedLines.add(i);
        break;
      }
    }
  }

  if (!extracted.roasterName) {
    const roasterEntry = entries.find((entry) => !entry.isContinuation && entry.hasRoasterKeyword && entry.value);
    if (roasterEntry) {
      extracted.roasterName = roasterEntry.value;
      markUsedLines(usedLines, roasterEntry);
    }
  }

  if (!extracted.roasterName) {
    for (let i = 0; i < lines.length; i += 1) {
      if (usedLines.has(i)) continue;
      const candidate = normalizeText(lines[i]);
      if (candidate) {
        extracted.roasterName = candidate;
        usedLines.add(i);
        break;
      }
    }
  }

  return extracted;
}

let tesseractModulePromise = null;

async function loadTesseract() {
  if (!tesseractModulePromise) {
    tesseractModulePromise = import('https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.esm.min.js');
  }
  const module = await tesseractModulePromise;
  return module?.default || module;
}

async function recognizeFile(file, onProgress) {
  if (!file) throw new Error('Файл не выбран');
  const Tesseract = await loadTesseract();
  if (!Tesseract?.recognize) {
    throw new Error('Tesseract.js не удалось загрузить');
  }
  let imageSource = file;
  try {
    imageSource = await prepareImageForOcr(file);
  } catch (prepErr) {
    console.warn('Image preprocessing failed, using original file:', prepErr);
    imageSource = file;
  }
  const result = await Tesseract.recognize(imageSource, OCR_LANGUAGES, {
    logger: (payload) => {
      if (payload.status === 'recognizing text' && typeof onProgress === 'function') {
        const progress = payload.progress ? Math.round(payload.progress * 100) : 0;
        onProgress(Math.min(progress, 100));
      }
    },
  });
  return result.data?.text || '';
}

function fillForm(formEl, values) {
  FIELD_KEYS.forEach((field) => {
    const input = byField(field, formEl);
    if (input) input.value = values[field] || '';
  });
}

function collectForm(formEl) {
  const data = {};
  FIELD_KEYS.forEach((field) => {
    const input = byField(field, formEl);
    data[field] = normalizeText(input?.value || '');
  });
  return data;
}

function buildPrefillUrl(data, config) {
  if (!config?.enabled || !config.prefillBaseUrl) return '';
  const params = new URLSearchParams(config.extraParams || {});
  for (const [field, entryId] of Object.entries(config.entryMap || {})) {
    if (!entryId) continue;
    let value = '';
    if (field === 'rawText') {
      value = data.rawText || '';
    } else {
      value = data[field] || '';
    }
    if (value) params.append(entryId, value);
  }
  if (!params.toString()) return config.prefillBaseUrl;
  return `${config.prefillBaseUrl}?${params.toString()}`;
}

function setStatus(statusEl, message, tone = 'neutral') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function setButtonsState(buttons, state) {
  buttons.forEach((btn) => {
    if (!btn) return;
    btn.disabled = !state;
  });
}

function formatClipboardData(data) {
  const parts = [];
  FIELD_KEYS.forEach((field) => {
    const label = FIELD_LABELS[field];
    const value = data[field];
    if (value) {
      parts.push(`${label}: ${value}`);
    }
  });
  if (data.rawText) {
    parts.push('', 'Распознанный текст:', data.rawText);
  }
  return parts.join('\n');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    try {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.setAttribute('readonly', '');
      temp.style.position = 'absolute';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      return true;
    } catch (copyErr) {
      console.error('Clipboard copy failed:', copyErr);
      return false;
    }
  }
}

export function initPhotoImport({ googleFormConfig } = {}) {
  const card = $('#photoUploadCard');
  const input = $('#photoUploadInput');
  const statusEl = $('#photoOcrStatus');
  const textEl = $('#photoOcrText');
  const summaryEl = $('#photoOcrSummary');
  const formEl = $('#photoDetailsForm');
  const processHintEl = $('#photoProcessHint');
  const copyBtn = $('#photoCopyData');
  const sendBtn = $('#photoSendToDocs');
  const hintEl = $('#photoDocsHint');

  if (!card || !input || !statusEl || !textEl || !formEl) return;

  let currentText = '';
  let isProcessing = false;
  let showFieldStatus = false;

  const fieldWrappers = {};
  const fieldStatusEls = {};
  const fieldStates = {};
  const recognizedValues = {};

  FIELD_KEYS.forEach((field) => {
    const fieldInput = formEl.querySelector(`[data-field="${field}"]`);
    const wrapper = fieldInput?.closest('.photo-field');
    if (wrapper) {
      fieldWrappers[field] = wrapper;
      fieldStatusEls[field] = wrapper.querySelector('.photo-field__status');
    }
    fieldStates[field] = 'empty';
    recognizedValues[field] = '';
  });

  function resetFieldTracking() {
    FIELD_KEYS.forEach((field) => {
      fieldStates[field] = 'empty';
      recognizedValues[field] = '';
    });
  }

  function applyFieldStates() {
    FIELD_KEYS.forEach((field) => {
      const wrapper = fieldWrappers[field];
      const statusNode = fieldStatusEls[field];
      if (wrapper) {
        if (showFieldStatus) {
          wrapper.dataset.state = fieldStates[field];
        } else {
          delete wrapper.dataset.state;
        }
      }
      if (statusNode) {
        if (!showFieldStatus) {
          statusNode.textContent = '';
          statusNode.dataset.tone = '';
        } else if (fieldStates[field] === 'auto') {
          statusNode.textContent = 'Распознано автоматически';
          statusNode.dataset.tone = 'auto';
        } else if (fieldStates[field] === 'manual') {
          statusNode.textContent = 'Заполнено вручную';
          statusNode.dataset.tone = 'manual';
        } else {
          statusNode.textContent = 'Требуется ввод';
          statusNode.dataset.tone = 'empty';
        }
      }
    });
  }

  function updateSummary() {
    if (!summaryEl) return;
    if (!showFieldStatus) {
      summaryEl.innerHTML = '<p class="photo-summary__placeholder">После распознавания здесь появится отчёт о том, какие поля заполнились автоматически.</p>';
      return;
    }

    const autoFields = FIELD_KEYS.filter((field) => fieldStates[field] === 'auto');
    const manualFields = FIELD_KEYS.filter((field) => fieldStates[field] === 'manual');
    const emptyFields = FIELD_KEYS.filter((field) => fieldStates[field] === 'empty');

    const sections = [];

    if (autoFields.length) {
      sections.push(`
        <div class="photo-summary__section">
          <span class="photo-summary__label" data-tone="auto">✅ Распознано автоматически</span>
          <ul class="photo-summary__list">
            ${autoFields.map((field) => `<li>${FIELD_LABELS[field]}</li>`).join('')}
          </ul>
        </div>
      `);
    }
    if (manualFields.length) {
      sections.push(`
        <div class="photo-summary__section">
          <span class="photo-summary__label" data-tone="manual">✏️ Изменено вручную</span>
          <ul class="photo-summary__list">
            ${manualFields.map((field) => `<li>${FIELD_LABELS[field]}</li>`).join('')}
          </ul>
        </div>
      `);
    }
    if (emptyFields.length) {
      sections.push(`
        <div class="photo-summary__section">
          <span class="photo-summary__label" data-tone="empty">⚠️ Нужно заполнить</span>
          <ul class="photo-summary__list">
            ${emptyFields.map((field) => `<li>${FIELD_LABELS[field]}</li>`).join('')}
          </ul>
        </div>
      `);
    }

    if (!sections.length) {
      summaryEl.innerHTML = '<p class="photo-summary__placeholder">Текст не распознан. Заполните поля вручную.</p>';
    } else {
      summaryEl.innerHTML = `<div class="photo-summary__sections">${sections.join('')}</div>`;
    }
  }

  setStatus(statusEl, 'Файл пока не выбран. Загрузите фото этикетки с данными.');
  textEl.value = '';
  fillForm(formEl, {
    coffeeName: '',
    roasterName: '',
    country: '',
    region: '',
    farm: '',
    process: '',
    brewMethod: '',
    notes: '',
  });
  setButtonsState([copyBtn, sendBtn], false);
  resetFieldTracking();
  applyFieldStates();
  updateSummary();

  if (hintEl) {
    if (googleFormConfig?.enabled && googleFormConfig.prefillBaseUrl) {
      hintEl.textContent = 'Данные будут переданы в заранее заполненную форму Google при нажатии на кнопку.';
    } else {
      hintEl.textContent = 'Укажите параметры формы Google в файле js/config.js, чтобы включить автозаполнение.';
    }
  }

  if (processHintEl) {
    processHintEl.textContent = `Подсказка: поддерживаются обработки ${PROCESS_HINTS.join(', ')}.`;
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) {
      setStatus(statusEl, 'Файл не выбран.', 'warning');
      return;
    }
    try {
      isProcessing = true;
      showFieldStatus = false;
      setStatus(statusEl, 'Распознавание текста…', 'progress');
      setButtonsState([copyBtn, sendBtn], false);
      resetFieldTracking();
      applyFieldStates();
      updateSummary();
      const text = await recognizeFile(file, (progress) => {
        setStatus(statusEl, `Распознавание текста… ${progress}%`, 'progress');
      });
      currentText = normalizeOcrOutput(text);
      textEl.value = currentText;
      const parsedFields = parseFieldsFromText(currentText);
      fillForm(formEl, parsedFields);
      FIELD_KEYS.forEach((field) => {
        const value = normalizeText(parsedFields[field]);
        recognizedValues[field] = value;
        fieldStates[field] = value ? 'auto' : 'empty';
      });
      showFieldStatus = true;
      applyFieldStates();
      updateSummary();
      setStatus(statusEl, 'Распознавание завершено. Проверьте и отредактируйте данные при необходимости.', 'success');
      setButtonsState([copyBtn], Boolean(currentText));
      if (googleFormConfig?.enabled && googleFormConfig.prefillBaseUrl) {
        setButtonsState([sendBtn], Boolean(currentText));
      }
    } catch (err) {
      console.error('OCR error:', err);
      setStatus(statusEl, 'Не удалось распознать изображение. Попробуйте другое фото.', 'error');
      textEl.value = '';
      currentText = '';
      resetFieldTracking();
      showFieldStatus = true;
      applyFieldStates();
      updateSummary();
      setButtonsState([copyBtn, sendBtn], false);
    } finally {
      isProcessing = false;
    }
  });

  formEl.addEventListener('input', (event) => {
    const target = event.target;
    const field = target?.dataset?.field;
    if (field && FIELD_KEYS.includes(field)) {
      const rawValue = target.value || '';
      const normalizedValue = normalizeText(rawValue);
      if (!normalizedValue) {
        fieldStates[field] = 'empty';
      } else if (recognizedValues[field] && normalizedValue === recognizedValues[field]) {
        fieldStates[field] = 'auto';
      } else {
        fieldStates[field] = 'manual';
      }
      showFieldStatus = true;
      applyFieldStates();
      updateSummary();
    }

    if (currentText || FIELD_KEYS.some((key) => normalizeText(formEl.querySelector(`[data-field="${key}"]`)?.value))) {
      setButtonsState([copyBtn], true);
      if (googleFormConfig?.enabled && googleFormConfig.prefillBaseUrl) {
        setButtonsState([sendBtn], true);
      }
    }
  });

  copyBtn?.addEventListener('click', async () => {
    if (!currentText && !isProcessing && !FIELD_KEYS.some((key) => normalizeText(formEl.querySelector(`[data-field="${key}"]`)?.value))) {
      return;
    }
    const formData = collectForm(formEl);
    const payload = {
      ...formData,
      rawText: currentText,
    };
    const formatted = formatClipboardData(payload);
    const ok = await copyToClipboard(formatted);
    if (ok) {
      setStatus(statusEl, 'Данные скопированы в буфер обмена.', 'success');
    } else {
      setStatus(statusEl, 'Не удалось скопировать данные. Скопируйте их вручную из поля ниже.', 'warning');
    }
  });

  sendBtn?.addEventListener('click', () => {
    if (!googleFormConfig?.enabled || !googleFormConfig.prefillBaseUrl) return;
    const formData = collectForm(formEl);
    const payload = {
      ...formData,
      rawText: currentText,
    };
    const url = buildPrefillUrl(payload, googleFormConfig);
    if (!url) {
      setStatus(statusEl, 'Проверьте настройки Google формы в js/config.js.', 'warning');
      return;
    }
    window.open(url, '_blank', 'noopener');
    setStatus(statusEl, 'Открыта форма Google с предварительно заполненными данными.', 'success');
  });
}
