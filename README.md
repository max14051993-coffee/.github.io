# .github.io
Coffeemap-mapbox-googleshhets

## Structure
- `index.html` – main entry point
- `css/style.css` – extracted styles
- `js/app.js` – extracted scripts
- `js/photo-import.js` – модуль распознавания данных с фото и подготовки отправки в Google форму
- `js/config.js` – параметры подключения к Google форме для автозаполнения

## Фото-импорт в Google Docs/Sheets

1. Откройте страницу и загрузите фото этикетки или карточки кофе в блоке «Загрузка по фото».
2. После распознавания при необходимости отредактируйте предложенные поля.
3. Нажмите «Скопировать данные» или «Автозаполнить Google форму».

### Настройка Google формы

1. Создайте Google Form, связанную с нужной таблицей Google Sheets/Docs.
2. В режиме предзаполнения формы скопируйте значения параметров `entry.xxxxx` для требуемых вопросов.
3. Отредактируйте файл `js/config.js`:
   - Установите `enabled: true`.
   - Укажите `prefillBaseUrl` (ссылка вида `https://docs.google.com/forms/d/e/.../viewform`).
   - Заполните `entryMap`, сопоставив поля формы с ключами `coffeeName`, `roasterName`, `origin`, `process`, `brewMethod`, `notes`, `rawText`.
4. При необходимости добавьте дополнительные параметры запроса в `extraParams` (по умолчанию `usp=pp_url`).

После настройки кнопка автозаполнения откроет форму Google с уже вставленными распознанными данными.
