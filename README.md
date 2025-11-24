# .github.io
Coffeemap-mapbox-googleshhets

## Structure
- `index.html` – main entry point
- `css/style.css` – extracted styles
- `js/app.js` – extracted scripts
- `js/static-dataset.js` – статичная выборка данных (генерируется скриптом)
- `data/coffee-log.csv` – экспорт исходной таблицы Google Sheets
- `scripts/build-static-data.mjs` – генератор `static-dataset.js`

## Подключение Google Sheets напрямую

Приложение может тянуть данные прямо из опубликованной таблицы, чтобы не держать CSV в репозитории.

1. Откройте таблицу в Google Sheets и включите общий доступ «У кого есть ссылка».
2. В `index.html` пропишите идентификатор таблицы (и при необходимости `gid` листа) в мета-тегах:
   ```html
   <meta name="google-sheet-id" content="ВАШ_ID" />
   <meta name="google-sheet-gid" content="0" />
   ```
3. Альтернатива без правки файлов — передать URL или параметры в строке запроса:
   - `?sheetId=...&gid=0` для `https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<gid>`
   - `?csv=<полный_URL>` если таблица уже опубликована как CSV.

Если конфигурация отсутствует или загрузка таблицы недоступна, приложение автоматически использует собранный статичный набор `js/static-dataset.js`.
