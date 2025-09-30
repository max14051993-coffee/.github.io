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

const metricCount = (value) => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value.size === 'number') return value.size;
  if (typeof value === 'number') return value;
  return 0;
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const ratioProgress = (current, target) => {
  const safeTarget = Number(target);
  if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
    return current ? 1 : 0;
  }
  const safeCurrent = Number(current);
  if (!Number.isFinite(safeCurrent)) return 0;
  return clamp01(safeCurrent / safeTarget);
};

const countProgress = (value, target) => ratioProgress(metricCount(value), target);

const multiFlagProgress = (flags) => {
  const items = Array.isArray(flags) ? flags : [];
  if (!items.length) return 0;
  const completed = items.reduce((acc, flag) => acc + (flag ? 1 : 0), 0);
  return ratioProgress(completed, items.length);
};

const ACHIEVEMENTS = [
  {
    id: 'world_wanderer',
    emoji: '🌍',
    title: 'Мировой скиталец',
    description: 'Попробовать кофе из 5 разных стран.',
    color: { bg: '#e6f7ff', br: '#b3e5fc', txt: '#01579b' },
    earned: (m) => metricCount(m.countryCodes) >= 5,
    progress: (m) => countProgress(m.countryCodes, 5),
  },
  {
    id: 'bean_passport',
    emoji: '🛂',
    title: 'Паспорт в зернах',
    description: 'Попробовать кофе из 10 стран.',
    color: { bg: '#fff3e0', br: '#ffcc80', txt: '#e65100' },
    earned: (m) => metricCount(m.countryCodes) >= 10,
    progress: (m) => countProgress(m.countryCodes, 10),
    requires: 'world_wanderer',
  },
  {
    id: 'coffee_united',
    emoji: '🏅',
    title: 'Coffee United Nations',
    description: 'Попробовать кофе из 20+ стран.',
    color: { bg: '#f3e5f5', br: '#d1c4e9', txt: '#4a148c' },
    earned: (m) => metricCount(m.countryCodes) >= 20,
    progress: (m) => countProgress(m.countryCodes, 20),
    requires: 'bean_passport',
  },
  {
    id: 'global_champion',
    emoji: '🌐',
    title: 'Глобальный чемпион',
    description: 'Попробовать кофе хотя бы из 30 стран.',
    color: { bg: '#fffde7', br: '#fff176', txt: '#f57f17' },
    earned: (m) => metricCount(m.countryCodes) >= 30,
    progress: (m) => countProgress(m.countryCodes, 30),
    requires: 'coffee_united',
  },
  {
    id: 'continental',
    emoji: '🗺️',
    title: 'Континентальный',
    description: 'Собрать кофе с каждого континента, где он растёт.',
    color: { bg: '#e8f5e9', br: '#a5d6a7', txt: '#1b5e20' },
    earned: (m) => Boolean(m.hasAllCoffeeContinents),
    progress: (m) => countProgress(m.continents, 5),
  },
  {
    id: 'africa_explorer',
    emoji: '🌍',
    title: 'Африканский исследователь',
    description: 'Попробовать кофе минимум из 5 африканских стран.',
    color: { bg: '#fbe9e7', br: '#ffab91', txt: '#bf360c' },
    earned: (m) => metricCount(m.africanCountries) >= 5,
    progress: (m) => countProgress(m.africanCountries, 5),
  },
  {
    id: 'latin_gourmet',
    emoji: '🌎',
    title: 'Латиноамериканский гурман',
    description: 'Попробовать кофе из 5 стран Латинской Америки.',
    color: { bg: '#f1f8e9', br: '#c5e1a5', txt: '#33691e' },
    earned: (m) => metricCount(m.latinCountries) >= 5,
    progress: (m) => countProgress(m.latinCountries, 5),
  },
  {
    id: 'asia_collector',
    emoji: '🌏',
    title: 'Азиатский коллекционер',
    description: 'Попробовать кофе из 3 азиатских стран.',
    color: { bg: '#e0f7fa', br: '#80deea', txt: '#006064' },
    earned: (m) => metricCount(m.asianCountries) >= 3,
    progress: (m) => countProgress(m.asianCountries, 3),
  },
  {
    id: 'island_hunter',
    emoji: '🏝️',
    title: 'Архипелаговый искатель',
    description: 'Попробовать кофе с островов.',
    color: { bg: '#fff0f6', br: '#f8bbd0', txt: '#ad1457' },
    earned: (m) => metricCount(m.islandCountries) >= 3,
    progress: (m) => countProgress(m.islandCountries, 3),
  },
  {
    id: 'ethiopia_tracker',
    emoji: '🇪🇹',
    title: 'Эфиопский следопыт',
    description: 'Попробовать кофе из 3 разных регионов Эфиопии.',
    color: { bg: '#f1f8ff', br: '#bbdefb', txt: '#0d47a1' },
    earned: (m) => metricCount(m.ethiopiaRegions) >= 3,
    progress: (m) => countProgress(m.ethiopiaRegions, 3),
  },
  {
    id: 'colombia_tracker',
    emoji: '🇨🇴',
    title: 'Колумбийский трекер',
    description: 'Собрать кофе из 3 зон Колумбии.',
    color: { bg: '#fff8e1', br: '#ffe082', txt: '#ff6f00' },
    earned: (m) => metricCount(m.colombiaRegions) >= 3,
    progress: (m) => countProgress(m.colombiaRegions, 3),
  },
  {
    id: 'deep_dive',
    emoji: '📍',
    title: 'Глубокое погружение',
    description: 'Попробовать кофе из 5 регионов в одной стране.',
    color: { bg: '#ede7f6', br: '#b39ddb', txt: '#311b92' },
    earned: (m) => Number(m.maxRegionsInCountry) >= 5,
    progress: (m) => countProgress(m.maxRegionsInCountry, 5),
  },
  {
    id: 'regional_champion',
    emoji: '🏆',
    title: 'Региональный чемпион',
    description: 'Попробовать кофе из 15+ уникальных регионов.',
    color: { bg: '#fff3f0', br: '#ffab91', txt: '#bf360c' },
    earned: (m) => Number(m.uniqueRegions) >= 15,
    progress: (m) => countProgress(m.uniqueRegions, 15),
  },
  {
    id: 'washed_master',
    emoji: '💧',
    title: 'Мытый мастер',
    description: 'Попробовать 5 сортов мытой обработки.',
    color: { bg: '#e0f2f1', br: '#80cbc4', txt: '#004d40' },
    earned: (m) => Number(m.washedCount) >= 5,
    progress: (m) => countProgress(m.washedCount, 5),
  },
  {
    id: 'natural_gourmet',
    emoji: '☀️',
    title: 'Сухой гурман',
    description: 'Попробовать 5 сортов натуральной обработки.',
    color: { bg: '#fff8e1', br: '#ffe0b2', txt: '#e65100' },
    earned: (m) => Number(m.naturalCount) >= 5,
    progress: (m) => countProgress(m.naturalCount, 5),
  },
  {
    id: 'experimenter',
    emoji: '⚗️',
    title: 'Экспериментатор',
    description: 'Попробовать honey, anaerobic и carbonic maceration.',
    color: { bg: '#edeefc', br: '#c5cae9', txt: '#283593' },
    earned: (m) => Boolean(m.hasHoney && m.hasAnaerobic && m.hasCarbonic),
    progress: (m) => multiFlagProgress([m.hasHoney, m.hasAnaerobic, m.hasCarbonic]),
  },
  {
    id: 'fermentation_maniac',
    emoji: '🧪',
    title: 'Ферментационный маньяк',
    description: 'Попробовать 5+ экспериментальных методов обработки.',
    color: { bg: '#f3e5f5', br: '#ce93d8', txt: '#6a1b9a' },
    earned: (m) => metricCount(m.experimentalMethods) >= 5,
    progress: (m) => countProgress(m.experimentalMethods, 5),
  },
  {
    id: 'industrial_romantic',
    emoji: '🏭',
    title: 'Промышленный романтик',
    description: 'Попробовать rare washed и honey с геопривязкой.',
    color: { bg: '#f1f8e9', br: '#aed581', txt: '#33691e' },
    earned: (m) => Boolean(m.geotagWashed && m.geotagHoney),
    progress: (m) => multiFlagProgress([m.geotagWashed, m.geotagHoney]),
  },
  {
    id: 'filter_geek',
    emoji: '☕',
    title: 'Фильтр-гик',
    description: 'Попробовать 3 метода фильтра: v60, Kalita, Aeropress.',
    color: { bg: '#e8eaf6', br: '#c5cae9', txt: '#283593' },
    earned: (m) => Boolean(m.filterHits?.v60 && m.filterHits?.kalita && m.filterHits?.aeropress),
    progress: (m) => multiFlagProgress([
      Boolean(m.filterHits?.v60),
      Boolean(m.filterHits?.kalita),
      Boolean(m.filterHits?.aeropress),
    ]),
  },
  {
    id: 'multi_brew',
    emoji: '🌀',
    title: 'Мульти-брю',
    description: 'Попробовать хотя бы 5 разных способов заварки.',
    color: { bg: '#f9fbe7', br: '#dce775', txt: '#827717' },
    earned: (m) => metricCount(m.brewMethods) >= 5,
    progress: (m) => countProgress(m.brewMethods, 5),
  },
  {
    id: 'espresso_master',
    emoji: '🍵',
    title: 'Эспрессо-мастер',
    description: 'Попробовать эспрессо в 5 разных городах.',
    color: { bg: '#fff3e0', br: '#ffb74d', txt: '#e65100' },
    earned: (m) => metricCount(m.espressoCities) >= 5,
    progress: (m) => countProgress(m.espressoCities, 5),
  },
  {
    id: 'local_patriot',
    emoji: '🏘️',
    title: 'Локальный патриот',
    description: 'Попробовать кофе от 3 обжарщиков из своего города.',
    color: { bg: '#f1f8e9', br: '#dcedc8', txt: '#33691e' },
    earned: (m) => Number(m.roastersInHomeCity) >= 3,
    progress: (m) => countProgress(m.roastersInHomeCity, 3),
  },
  {
    id: 'international_roasters',
    emoji: '🌐',
    title: 'Интернациональный сет',
    description: 'Попробовать кофе от обжарщиков из 5 разных стран.',
    color: { bg: '#e0f2f1', br: '#80cbc4', txt: '#004d40' },
    earned: (m) => metricCount(m.roasterCountries) >= 5,
    progress: (m) => countProgress(m.roasterCountries, 5),
  },
  {
    id: 'home_barista',
    emoji: '🏠',
    title: 'Домашний бариста',
    description: 'Выпить 10 чашек дома.',
    color: { bg: '#fff8e1', br: '#ffe0b2', txt: '#ef6c00' },
    earned: (m) => Number(m.homeCups) >= 10,
    progress: (m) => countProgress(m.homeCups, 10),
  },
  {
    id: 'coffee_tourist',
    emoji: '🧳',
    title: 'Кофейный турист',
    description: 'Попробовать кофе в 5 разных городах.',
    color: { bg: '#e3f2fd', br: '#90caf9', txt: '#1565c0' },
    earned: (m) => metricCount(m.consumedCities) >= 5,
    progress: (m) => countProgress(m.consumedCities, 5),
  },
  {
    id: 'cafe_explorer',
    emoji: '🏛️',
    title: 'Кафейный исследователь',
    description: 'Посетить 10 уникальных кофеен.',
    color: { bg: '#fce4ec', br: '#f48fb1', txt: '#880e4f' },
    earned: (m) => metricCount(m.cafes) >= 10,
    progress: (m) => countProgress(m.cafes, 10),
  },
];

export function renderAchievements(metrics) {
  const el = document.getElementById('achievements');
  const container = el?.closest('[data-achievements-container]');
  if (!el) return;

  const evaluated = ACHIEVEMENTS.map((achievement, index) => {
    const earned = Boolean(achievement.earned(metrics));
    const rawProgress = typeof achievement.progress === 'function'
      ? achievement.progress(metrics)
      : (earned ? 1 : 0);
    const progress = earned ? 1 : clamp01(rawProgress);
    return { ...achievement, earned, progress, originalIndex: index };
  });

  const lookup = new Map(evaluated.map((achievement) => [achievement.id, achievement]));

  const visible = evaluated.filter((achievement) => {
    const requirementMet = !achievement.requires || lookup.get(achievement.requires)?.earned;
    if (!requirementMet && !achievement.earned) return false;
    if (achievement.earned) return true;
    return achievement.progress > 0;
  });

  const sorted = [...visible].sort((a, b) => {
    if (a.earned && !b.earned) return -1;
    if (!a.earned && b.earned) return 1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    return a.originalIndex - b.originalIndex;
  });

  if (!visible.length) {
    el.innerHTML = '';
    if (container) container.hidden = true;
    return;
  }
  if (container) container.hidden = false;

  el.innerHTML = sorted.map((achievement) => {
    const isPartial = !achievement.earned && achievement.progress > 0;
    const progressPercent = Math.round(achievement.progress * 100);
    const tooltipTextParts = [];
    if (achievement.description) tooltipTextParts.push(achievement.description);
    if (achievement.earned) {
      tooltipTextParts.push('Достижение получено');
    } else if (isPartial) {
      tooltipTextParts.push(`Прогресс: ${progressPercent}%`);
    }
    const tooltipText = tooltipTextParts.join(' ');
    const tooltipHtml = tooltipText ? `<span class="ach-tooltip" aria-hidden="true">${escapeHtml(tooltipText)}</span>` : '';
    const ariaParts = [achievement.title];
    if (achievement.description) ariaParts.push(achievement.description);
    if (achievement.earned) {
      ariaParts.push('Достижение получено.');
    } else if (isPartial) {
      ariaParts.push(`Прогресс ${progressPercent}%.`);
    }
    const aria = ariaParts.join(' ');
    const styleValue = `--ach-bg:${achievement.color.bg};--ach-border:${achievement.color.br};--ach-text:${achievement.color.txt};--ach-progress:${achievement.progress.toFixed(3)}`;
    const style = ` style="${escapeAttr(styleValue)}"`;
    const cls = ['ach-badge'];
    if (achievement.earned) cls.push('is-earned');
    if (isPartial) cls.push('is-partial');
    return `
      <div class="${cls.join(' ')}" role="listitem"${style} tabindex="0" aria-label="${escapeAttr(aria)}">
        <span class="ach-icon" aria-hidden="true">${achievement.emoji}</span>
        ${tooltipHtml}
      </div>
    `;
  }).join('');

  setupAchievementTooltips(el);
}

const TOOLTIP_VIEWPORT_GAP = 16;

function setupAchievementTooltips(root) {
  if (!root || typeof window === 'undefined' || typeof document === 'undefined') return;
  const badges = root.querySelectorAll('.ach-badge');
  badges.forEach((badge) => {
    const tooltip = badge.querySelector('.ach-tooltip');
    if (!tooltip) return;

    let rafId = 0;
    let resizeHandler = null;

    const applyShift = () => {
      badge.style.setProperty('--ach-tooltip-shift', '0px');
      const rect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const safeRight = viewportWidth - TOOLTIP_VIEWPORT_GAP;
      let shift = 0;
      if (rect.left < TOOLTIP_VIEWPORT_GAP) {
        shift = TOOLTIP_VIEWPORT_GAP - rect.left;
      } else if (rect.right > safeRight) {
        shift = safeRight - rect.right;
      }
      if (shift !== 0) {
        badge.style.setProperty('--ach-tooltip-shift', `${shift}px`);
      } else {
        badge.style.removeProperty('--ach-tooltip-shift');
      }
    };

    const scheduleApply = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        applyShift();
        rafId = 0;
      });
      if (!resizeHandler) {
        resizeHandler = () => applyShift();
        window.addEventListener('resize', resizeHandler);
      }
    };

    const resetShift = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      badge.style.removeProperty('--ach-tooltip-shift');
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
    };

    badge.addEventListener('pointerenter', scheduleApply);
    badge.addEventListener('focus', scheduleApply);
    badge.addEventListener('pointerleave', resetShift);
    badge.addEventListener('blur', resetShift);
    badge.addEventListener('touchstart', scheduleApply, { passive: true });
  });
}

function buildControlsHTML(pointsCount, countriesCount, activeProcess = 'all') {
  const wrap = document.createElement('div');
  wrap.className = 'filters-stack';
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
  filterState,
  onRoutesToggle,
  onVisitedToggle,
  onProcessChange,
}) {
  const root = buildControlsHTML(pointsCount, countriesCount, filterState.process);
  const routesToggle = root.querySelector('#toggleRoutes');
  const visitedToggle = root.querySelector('#toggleVisited');
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

  const placeControls = () => {
    const container = document.getElementById('filtersPanel');
    if (!container) return;
    if (root.parentElement !== container) {
      container.innerHTML = '';
      container.appendChild(root);
    }
  };

  updateCounts(pointsCount, countriesCount);
  updateProcessButtons(filterState.process);

  return {
    root,
    placeControls,
    updateCounts,
    updateProcessButtons,
  };
}
