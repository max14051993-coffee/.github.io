# .github.io
Coffeemap-mapbox-googleshhets

## Structure
- `index.html` – main entry point
- `css/style.css` – extracted styles
- `js/app.js` – extracted scripts
- `js/data-loader.js` – runtime loader with prebuilt JSON + CSV fallback
- `scripts/build-dataset.mjs` – offline/prebuild dataset generator
- `data/dataset.json` – prebuilt dataset consumed by browser

## Prebuilt JSON pipeline (recommended)

Теперь приложение сначала пытается загрузить готовый `data/dataset.json`.
Если файл валиден, клиент использует его напрямую и **не запускает** runtime CSV parser и `geocodeCities()`.

### Сгенерировать `dataset.json`

```bash
node scripts/build-dataset.mjs
```

Пример с явным CSV URL:

```bash
node scripts/build-dataset.mjs --csvUrl "https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=0"
```

Пример с Google Sheet params и токеном Mapbox:

```bash
MAPBOX_TOKEN="<token>" node scripts/build-dataset.mjs --sheetId "<ID>" --gid 0 --out data/dataset.json
```

### Как обновлять при изменении таблицы

1. Обновите строки в Google Sheets.
2. Перегенерируйте dataset:
   ```bash
   node scripts/build-dataset.mjs --sheetId "<ID>" --gid 0
   ```
3. Закоммитьте обновлённый `data/dataset.json`.

## CSV fallback (backward compatible)

Если `data/dataset.json` отсутствует, недоступен или не проходит валидацию,
приложение автоматически переключается на старый runtime путь:
1) загрузка CSV,
2) парсинг CSV в браузере,
3) построение supplemental структур и geocoding.

Совместимость URL-параметров сохранена:
- `?sheetId=...&gid=...`
- `?csv=<url>`
- `?sheetName=...`

Дополнительно можно указать prebuilt URL:
- `?dataset=/data/dataset.json`
- `?prebuilt=/data/dataset.json`
- `?dataset=off` (принудительно отключить prebuilt и использовать CSV)

## Подключение Google Sheets напрямую

Приложение может тянуть данные прямо из опубликованной таблицы, чтобы не держать CSV в репозитории.

1. Откройте таблицу в Google Sheets и включите общий доступ «У кого есть ссылка».
2. В `index.html` по умолчанию уже прописана опубликованная таблица:
   ```html
   <meta name="google-sheet-id" content="1D87usuWeFvUv9ejZ5igywlncq604b5hoRLFkZ9cjigw" />
   <meta name="google-sheet-gid" content="0" />
   ```
3. Альтернатива без правки файлов — передать URL или параметры в строке запроса:
   - `?sheetId=...&gid=0` для `https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<gid>`
   - `?csv=<полный_URL>` если таблица уже опубликована как CSV.

## Проверки

Базовые smoke/e2e проверки:

```bash
npx playwright test tests/data-loader.prebuilt.spec.ts
```

## Аудит UX/производительности
- Подробные рекомендации по мобильной UX и производительности: `MOBILE_UX_PERF_RECOMMENDATIONS.md`.
