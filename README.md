# .github.io
Coffeemap-mapbox-googleshhets

## Structure
- `index.html` – main entry point
- `css/style.css` – extracted styles
- `js/app.js` – extracted scripts
- Google Sheets задаёт единственный источник данных для карты

## Подключение Google Sheets напрямую

Приложение может тянуть данные прямо из опубликованной таблицы, чтобы не держать CSV в репозитории.

1. Откройте таблицу в Google Sheets и включите общий доступ «У кого есть ссылка».
2. В `index.html` по умолчанию уже прописана опубликованная таблица:
   ```html
   <meta name="google-sheet-id" content="1D87usuWeFvUv9ejZ5igywlncq604b5hoRLFkZ9cjigw" />
   <meta name="google-sheet-gid" content="0" />
   ```
   При необходимости замените значения на свой ID и `gid` листа.
3. Альтернатива без правки файлов — передать URL или параметры в строке запроса:
   - `?sheetId=...&gid=0` для `https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<gid>`
   - `?csv=<полный_URL>` если таблица уже опубликована как CSV.

Приложение не содержит локальных файлов с данными и работает только с опубликованной таблицей Google Sheets.
