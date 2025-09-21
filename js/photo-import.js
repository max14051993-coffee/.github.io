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

function byField(field, root) {
  return root.querySelector(`[data-field="${field}"]`);
}

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
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
  const lines = String(rawText || '')
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
    } else if (!extracted.brewMethod && /(brew|brew method|завар|способ)/.test(label)) {
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

async function recognizeFile(file, onProgress) {
  if (!file) throw new Error('Файл не выбран');
  const { recognize } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.esm.min.js');
  const result = await recognize(file, OCR_LANGUAGES, {
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
  const formEl = $('#photoDetailsForm');
  const processHintEl = $('#photoProcessHint');
  const copyBtn = $('#photoCopyData');
  const sendBtn = $('#photoSendToDocs');
  const hintEl = $('#photoDocsHint');

  if (!card || !input || !statusEl || !textEl || !formEl) return;

  let currentText = '';
  let isProcessing = false;

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
      setStatus(statusEl, 'Распознавание текста…', 'progress');
      setButtonsState([copyBtn, sendBtn], false);
      const text = await recognizeFile(file, (progress) => {
        setStatus(statusEl, `Распознавание текста… ${progress}%`, 'progress');
      });
      currentText = text.trim();
      textEl.value = currentText;
      const parsedFields = parseFieldsFromText(currentText);
      fillForm(formEl, parsedFields);
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
      setButtonsState([copyBtn, sendBtn], false);
    } finally {
      isProcessing = false;
    }
  });

  formEl.addEventListener('input', () => {
    if (!currentText) return;
    setButtonsState([copyBtn], true);
    if (googleFormConfig?.enabled && googleFormConfig.prefillBaseUrl) {
      setButtonsState([sendBtn], true);
    }
  });

  copyBtn?.addEventListener('click', async () => {
    if (!currentText && !isProcessing) return;
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
