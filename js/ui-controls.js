import { escapeAttr, escapeHtml } from './utils.js';

const globalScope = typeof globalThis !== 'undefined' ? globalThis : undefined;

const iconBasePath = (() => {
  if (!globalScope) return 'img/achievements';
  const customPath = globalScope.ACHIEVEMENT_ICON_PATH;
  if (customPath === null || customPath === false) return null;
  if (typeof customPath === 'string' && customPath.trim()) {
    return customPath.replace(/\/$/, '');
  }
  return 'img/achievements';
})();

const iconOverrides = globalScope && typeof globalScope.ACHIEVEMENT_ICONS === 'object'
  ? globalScope.ACHIEVEMENT_ICONS
  : null;

const resolveAchievementIcon = (id) => {
  if (iconOverrides && typeof iconOverrides[id] === 'string') {
    return iconOverrides[id];
  }
  if (!iconBasePath) return null;
  return `${iconBasePath}/${id}.webp`;
};

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

const isoToFlagEmoji = (isoCode) => {
  const code = String(isoCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const base = 127397; // Unicode regional indicator base
  return String.fromCodePoint(...code.split('').map((char) => char.codePointAt(0) + base));
};

const shouldRenderEmojiFlags = () => {
  if (!globalScope?.document?.body) return false;
  const mode = String(globalScope.document.body.dataset?.flagMode || '').toLowerCase();
  if (mode === 'emoji') return true;
  if (mode === 'img') return false;
  return typeof globalScope.matchMedia === 'function'
    ? globalScope.matchMedia('(max-width: 768px)').matches
    : false;
};

const parseSize = (value) => Number.parseFloat(value) || 0;

const measureContext = (() => {
  if (!globalScope?.document?.createElement) return null;
  const canvas = globalScope.document.createElement('canvas');
  return canvas.getContext('2d');
})();

const calculateDropdownWidth = (dropdown) => {
  if (!measureContext || !dropdown) return null;
  const items = dropdown.querySelectorAll('.map-stat-dropdown-item');
  if (!items.length) return null;

  let font = '';
  let longestName = 0;

  items.forEach((item) => {
    const nameEl = item?.querySelector('.map-stat-dropdown-flag + span');
    const text = nameEl?.textContent?.trim();
    if (!text) return;

    if (!font) {
      const itemStyle = globalScope.getComputedStyle ? getComputedStyle(item) : null;
      if (itemStyle) {
        font = itemStyle.font || `${itemStyle.fontWeight} ${itemStyle.fontSize} ${itemStyle.fontFamily}`;
      }
    }

    if (font) {
      measureContext.font = font;
      longestName = Math.max(longestName, measureContext.measureText(text).width);
    }
  });

  if (!font || !longestName) return null;

  const dropdownStyle = globalScope.getComputedStyle ? getComputedStyle(dropdown) : null;
  const firstItem = items[0];
  const itemStyle = firstItem && globalScope.getComputedStyle ? getComputedStyle(firstItem) : null;
  const gap = parseSize(itemStyle?.columnGap || itemStyle?.gap);
  const padding = parseSize(dropdownStyle?.paddingLeft) + parseSize(dropdownStyle?.paddingRight);
  const border = parseSize(dropdownStyle?.borderLeftWidth) + parseSize(dropdownStyle?.borderRightWidth);
  const flagStyle = firstItem?.querySelector('.map-stat-dropdown-flag')
    ? getComputedStyle(firstItem.querySelector('.map-stat-dropdown-flag'))
    : null;
  const flagWidth = parseSize(flagStyle?.width);

  return Math.ceil(longestName + gap + flagWidth + padding + border);
};

const setDropdownWidth = (dropdown) => {
  const width = calculateDropdownWidth(dropdown);
  if (Number.isFinite(width) && width > 0) {
    dropdown.style.width = `${width}px`;
  }
};

const positionDropdownBelowButton = (dropdown, button) => {
  if (!dropdown || !button) return;
  const parent = dropdown.offsetParent;
  if (!parent) return;

  const GAP = 10;
  const buttonRect = button.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  const left = buttonRect.left - parentRect.left;
  const top = (buttonRect.top - parentRect.top) + button.offsetHeight + GAP;

  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
};

const renderCountryFlag = (code, rawFlag) => {
  const rawFlagValue = String(rawFlag || '').trim();
  const looksLikeIso = /^[A-Za-z]{2}$/.test(rawFlagValue);
  const normalizedCode = (code || (looksLikeIso ? rawFlagValue : '') || '').toString().toUpperCase();
  const emojiFallback = (!looksLikeIso && rawFlagValue) ? rawFlagValue : isoToFlagEmoji(normalizedCode);
  const fallback = emojiFallback || '🏳️';
  const useEmoji = shouldRenderEmojiFlags();

  if (!useEmoji && normalizedCode) {
    const lower = escapeAttr(normalizedCode.toLowerCase());
    const onError = `this.onerror=null;this.replaceWith(document.createTextNode('${escapeAttr(fallback)}'));`;
    return `
      <span class="map-stat-dropdown-flag">
        <img
          src="https://flagcdn.com/24x18/${lower}.png"
          alt="${escapeAttr(normalizedCode)}"
          width="24"
          height="18"
          style="vertical-align:-2px;border-radius:2px"
          onerror="${onError}"
        >
      </span>
    `;
  }

  if (emojiFallback) {
    return `<span class="map-stat-dropdown-flag">${escapeHtml(emojiFallback)}</span>`;
  }

  return '<span class="map-stat-dropdown-flag" aria-hidden="true">🏳️</span>';
};

const renderCountryList = (countries) => {
  if (!Array.isArray(countries)) return '';
  return countries.map((item) => {
    const name = item?.name || item?.code || 'Неизвестно';
    const code = item?.code ? String(item.code).toUpperCase() : '';
    const flag = renderCountryFlag(code, item?.flag);
    return `<li class="map-stat-dropdown-item">${flag}<span>${escapeHtml(name)}</span>${code ? `<span class="sr-only">(${escapeHtml(code)})</span>` : ''}</li>`;
  }).join('');
};

const setupCountryDropdown = (button, dropdown, root) => {
  if (!button || !dropdown || dropdown.dataset.bound === 'true') return;

  const close = () => {
    dropdown.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    if (!dropdown.children.length) return;
    positionDropdownBelowButton(dropdown, button);
    dropdown.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  };

  const handleToggle = (event) => {
    event.stopPropagation();
    const expanded = button.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      close();
    } else {
      open();
    }
  };

  const handleDocumentClick = (event) => {
    if (!root?.contains(event.target)) close();
  };

  const handleKeydown = (event) => {
    if (event.key !== 'Escape') return;
    close();
    if (typeof button.focus === 'function') {
      button.focus();
    }
  };

  button.addEventListener('click', handleToggle);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleKeydown);
  dropdown.dataset.bound = 'true';
};

function normalizeCountryList(metrics, detailedKey, fallbackKey) {
  if (Array.isArray(metrics?.[detailedKey]) && metrics[detailedKey].length) {
    return metrics[detailedKey];
  }

  if (Array.isArray(metrics?.[fallbackKey]) && metrics[fallbackKey].length) {
    return metrics[fallbackKey].map((code) => ({
      code: String(code || '').toUpperCase(),
      name: String(code || '').toUpperCase(),
      flag: '',
    }));
  }

  return [];
}

export function renderStats(metrics) {
  const container = document.querySelector('[data-stats]');
  const cupsEl = container?.querySelector('[data-stat-cups]');
  const countriesEl = container?.querySelector('[data-stat-countries]');
  const roasterCountriesEl = container?.querySelector('[data-stat-roaster-countries]');
  const consumedCountriesEl = container?.querySelector('[data-stat-consumed-countries]');
  const countryDropdown = container?.querySelector('[data-country-dropdown]');
  const countryList = container?.querySelector('[data-country-list]');
  const countryStat = container?.querySelector('[data-country-stat]');
  const roasterDropdown = container?.querySelector('[data-roaster-dropdown]');
  const roasterList = container?.querySelector('[data-roaster-list]');
  const roasterStat = container?.querySelector('[data-roaster-stat]');
  const consumedDropdown = container?.querySelector('[data-consumed-dropdown]');
  const consumedList = container?.querySelector('[data-consumed-list]');
  const consumedStat = container?.querySelector('[data-consumed-stat]');
  if (!container || !cupsEl || !countriesEl || !roasterCountriesEl || !consumedCountriesEl) return;

  const total = Number(metrics?.total);
  const visitedCountries = normalizeCountryList(metrics, 'visitedCountries', 'countryCodes');
  const roasterCountries = normalizeCountryList(metrics, 'roasterCountriesDetailed', 'roasterCountries');
  const consumedCountries = normalizeCountryList(metrics, 'consumedCountriesDetailed', 'consumedCountries');
  const countries = Number.isFinite(metrics?.countries) ? Number(metrics.countries) : visitedCountries.length;
  const roasterCountriesCount = Number.isFinite(metrics?.roasterCountries?.length ?? metrics?.roasterCountries)
    ? Number(metrics?.roasterCountries?.length ?? metrics?.roasterCountries)
    : roasterCountries.length;
  const consumedCountriesCount = Number.isFinite(metrics?.consumedCountries?.length ?? metrics?.consumedCountries)
    ? Number(metrics?.consumedCountries?.length ?? metrics?.consumedCountries)
    : consumedCountries.length;

  if (Number.isFinite(total)) {
    cupsEl.textContent = total.toLocaleString('ru-RU');
  }

  if (Number.isFinite(countries)) {
    countriesEl.textContent = countries.toLocaleString('ru-RU');
  }

  if (countryDropdown && countryList) {
    if (visitedCountries.length) {
      countryList.innerHTML = renderCountryList(visitedCountries);
      setDropdownWidth(countryDropdown);
      countryDropdown.hidden = true;
      if ('disabled' in countriesEl) countriesEl.disabled = false;
      countriesEl.setAttribute('aria-expanded', 'false');
      setupCountryDropdown(countriesEl, countryDropdown, countryStat || container);
    } else {
      countryList.innerHTML = '';
      countryDropdown.hidden = true;
      countriesEl.setAttribute('aria-expanded', 'false');
      if ('disabled' in countriesEl) countriesEl.disabled = true;
    }
  }

  if (Number.isFinite(roasterCountriesCount)) {
    roasterCountriesEl.textContent = roasterCountriesCount.toLocaleString('ru-RU');
  }

  if (roasterDropdown && roasterList) {
    if (roasterCountries.length) {
      roasterList.innerHTML = renderCountryList(roasterCountries);
      setDropdownWidth(roasterDropdown);
      roasterDropdown.hidden = true;
      if ('disabled' in roasterCountriesEl) roasterCountriesEl.disabled = false;
      roasterCountriesEl.setAttribute('aria-expanded', 'false');
      setupCountryDropdown(roasterCountriesEl, roasterDropdown, roasterStat || container);
    } else {
      roasterList.innerHTML = '';
      roasterDropdown.hidden = true;
      roasterCountriesEl.setAttribute('aria-expanded', 'false');
      if ('disabled' in roasterCountriesEl) roasterCountriesEl.disabled = true;
    }
  }

  if (Number.isFinite(consumedCountriesCount)) {
    consumedCountriesEl.textContent = consumedCountriesCount.toLocaleString('ru-RU');
  }

  if (consumedDropdown && consumedList) {
    if (consumedCountries.length) {
      consumedList.innerHTML = renderCountryList(consumedCountries);
      setDropdownWidth(consumedDropdown);
      consumedDropdown.hidden = true;
      if ('disabled' in consumedCountriesEl) consumedCountriesEl.disabled = false;
      consumedCountriesEl.setAttribute('aria-expanded', 'false');
      setupCountryDropdown(consumedCountriesEl, consumedDropdown, consumedStat || container);
    } else {
      consumedList.innerHTML = '';
      consumedDropdown.hidden = true;
      consumedCountriesEl.setAttribute('aria-expanded', 'false');
      if ('disabled' in consumedCountriesEl) consumedCountriesEl.disabled = true;
    }
  }

  container.hidden = !(
    Number.isFinite(total)
    || Number.isFinite(countries)
    || Number.isFinite(roasterCountriesCount)
    || Number.isFinite(consumedCountriesCount)
  );
}

const ACHIEVEMENTS = [
  {
    id: 'world_wanderer',
    icon: resolveAchievementIcon('world_wanderer'),
    emoji: '🌍',
    title: 'Мировой скиталец',
    description: 'Попробовать кофе из 5 разных стран.',
    color: { bg: '#e6f7ff', br: '#b3e5fc', txt: '#01579b' },
    earned: (m) => metricCount(m.countryCodes) >= 5,
    progress: (m) => countProgress(m.countryCodes, 5),
  },
  {
    id: 'bean_passport',
    icon: resolveAchievementIcon('bean_passport'),
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
    icon: resolveAchievementIcon('coffee_united'),
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
    icon: resolveAchievementIcon('global_champion'),
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
    icon: resolveAchievementIcon('continental'),
    emoji: '🗺️',
    title: 'Континентальный',
    description: 'Собрать кофе с каждого континента, где он растёт.',
    color: { bg: '#e8f5e9', br: '#a5d6a7', txt: '#1b5e20' },
    earned: (m) => Boolean(m.hasAllCoffeeContinents),
    progress: (m) => countProgress(m.continents, 5),
  },
  {
    id: 'africa_explorer',
    icon: resolveAchievementIcon('africa_explorer'),
    emoji: '🌍',
    title: 'Африканский исследователь',
    description: 'Попробовать кофе минимум из 5 африканских стран.',
    color: { bg: '#fbe9e7', br: '#ffab91', txt: '#bf360c' },
    earned: (m) => metricCount(m.africanCountries) >= 5,
    progress: (m) => countProgress(m.africanCountries, 5),
  },
  {
    id: 'latin_gourmet',
    icon: resolveAchievementIcon('latin_gourmet'),
    emoji: '🌎',
    title: 'Латиноамериканский гурман',
    description: 'Попробовать кофе из 5 стран Латинской Америки.',
    color: { bg: '#f1f8e9', br: '#c5e1a5', txt: '#33691e' },
    earned: (m) => metricCount(m.latinCountries) >= 5,
    progress: (m) => countProgress(m.latinCountries, 5),
  },
  {
    id: 'asia_collector',
    icon: resolveAchievementIcon('asia_collector'),
    emoji: '🌏',
    title: 'Азиатский коллекционер',
    description: 'Попробовать кофе из 3 азиатских стран.',
    color: { bg: '#e0f7fa', br: '#80deea', txt: '#006064' },
    earned: (m) => metricCount(m.asianCountries) >= 3,
    progress: (m) => countProgress(m.asianCountries, 3),
  },
  {
    id: 'island_hunter',
    icon: resolveAchievementIcon('island_hunter'),
    emoji: '🏝️',
    title: 'Архипелаговый искатель',
    description: 'Попробовать кофе с островов.',
    color: { bg: '#fff0f6', br: '#f8bbd0', txt: '#ad1457' },
    earned: (m) => metricCount(m.islandCountries) >= 3,
    progress: (m) => countProgress(m.islandCountries, 3),
  },
  {
    id: 'ethiopia_tracker',
    icon: resolveAchievementIcon('ethiopia_tracker'),
    emoji: '🇪🇹',
    title: 'Эфиопский следопыт',
    description: 'Попробовать кофе из 3 разных регионов Эфиопии.',
    color: { bg: '#f1f8ff', br: '#bbdefb', txt: '#0d47a1' },
    earned: (m) => metricCount(m.ethiopiaRegions) >= 3,
    progress: (m) => countProgress(m.ethiopiaRegions, 3),
  },
  {
    id: 'colombia_tracker',
    icon: resolveAchievementIcon('colombia_tracker'),
    emoji: '🇨🇴',
    title: 'Колумбийский трекер',
    description: 'Собрать кофе из 3 зон Колумбии.',
    color: { bg: '#fff8e1', br: '#ffe082', txt: '#ff6f00' },
    earned: (m) => metricCount(m.colombiaRegions) >= 3,
    progress: (m) => countProgress(m.colombiaRegions, 3),
  },
  {
    id: 'deep_dive',
    icon: resolveAchievementIcon('deep_dive'),
    emoji: '📍',
    title: 'Глубокое погружение',
    description: 'Попробовать кофе из 5 регионов в одной стране.',
    color: { bg: '#ede7f6', br: '#b39ddb', txt: '#311b92' },
    earned: (m) => Number(m.maxRegionsInCountry) >= 5,
    progress: (m) => countProgress(m.maxRegionsInCountry, 5),
  },
  {
    id: 'regional_champion',
    icon: resolveAchievementIcon('regional_champion'),
    emoji: '🏆',
    title: 'Региональный чемпион',
    description: 'Попробовать кофе из 15+ уникальных регионов.',
    color: { bg: '#fff3f0', br: '#ffab91', txt: '#bf360c' },
    earned: (m) => Number(m.uniqueRegions) >= 15,
    progress: (m) => countProgress(m.uniqueRegions, 15),
  },
  {
    id: 'washed_master',
    icon: resolveAchievementIcon('washed_master'),
    emoji: '💧',
    title: 'Мытый мастер',
    description: 'Попробовать 5 сортов мытой обработки.',
    color: { bg: '#e0f2f1', br: '#80cbc4', txt: '#004d40' },
    earned: (m) => Number(m.washedCount) >= 5,
    progress: (m) => countProgress(m.washedCount, 5),
  },
  {
    id: 'natural_gourmet',
    icon: resolveAchievementIcon('natural_gourmet'),
    emoji: '☀️',
    title: 'Сухой гурман',
    description: 'Попробовать 5 сортов натуральной обработки.',
    color: { bg: '#fff8e1', br: '#ffe0b2', txt: '#e65100' },
    earned: (m) => Number(m.naturalCount) >= 5,
    progress: (m) => countProgress(m.naturalCount, 5),
  },
  {
    id: 'experimenter',
    icon: resolveAchievementIcon('experimenter'),
    emoji: '⚗️',
    title: 'Экспериментатор',
    description: 'Попробовать honey, anaerobic и carbonic maceration.',
    color: { bg: '#edeefc', br: '#c5cae9', txt: '#283593' },
    earned: (m) => Boolean(m.hasHoney && m.hasAnaerobic && m.hasCarbonic),
    progress: (m) => multiFlagProgress([m.hasHoney, m.hasAnaerobic, m.hasCarbonic]),
  },
  {
    id: 'fermentation_maniac',
    icon: resolveAchievementIcon('fermentation_maniac'),
    emoji: '🧪',
    title: 'Ферментационный маньяк',
    description: 'Попробовать 5+ экспериментальных методов обработки.',
    color: { bg: '#f3e5f5', br: '#ce93d8', txt: '#6a1b9a' },
    earned: (m) => metricCount(m.experimentalMethods) >= 5,
    progress: (m) => countProgress(m.experimentalMethods, 5),
  },
  {
    id: 'industrial_romantic',
    icon: resolveAchievementIcon('industrial_romantic'),
    emoji: '🏭',
    title: 'Промышленный романтик',
    description: 'Попробовать rare washed и honey с геопривязкой.',
    color: { bg: '#f1f8e9', br: '#aed581', txt: '#33691e' },
    earned: (m) => Boolean(m.geotagWashed && m.geotagHoney),
    progress: (m) => multiFlagProgress([m.geotagWashed, m.geotagHoney]),
  },
  {
    id: 'filter_geek',
    icon: resolveAchievementIcon('filter_geek'),
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
    icon: resolveAchievementIcon('multi_brew'),
    emoji: '🌀',
    title: 'Мульти-брю',
    description: 'Попробовать хотя бы 5 разных способов заварки.',
    color: { bg: '#f9fbe7', br: '#dce775', txt: '#827717' },
    earned: (m) => metricCount(m.brewMethods) >= 5,
    progress: (m) => countProgress(m.brewMethods, 5),
  },
  {
    id: 'espresso_master',
    icon: resolveAchievementIcon('espresso_master'),
    emoji: '🍵',
    title: 'Эспрессо-мастер',
    description: 'Попробовать эспрессо в 5 разных городах.',
    color: { bg: '#fff3e0', br: '#ffb74d', txt: '#e65100' },
    earned: (m) => metricCount(m.espressoCities) >= 5,
    progress: (m) => countProgress(m.espressoCities, 5),
  },
  {
    id: 'local_patriot',
    icon: resolveAchievementIcon('local_patriot'),
    emoji: '🏘️',
    title: 'Локальный патриот',
    description: 'Попробовать кофе от 3 обжарщиков из своего города.',
    color: { bg: '#f1f8e9', br: '#dcedc8', txt: '#33691e' },
    earned: (m) => Number(m.roastersInHomeCity) >= 3,
    progress: (m) => countProgress(m.roastersInHomeCity, 3),
  },
  {
    id: 'international_roasters',
    icon: resolveAchievementIcon('international_roasters'),
    emoji: '🌐',
    title: 'Интернациональный сет',
    description: 'Попробовать кофе от обжарщиков из 5 разных стран.',
    color: { bg: '#e0f2f1', br: '#80cbc4', txt: '#004d40' },
    earned: (m) => metricCount(m.roasterCountries) >= 5,
    progress: (m) => countProgress(m.roasterCountries, 5),
  },
  {
    id: 'home_barista',
    icon: resolveAchievementIcon('home_barista'),
    emoji: '🏠',
    title: 'Домашний бариста',
    description: 'Выпить 10 чашек дома.',
    color: { bg: '#fff8e1', br: '#ffe0b2', txt: '#ef6c00' },
    earned: (m) => Number(m.homeCups) >= 10,
    progress: (m) => countProgress(m.homeCups, 10),
  },
  {
    id: 'coffee_tourist',
    icon: resolveAchievementIcon('coffee_tourist'),
    emoji: '🧳',
    title: 'Кофейный турист',
    description: 'Попробовать кофе в 5 разных городах.',
    color: { bg: '#e3f2fd', br: '#90caf9', txt: '#1565c0' },
    earned: (m) => metricCount(m.consumedCities) >= 5,
    progress: (m) => countProgress(m.consumedCities, 5),
  },
  {
    id: 'cafe_explorer',
    icon: resolveAchievementIcon('cafe_explorer'),
    emoji: '🏛️',
    title: 'Кафейный исследователь',
    description: 'Посетить 10 уникальных кофеен.',
    color: { bg: '#fce4ec', br: '#f48fb1', txt: '#880e4f' },
    earned: (m) => metricCount(m.cafes) >= 10,
    progress: (m) => countProgress(m.cafes, 10),
  },
];

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

export function renderAchievements(metrics) {
  const el = document.getElementById('achievements');
  const container = el?.closest('[data-achievements-panel]');
  const root = container?.closest('[data-achievements-root]');
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

  const closed = evaluated.filter((achievement) => achievement.earned);
  const latestClosed = closed
    .sort((a, b) => b.originalIndex - a.originalIndex)
    .slice(0, 2);
  const opened = evaluated.filter((achievement) => !achievement.earned);
  const selected = [...latestClosed, ...opened];

  if (!selected.length) {
    el.innerHTML = '';
    if (root) root.hidden = true;
    return;
  }
  if (root) root.hidden = false;

  el.innerHTML = selected.map((achievement) => {
    const progressPercent = Math.round(achievement.progress * 100);
    const requirementText = achievement.earned
      ? 'Закрыто'
      : `Для закрытия: ${achievement.description || 'Выполните условия очивки.'}`;
    const dependency = achievement.requires ? lookup.get(achievement.requires) : null;
    const dependencyText = (dependency && !dependency.earned && !achievement.earned)
      ? ` Сначала закройте «${dependency.title}».`
      : '';
    const ariaParts = [achievement.title, requirementText];
    const aria = ariaParts.join(' ');
    const styleValue = `--ach-bg:${achievement.color.bg};--ach-border:${achievement.color.br};--ach-text:${achievement.color.txt};--ach-progress:${achievement.progress.toFixed(3)}`;
    const style = ` style="${escapeAttr(styleValue)}"`;
    const cls = ['ach-badge'];
    if (achievement.earned) cls.push('is-earned');
    const iconHtmlParts = [];
    if (achievement.icon) {
      const hasFallback = Boolean(achievement.emoji);
      const fallbackAttr = hasFallback ? ' data-fallback="true"' : '';
      iconHtmlParts.push(`
          <img class="ach-icon-image" src="${escapeAttr(achievement.icon)}" alt="" width="128" height="128" loading="lazy" decoding="async"${fallbackAttr}>
        `.trim());
    }
    if (achievement.emoji) {
      const fallbackCls = ['ach-icon-emoji'];
      if (achievement.icon) fallbackCls.push('ach-icon-emoji--fallback');
      const hiddenAttr = achievement.icon ? ' hidden' : '';
      iconHtmlParts.push(`<span class="${fallbackCls.join(' ')}"${hiddenAttr}>${escapeHtml(achievement.emoji)}</span>`);
    }
    const iconHtml = iconHtmlParts.length ? iconHtmlParts.join('') : '<span class="ach-icon-emoji">🏆</span>';
    const statusText = achievement.earned ? 'Закрыта' : 'Открыта';
    return `
      <div class="${cls.join(' ')}" role="listitem"${style} tabindex="0" aria-label="${escapeAttr(aria)}">
        <span class="ach-icon" aria-hidden="true">
          ${iconHtml}
        </span>
        <div class="ach-content">
          <div class="ach-header">
            <span class="ach-title">${escapeHtml(achievement.title)}</span>
            <span class="ach-status">${escapeHtml(statusText)}</span>
          </div>
          <div class="ach-bar" aria-hidden="true">
            <span class="ach-bar-fill"></span>
          </div>
          <p class="ach-requirement">${escapeHtml(requirementText + dependencyText)}</p>
          <span class="sr-only">Прогресс ${progressPercent}%</span>
        </div>
      </div>
    `;
  }).join('');

  setupAchievementIcons(el);
}

function syncControlState(input) {
  const wrapper = input.closest('.filter-control');
  if (!wrapper) return;
  wrapper.dataset.checked = input.checked ? 'true' : 'false';
}

export function setupFiltersMenu({ mapController } = {}) {
  if (!mapController) return;
  const root = document.getElementById('filtersMenu');
  if (!root) return;

  const inputs = Array.from(root.querySelectorAll('input'));
  inputs.forEach((input) => {
    syncControlState(input);
    input.addEventListener('change', () => {
      syncControlState(input);
      const { name, type, value, checked } = input;
      if (type === 'radio' && !checked) return;
      switch (name) {
        case 'viewMode':
          mapController.setViewMode(value === 'points' ? 'points' : 'cities');
          break;
        case 'showRoutes':
          mapController.setRoutesVisibility(checked);
          break;
        case 'showCountries':
          mapController.setCountriesVisibility(checked);
          break;
        case 'enable3d':
          mapController.set3DLayersEnabled(checked);
          break;
        default:
          break;
      }
    }, { passive: true });
  });

  // Ensure map reflects initial control state when mounted
  const viewControl = inputs.find((input) => input.name === 'viewMode' && input.checked);
  if (viewControl) {
    mapController.setViewMode(viewControl.value === 'points' ? 'points' : 'cities');
  }
  const routesControl = inputs.find((input) => input.name === 'showRoutes');
  if (routesControl) mapController.setRoutesVisibility(routesControl.checked);
  const countriesControl = inputs.find((input) => input.name === 'showCountries');
  if (countriesControl) mapController.setCountriesVisibility(countriesControl.checked);
  const terrainControl = inputs.find((input) => input.name === 'enable3d');
  if (terrainControl) mapController.set3DLayersEnabled(terrainControl.checked);
}

const TOOLTIP_VIEWPORT_GAP = 16;

function setupAchievementIcons(root) {
  if (!root || typeof document === 'undefined') return;
  const images = root.querySelectorAll('.ach-icon-image[data-fallback="true"]');
  images.forEach((img) => {
    const fallback = img.nextElementSibling;
    if (!fallback || !fallback.classList.contains('ach-icon-emoji--fallback')) return;

    const showFallback = () => {
      fallback.hidden = false;
      img.remove();
    };

    if (img.complete) {
      if (img.naturalWidth === 0) {
        showFallback();
        return;
      }
    }

    img.addEventListener('error', showFallback, { once: true });
  });
}

function setupAchievementTooltips(root) {
  if (!root || typeof window === 'undefined' || typeof document === 'undefined') return;
  const badges = root.querySelectorAll('.ach-badge');
  badges.forEach((badge) => {
    const tooltip = badge.querySelector('.ach-tooltip');
    if (!tooltip) return;

    let rafId = 0;
    let resizeHandler = null;
    let hideTimeout = 0;

    const clearHideTimeout = () => {
      if (hideTimeout) {
        window.clearTimeout(hideTimeout);
        hideTimeout = 0;
      }
    };

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
      clearHideTimeout();
      badge.style.removeProperty('--ach-tooltip-shift');
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
    };

    const showTooltip = () => {
      clearHideTimeout();
      badge.classList.add('is-tooltip-active');
      scheduleApply();
    };

    const hideTooltip = () => {
      clearHideTimeout();
      badge.classList.remove('is-tooltip-active');
      resetShift();
    };


    const hideTooltipDelayed = () => {
      clearHideTimeout();
      hideTimeout = window.setTimeout(() => {
        hideTimeout = 0;
        hideTooltip();
      }, 2000);
    };
    badge.addEventListener('pointerenter', showTooltip);
    badge.addEventListener('focus', showTooltip);
    badge.addEventListener('pointerleave', hideTooltip);
    badge.addEventListener('blur', hideTooltip);
    badge.addEventListener('touchstart', showTooltip, { passive: true });
    badge.addEventListener('touchend', hideTooltipDelayed, { passive: true });
    badge.addEventListener('touchcancel', hideTooltip, { passive: true });
  });
}
