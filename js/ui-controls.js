import { escapeAttr, escapeHtml, setupInfoDisclosure } from './utils.js';

export function processColors(pType) {
  switch (pType) {
    case 'washed':      return { point: '#2e7d32', bg: '#d7f0df', br: '#82b998', txt: '#205b3a' };
    case 'natural':     return { point: '#c0392b', bg: '#ffd9d2', br: '#e59883', txt: '#7a1d12' };
    case 'honey':       return { point: '#c77f0a', bg: '#ffe9c6', br: '#e9b86a', txt: '#6b4800' };
    case 'anaerobic':   return { point: '#6a3cbc', bg: '#e6d7ff', br: '#b79de5', txt: '#3b2b6f' };
    case 'experimental':return { point: '#2c5aa0', bg: '#dde9f7', br: '#9bb9e6', txt: '#1f3a63' };
    default:            return { point: '#777777', bg: '#eeeeee', br: '#cccccc', txt: '#333333' };
  }
}

export const PROCESS_FILTERS = [
  { value: 'all',          label: 'Все',           title: 'Показывать все процессы',           dot: 'var(--accent)' },
  { value: 'washed',       label: 'Мытый',         title: 'Мытый / washed процесс',           dot: processColors('washed').point },
  { value: 'natural',      label: 'Натуральный',   title: 'Natural / сухая обработка',        dot: processColors('natural').point },
  { value: 'honey',        label: 'Хани',          title: 'Honey / pulped natural',           dot: processColors('honey').point },
  { value: 'anaerobic',    label: 'Анаэроб',       title: 'Анаэробные ферментации',           dot: processColors('anaerobic').point },
  { value: 'experimental', label: 'Эксперименты',  title: 'Экспериментальные обработки',      dot: processColors('experimental').point },
  { value: 'other',        label: 'Другое',        title: 'Редкие или неуказанные методы',    dot: processColors('other').point },
];

export const PROCESS_FILTER_VALUES = new Set(PROCESS_FILTERS.map((p) => p.value));

const ACHIEVEMENTS = [
  {
    id: 'first_sip',
    emoji: '🎉',
    title: 'Первая отметка',
    description: 'Запишите первую дегустацию на карте.',
    color: { bg: '#f0fdf4', br: '#bbf7d0', txt: '#14532d' },
    earned: (m) => m.total >= 1,
  },
  {
    id: 'countries_3',
    emoji: '🧭',
    title: 'Три страны в коллекции',
    description: 'Попробуйте кофе минимум из трёх разных стран.',
    color: { bg: '#fffbeb', br: '#fde68a', txt: '#78350f' },
    earned: (m) => m.countries >= 3,
  },
  {
    id: 'processes_3',
    emoji: '🔬',
    title: 'Три способа обработки',
    description: 'Откройте дегустации с тремя разными методами обработки.',
    color: { bg: '#f5f3ff', br: '#ddd6fe', txt: '#3730a3' },
    earned: (m) => m.processTypes >= 3,
  },
];

export function renderAchievements(metrics) {
  const earned = ACHIEVEMENTS.filter((achievement) => achievement.earned(metrics));
  const el = document.getElementById('achievements');
  if (!el) return;
  if (!earned.length) {
    el.innerHTML = '<p class="ach-empty">Продолжайте исследовать карту, чтобы открыть новые бейджи.</p>';
    return;
  }
  el.innerHTML = earned.map((achievement) => {
    const tooltip = achievement.description ? ` data-tooltip="${escapeAttr(achievement.description)}"` : '';
    const aria = achievement.description
      ? `${achievement.title}. ${achievement.description}`
      : achievement.title;
    return `
      <div class="ach-badge" style="--ach-bg:${escapeAttr(achievement.color.bg)};--ach-border:${escapeAttr(achievement.color.br)};--ach-text:${escapeAttr(achievement.color.txt)}"${tooltip} tabindex="0" aria-label="${escapeAttr(aria)}">
        <span class="ach-icon" aria-hidden="true">${achievement.emoji}</span>
        <span class="ach-title">${escapeHtml(achievement.title)}</span>
      </div>
    `;
  }).join('');
}

function buildControlsHTML(pointsCount, countriesCount, hasOwner, ownerLabel = '', activeProcess = 'all') {
  const wrap = document.createElement('div');
  wrap.className = 'filters-stack';
  const ownerLabelSafe = String(ownerLabel || '').trim();
  const mineLabelClass = hasOwner ? 'toggle-control' : 'toggle-control is-disabled';
  const mineLabelText = 'Мои записи';
  const mineTitleText = hasOwner
    ? (ownerLabelSafe ? `Показывать только свои записи — ${ownerLabelSafe}` : 'Показывать только свои записи')
    : 'Фильтр появится, когда в данных указан автор';
  const mineDisabledAttr = hasOwner ? '' : ' disabled';
  const mineAriaDisabled = hasOwner ? '' : ' aria-disabled="true"';
  const processButtons = PROCESS_FILTERS.map((opt) => {
    const isActive = activeProcess === opt.value;
    const title = opt.title ? ` title="${escapeAttr(opt.title)}"` : '';
    const dot = opt.dot ? ` style="--dot-color:${escapeAttr(opt.dot)}"` : '';
    const cls = isActive ? 'filter-chip is-active' : 'filter-chip';
    return `
      <button type="button" class="${cls}" data-process="${escapeAttr(opt.value)}" aria-pressed="${isActive ? 'true' : 'false'}"${title}>
        <span class="filter-dot"${dot}></span>
        <span>${escapeHtml(opt.label)}</span>
      </button>
    `;
  }).join('');
  wrap.innerHTML = `
    <div class="filters-stats">
      <span class="chip" title="Точек на карте">☕ <span id="pointsCount">${pointsCount}</span></span>
      <span class="chip" title="Стран в коллекции">🌍 <span id="countriesCount">${countriesCount}</span></span>
    </div>
    <div class="filters-section">
      <span class="filters-label">Отображение</span>
      <div class="filters-toggles">
        <label class="toggle-control" title="Показывать маршруты ферма → обжарщик → кофейня">
          <input type="checkbox" id="toggleRoutes">
          <span class="toggle-emoji">🧵</span>
          <span class="toggle-text">Маршруты</span>
        </label>
        <label class="toggle-control" title="Закрашивать страны происхождения на карте">
          <input type="checkbox" id="toggleVisited">
          <span class="toggle-emoji">🎨</span>
          <span class="toggle-text">Страны</span>
        </label>
        <label class="${mineLabelClass}" title="${escapeAttr(mineTitleText)}"${mineAriaDisabled}>
          <input type="checkbox" id="toggleMine"${mineDisabledAttr}>
          <span class="toggle-emoji">🙋</span>
          <span class="toggle-text">${escapeHtml(mineLabelText)}</span>
        </label>
      </div>
    </div>
    <div class="filters-section">
      <span class="filters-label">Обработка зерна</span>
      <div class="filters-chips" role="group" aria-label="Фильтр по обработке">
        ${processButtons}
      </div>
    </div>
  `;
  return wrap;
}

export function createUIController({
  pointsCount,
  countriesCount,
  ownerName,
  ownerLabel,
  filterState,
  onRoutesToggle,
  onVisitedToggle,
  onMineToggle,
  onProcessChange,
}) {
  const hasOwner = Boolean(ownerName);
  const root = buildControlsHTML(pointsCount, countriesCount, hasOwner, ownerLabel, filterState.process);
  const routesToggle = root.querySelector('#toggleRoutes');
  const visitedToggle = root.querySelector('#toggleVisited');
  const mineToggle = root.querySelector('#toggleMine');
  const processButtons = [...root.querySelectorAll('[data-process]')];
  const filtersMenu = document.getElementById('filtersMenu');
  const filtersInfoToggle = filtersMenu?.querySelector('[data-overlay-info-toggle]');
  const filtersInfoPanel = filtersMenu?.querySelector('[data-overlay-info-panel]');

  setupInfoDisclosure({
    toggle: filtersInfoToggle,
    panel: filtersInfoPanel,
  });

  if (routesToggle) {
    routesToggle.addEventListener('change', (e) => onRoutesToggle?.(e.target.checked), { passive: true });
  }
  if (visitedToggle) {
    visitedToggle.addEventListener('change', (e) => onVisitedToggle?.(e.target.checked), { passive: true });
  }
  if (mineToggle) {
    mineToggle.addEventListener('change', (e) => onMineToggle?.(e.target.checked), { passive: true });
  }
  processButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-process') || 'all';
      onProcessChange?.(raw);
    }, { passive: true });
  });

  const updateCounts = (points, countries) => {
    const pointsEl = root.querySelector('#pointsCount');
    if (pointsEl) pointsEl.textContent = points;
    const countriesEl = root.querySelector('#countriesCount');
    if (countriesEl) countriesEl.textContent = countries;
  };

  const updateProcessButtons = (activeValue) => {
    processButtons.forEach((btn) => {
      const value = btn.getAttribute('data-process') || 'all';
      const isActive = value === activeValue;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.classList.toggle('is-active', isActive);
    });
  };

  const setMineState = (state) => {
    if (!mineToggle) return;
    if (mineToggle.checked !== state) {
      mineToggle.checked = state;
    }
  };

  const placeControls = () => {
    const container = document.getElementById('filtersPanel');
    if (!container) return;
    if (root.parentElement !== container) {
      container.innerHTML = '';
      container.appendChild(root);
    }
  };

  const isMineChecked = () => Boolean(mineToggle?.checked);

  updateCounts(pointsCount, countriesCount);
  updateProcessButtons(filterState.process);
  setMineState(filterState.mine);

  return {
    root,
    placeControls,
    updateCounts,
    updateProcessButtons,
    setMineState,
    isMineChecked,
  };
}
