# Learn Helper

Learn Helper - сервис для подготовки и изучения учебных материалов. Пользователь загружает PDF, TXT или Markdown, backend преобразует материал в Markdown, собирает mdBook, а frontend открывает готовую книгу с AI-помощником, конспектами, самопроверкой и озвучкой.

## Возможности

- библиотека загруженных материалов;
- сборка PDF/TXT/Markdown в mdBook;
- чтение книги внутри приложения;
- автоматический краткий конспект в конце каждого раздела;
- серверный и браузерный кэш конспектов;
- генерация вопросов для самопроверки по разделу, нескольким разделам или главе;
- интерактивный тренажер: тесты, практическое задание, открытый вопрос;
- AI-проверка пользовательских ответов;
- чат-помощник;
- TTS-озвучка раздела с постепенной генерацией аудио по небольшим фрагментам;
- подсветка текущих слов при озвучке, автоскролл, изменение скорости, скачивание WAV;
- простая password-auth защита через `AUTH_PASSWORD`.

## Архитектура

- `frontend` - Next.js приложение, открывает библиотеку, mdBook и тренажер.
- `backend` - Express + TypeScript API для загрузки файлов, сборки книг, AI-запросов и хранения кэшей.
- `tts` - FastAPI сервис озвучки на Silero TTS.
- `deploy/nginx.conf` - nginx-прокси для frontend, backend и TTS.

## Пайплайн сборки книги

1. Frontend загружает `.pdf`, `.txt`, `.md` или `.markdown` в `/api/sources`.
2. Backend сохраняет файл в `backend/data/sources`.
3. `/api/books/generate` или `/api/books/open` запускает подготовку книги.
4. PDF конвертируется:
   - сначала через `pdf2md`, если он доступен;
   - иначе через `pdftotext -layout`;
   - если доступен `pandoc`, результат дополнительно нормализуется в GFM Markdown.
5. Конвертер чистит служебные колонтитулы и не должен принимать верхние заголовки страницы за начало нового раздела.
6. `BookService` разбивает Markdown по заголовкам, создает `SUMMARY.md`, `book.toml` и helper-скрипты.
7. `mdbook build` генерирует HTML-книгу.
8. Frontend открывает готовую книгу в iframe.

OCR для сканированных PDF пока не реализован.

## Зависимости

Node.js зависимости:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Python/TTS зависимости:

```bash
cd tts
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Системные CLI:

```bash
mdbook --version
pdftotext -v
pandoc --version
```

`pdf2md` опционален. Для PDF достаточно `pdftotext`; `pandoc` улучшает нормализацию Markdown.

Если backend запускается из systemd и не видит `mdbook`, укажите полный путь:

```bash
MDBOOK_BIN=/home/aleksandr/.cargo/bin/mdbook
```

## AI-настройки

Поддерживаются OpenAI-compatible API и Gemini CLI.

Основные переменные окружения backend:

```bash
AUTH_PASSWORD=...
AI_PROVIDER=gemini-cli
GEMINI_BIN=gemini
GEMINI_MODEL=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
MDBOOK_BIN=/home/aleksandr/.cargo/bin/mdbook
```

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

TTS:

```bash
cd tts
.venv/bin/python main.py
```

По умолчанию:

- frontend: `http://127.0.0.1:3000`;
- backend: `http://127.0.0.1:4173`;
- TTS: `http://127.0.0.1:8000`.

## Проверка

```bash
cd backend && npm run build
cd ../frontend && npm run lint
```

## Данные

- исходники: `backend/data/sources`;
- собранные книги: `backend/data/books`;
- кэш конспектов: `backend/data/books/<bookId>/cache/section-summaries`;
- прогресс: `backend/data/progress-db.json`;
- браузерный кэш TTS: IndexedDB `learn-helper-tts`.

## Ограничения

- OCR для сканов не реализован;
- TTS генерирует аудио небольшими частями, но сам сервис `/api/tts` пока возвращает один WAV на один небольшой запрос;
- точность подсветки слов зависит от эвристических timecodes TTS;
- качество разбиения PDF зависит от текстового слоя и верстки документа.
