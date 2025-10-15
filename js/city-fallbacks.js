import { normalizeName } from './utils.js';

const RAW_FALLBACKS = [
  {
    names: ['Belgrade', 'Белград'],
    lng: 20.456897,
    lat: 44.817813,
    countryCode: 'RS',
    countryName: 'Serbia',
  },
  {
    names: ['Moscow', 'Москва'],
    lng: 37.617494,
    lat: 55.750446,
    countryCode: 'RU',
    countryName: 'Russia',
  },
  {
    names: ['Tbilisi', 'Тбилиси'],
    lng: 44.827096,
    lat: 41.715137,
    countryCode: 'GE',
    countryName: 'Georgia',
  },
  {
    names: ['Rome', 'Roma'],
    lng: 12.496366,
    lat: 41.902782,
    countryCode: 'IT',
    countryName: 'Italy',
  },
  {
    names: ['Florence', 'Firenze'],
    lng: 11.255814,
    lat: 43.769562,
    countryCode: 'IT',
    countryName: 'Italy',
  },
  {
    names: ['Istanbul', 'İstanbul'],
    lng: 28.978359,
    lat: 41.008238,
    countryCode: 'TR',
    countryName: 'Turkey',
  },
  {
    names: ['Ижевск', 'Izhevsk'],
    lng: 53.193783,
    lat: 56.852676,
    countryCode: 'RU',
    countryName: 'Russia',
  },
];

function buildFallbackMap() {
  const map = {};
  for (const entry of RAW_FALLBACKS) {
    const point = {
      lng: entry.lng,
      lat: entry.lat,
      countryCode: entry.countryCode,
      countryName: entry.countryName,
    };
    for (const name of entry.names) {
      const normalized = normalizeName(name).toLowerCase();
      if (normalized) {
        map[normalized] = point;
      }
    }
  }
  return map;
}

export const CITY_COORD_FALLBACKS = buildFallbackMap();

export function getFallbackForCity(name) {
  const normalized = normalizeName(name).toLowerCase();
  if (!normalized) return null;
  return CITY_COORD_FALLBACKS[normalized] || null;
}
