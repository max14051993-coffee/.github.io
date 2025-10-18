# .github.io
Coffeemap-mapbox-googleshhets

## Structure
- `index.html` – main entry point
- `css/style.css` – extracted styles
- `js/app.js` – extracted scripts
- `js/static-dataset.js` – статичная выборка данных (генерируется скриптом)
- `data/coffee-log.csv` – экспорт исходной таблицы Google Sheets
- `scripts/build-static-data.mjs` – генератор `static-dataset.js`

## Обновление статичного набора данных

1. Обновите `data/coffee-log.csv` свежим экспортом из Google Sheets.
2. Запустите `node --experimental-modules scripts/build-static-data.mjs`.
3. Полученный файл `js/static-dataset.js` автоматически заменит предыдущую версию.
