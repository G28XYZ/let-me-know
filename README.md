# Learn Helper

Сервис для подготовки учебных материалов: пользователь загружает исходник, backend конвертирует его в Markdown, собирает mdBook и frontend показывает готовую книгу.

## Текущий пайплайн

1. Frontend загружает `.pdf`, `.txt`, `.md` или `.markdown` в `/api/sources`.
2. Backend сохраняет файл в `backend/data/sources`.
3. `/api/books/generate` запускает конвертацию в Markdown:
   - Markdown-файлы используются напрямую;
   - TXT нормализуется в простой Markdown;
   - PDF сначала пробуется через `pdf2md`;
   - если `pdf2md` недоступен, PDF извлекается через `pdftotext`;
   - если установлен `pandoc`, результат `pdftotext` дополнительно нормализуется в GFM Markdown.
4. `BookService` раскладывает Markdown по главам, пишет `SUMMARY.md` и `book.toml`.
5. `mdbook build` генерирует HTML-книгу.
6. Frontend открывает готовый mdBook в iframe.

OCR для сканов пока не реализован. Его логично добавить отдельным fallback после неудачного извлечения текстового слоя из PDF.

## Зависимости окружения

Нужны Node.js-зависимости frontend/backend и системные CLI:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Для генерации книг:

```bash
mdbook --version
```

Для PDF:

```bash
pdf2md --version
pdftotext -v
pandoc --version
```

Достаточно иметь `pdf2md` или `pdftotext`; `pandoc` используется как дополнительная нормализация.

## Запуск

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

Frontend проксирует `/api/*` на backend `http://127.0.0.1:4173`.

## Что дальше

- добавить OCR fallback для сканированных PDF;
- сохранить метаданные генерации книги;
- подключить AI-самопроверку поверх уже сгенерированной структуры mdBook.
