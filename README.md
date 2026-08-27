# RedLava

Personal AI-powered dashboard: health & training data (Garmin, Whoop) and calendar in one place, plus an AI assistant that actually acts on your behalf (drafts emails, creates calendar events, searches your data) — instead of just summarizing it.

**Live:** https://saa-website-omega.vercel.app

## Stack

- **Frontend:** React 18 + Vite, React Router, Framer Motion, Lucide icons
- **Backend:** Express on Vercel serverless functions (`api/index.js` → `backend/app.js`)
- **AI:** Claude API (`@anthropic-ai/sdk`) — chat assistant, vision-based parsing of medical reports/photos, structured extraction (nutrition, tasks)
- **Integrations:** Google Calendar & Gmail (OAuth2), Garmin Connect, Whoop (OAuth2), Yandex.Disk

## Что это

Личный дашборд: расписание (Google Calendar), спорт (Garmin), здоровье и восстановление (Whoop), плюс ИИ-помощник, который не просто пересказывает данные, а выполняет задачи — пишет письма, создаёт события, разбирает фото анализов через Claude vision.

### Backend routes (`backend/routes/`)
`auth`, `calendar`, `gmail`, `garmin`, `whoop`, `labs`, `nutrition`, `tasks`, `history`, `sync`, `ai` — каждый инкапсулирует один внешний сервис или домен данных.

### Дизайн
Тёмная тема по умолчанию + 3 дополнительные (переключаются через `data-theme`), единая система CSS-переменных без хардкода цвета, иконки только `lucide-react`, шрифт Plus Jakarta Sans.

## Локальный запуск

```bash
# .env с ключами (см. .env.example) — не коммитится
cd backend && npm install && npm run dev     # backend, http://localhost:3001
cd frontend && npm install && npm run dev    # frontend, http://localhost:5173
```
