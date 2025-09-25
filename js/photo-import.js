const OCR_LANGUAGES = 'eng+rus';
const FIELD_KEYS = ['coffeeName', 'roasterName', 'origin', 'process', 'brewMethod', 'notes'];

const FIELD_LABELS = {
  coffeeName: 'Название кофе',
  roasterName: 'Ростер',
  origin: 'Происхождение',
  process: 'Обработка',
  brewMethod: 'Метод заваривания',
  notes: 'Заметки',
};

const PROCESS_HINTS = ['natural', 'washed', 'honey', 'anaerobic', 'carbonic', 'experimental'];

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

function parseFieldsFromText(rawText) {
  const normalized = normalizeOcrOutput(rawText);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u2014\u2013]/g, '-').trim())
    .filter(Boolean);

  const extracted = {
    coffeeName: '',
    roasterName: '',
    origin: '',
    process: '',
    brewMethod: '',
    notes: '',
  };

  const usedLines = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes(':') && !line.includes('-')) continue;
    const parts = line.split(/[:\-]/);
    if (parts.length < 2) continue;
    const label = normalizeText(parts[0]).toLowerCase();
    const value = normalizeText(parts.slice(1).join('-'));
    if (!value) continue;

    if (!extracted.roasterName && /(roaster|roastery|обжар|rost)/.test(label)) {
      extracted.roasterName = value;
      usedLines.add(i);
    } else if (!extracted.origin && /(origin|страна|country|регион|region)/.test(label)) {
      extracted.origin = value;
      usedLines.add(i);
    } else if (!extracted.process && /(process|обработ|method|метод)/.test(label)) {
      extracted.process = value;
      usedLines.add(i);
    } else if (!extracted.brewMethod && /(brew|brew method|завар|способ|обжар)/.test(label)) {
      extracted.brewMethod = value;
      usedLines.add(i);
    } else if (!extracted.notes && /(notes|вкус|flavor|tasting|profile)/.test(label)) {
      extracted.notes = value;
      usedLines.add(i);
    } else if (!extracted.coffeeName && /(coffee|название|lot|blend)/.test(label)) {
      extracted.coffeeName = value;
      usedLines.add(i);
    }
  }

  if (!extracted.coffeeName && lines[0]) {
    extracted.coffeeName = normalizeText(lines[0]);
    usedLines.add(0);
  }
  if (!extracted.roasterName && lines[1] && !usedLines.has(1)) {
    extracted.roasterName = normalizeText(lines[1]);
    usedLines.add(1);
  }

  if (!extracted.process) {
    const processLine = lines.find((line) => detectProcessFromLine(line));
    if (processLine) extracted.process = detectProcessFromLine(processLine);
  }

  if (!extracted.notes) {
    const last = lines[lines.length - 1];
    if (last && !usedLines.has(lines.length - 1)) {
      extracted.notes = normalizeText(last);
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
    origin: '',
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
