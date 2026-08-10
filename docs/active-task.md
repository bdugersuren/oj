# 🚀 Мэдээлэлзүйн Олимпиадын Платформ — Хөгжүүлэлтийн Идэвхтэй Даалгаврууд (Active Tasks)

Энэхүү баримт бичиг нь платформын бүх үе шатны хөгжүүлэлтийн явцыг алхам алхмаар хянах, дааалгаврын биелэлтийг тэмдэглэх зориулалттай.

> Тэмдэглэлийн тайлбар:
> - `[ ]` — Хийгдэхгүй байгаа даалгавар
> - `[/]` — Хийгдэж буй (In Progress)
> - `[x]` — Бүрэн гүйцэтгэгдсэн

---

## ✅ ШАТ 1 — FRONTEND (БҮРЭН ДУУСГАСАН)

- [x] **1-р Багц: ⌨️ Global Command Palette (`Ctrl + K`)**
  - [x] `CommandPalette` компонент, Бодлого, Онол, Хуудасруу хурдан хайлт
  - [x] Бүх хуудсанд `Ctrl+K` товчлуурт холболт (`layout.tsx`)

- [x] **2-р Багц: ⚔️ Тэмцээний Танхим & Live Scoreboard (`/contests`)**
  - [x] `/contests` — Тэмцээний архивын жагсаалт (Удахгүй, Идэвхтэй, Өнгөрсөн)
  - [x] `/contests/[id]` — Countdown Timer + Бодлогын жагсаалт + Live Standings
  - [x] `/contests/[id]/live-board` — Хувийн Дүнгийн Зурагтай Бодит Цагийн Scoreboard
  - [x] `/contests/team-arena` — Багийн ICPC Бөмбөлөгтэй Анимэйшнт Самбар

- [x] **3-р Багц: 🧠 Интерактив Алгоритм Дүрслэгч Canvas (`/visualizer`)**
  - [x] Binary Search хөдөлгөөнт анимэйшн + Play/Pause/Step/Speed

- [x] **4-р Багц: 📊 365 Өдрийн Heatmap & Skill Profile (`/profile/[username]`)**
  - [x] GitHub загварын 365 өдрийн Ногоон Heatmap + Медалийн галерей

- [x] **5-р Багц: ⚡ Testcase Visual Diff Debugger**
  - [x] Зөв/Буруу хариуг Git-diff маягаар тодотгон харьцуулах компонент

- [x] **6-р Багц: 🎮 1v1 Хурдны Дуэль Арена (`/duels`)**
  - [x] Хуваагдмал дэлгэц + Elo Rating + Ялагчийн баярын Modal

---

## ⚙️ ШАТ 2 — BACKEND: Authentication & Role Authorization

> **Зорилго:** Хэрэглэгчийн бүртгэл, нэвтрэлт, дэд эрхүүд (Admin / Teacher / Student) тохируулах

### 📁 Файлуудын бүтэц
```
backend/app/
├── core/
│   ├── config.py          ← Env vars, JWT secret, settings
│   ├── security.py        ← JWT encode/decode, bcrypt hashing
│   └── dependencies.py    ← get_current_user, require_role
├── api/v1/endpoints/
│   └── auth.py            ← POST /register, /login, /refresh, /me
└── models/
    └── user.py            ← User, Role enum
```

### Хийх даалгаврууд:
- [x] **2.1** `backend/app/core/config.py` — `pydantic-settings`, `ACCESS_TOKEN_EXPIRE_MINUTES=15`, `REFRESH_TOKEN_EXPIRE_DAYS=7`
- [x] **2.2** `backend/app/core/security.py` — `create_access_token`, `decode_token`, `generate_refresh_token`, `refresh_token_expires_at`, bcrypt hashing
- [x] **2.3** `backend/app/core/dependencies.py` — `get_current_user`, `require_role(...)` dependency factory
- [x] **2.4** `backend/app/api/v1/endpoints/auth.py` — `/register`, `/login`, `/refresh` (Token Rotation), `/logout` (Revoke), `/me` GET+PATCH
- [x] **2.5** Alembic migration `bd8659c8a8b6` — `users` INTEGER→UUID + `refresh_tokens` хүснэгт + бүх FK шилжүүлэлт
- [x] **2.6** Бүх моделиуд UUID FK-д шилжүүлэгдсэн (`progression`, `gamification`, `classroom`, `ticket`, `lesson`, `submission`)

---

## ⚙️ ШАТ 3 — BACKEND: Problem & Submission CRUD API

> **Зорилго:** Бодлого оруулах, засах, жагсаах болон сурагчийн илгээлт хадгалах API

### Хийх даалгаврууд:
- [x] **3.1** `problems.py` — Problem CRUD бүрэн (GET list+detail, POST, PUT, DELETE, Stats)
  - [x] Filter: topic, difficulty, olympiad_scope, division, search, pagination
  - [x] `GET /problems/{code}/testcases` + `POST` + `DELETE` (Teacher/Admin)
  - [x] `GET /problems/{code}/hints` + `POST` + `DELETE` (Teacher/Admin)
  - [x] `GET /problems/{code}/stats` — acceptance rate, fastest AC, status breakdown
- [x] **3.2** Testcase CRUD — DB хадгалах (input_data/output_data Text column)
  - [x] Sample testcase тус бүрт `is_sample` flag
- [x] **3.3** `submissions.py` — Submission API бүрэн
  - [x] `POST /submissions` → 202 Accepted + Celery `judge_queue`-д push
  - [x] `GET /submissions/{id}` — Polling + judge_results тус бүрт
  - [x] `GET /submissions/my/list` — Filter: problem_code, lang, status, pagination
  - [x] `GET /submissions/problem/{code}` — Teacher/Admin харах
  - [x] `GET /submissions/leaderboard/{code}` — AC хурдаар эрэмбэлэгдсэн
- [x] **3.4** `app/workers/judge_worker.py` — Celery Judge Task
  - [x] Phase 1: Mock judge (бүх TC-д AC, санамсаргүй хурд)
  - [x] Phase 2: DMOJ Bridge socket connection (ENABLE_JUDGE=true)
  - [x] XP Engine: AC дүнд XP олгох, streak шинэчлэх
  - [x] Redis Pub/Sub: `/submission:{id}` channel-д дүн broadcast

---

## ✅ ШАТ 4 — BACKEND: Classroom, Teacher Portal & Student Progress API

> **Зорилго:** Багш анги танхим удирдах, сурагчид урилгын кодоор элсэх, багш сурагчдын прогресс болон алдааны heatmap-ийг хянах

### Хийх даалгаврууд:
- [x] **4.1** `backend/app/api/v1/endpoints/classrooms.py` — Classroom CRUD
  - [x] `POST /api/v1/classrooms` — Шинэ анги үүсгэх (урилгын код автоматаар үүсэх)
  - [x] `GET /api/v1/classrooms` — Багшийн үүсгэсэн эсвэл сурагчийн элссэн ангиудын жагсаалт
  - [x] `GET /api/v1/classrooms/{id}` — Ангийн дэлгэрэнгүй, элссэн сурагчдын жагсаалт
  - [x] `POST /api/v1/classrooms/join` — Сурагч урилгын кодоор ангид элсэх
  - [x] `DELETE /api/v1/classrooms/{id}/students/{student_id}` — Сурагчийг ангиас хасах
- [x] **4.2** Classroom Analytics & Teacher Portal
  - [x] `GET /api/v1/classrooms/{id}/analytics/topic-heatmap` — Сурагчдын алдааны сэдвүүдийн heatmap
  - [x] `GET /api/v1/classrooms/{id}/analytics/topic-mastery` — Ангийн хэмжээн дэх сэдвүүдийн дундаж эзэмшилт
- [x] **4.3** `backend/app/api/v1/endpoints/progress.py` — Student Progress API
  - [x] `GET /api/v1/progress/me` — Сурагч өөрийн түвшин, XP, streak, сэдэв бүрийн эзэмшилтийг харах

---

## ✅ ШАТ 5 — DMOJ Judge Sandbox Integration (Celery Worker)

> **Зорилго:** Сурагчийн C++/Python кодыг `dmoj-judge` Sandbox-д ажиллуулж бодит цагт үр дүн авах

### Хийх даалгаврууд:
- [x] **5.1** `backend/app/workers/judge_worker.py` — Celery Task + DMOJ Client
  - [x] Celery worker-т real/mock шүүлтийн систем нэгтгэсэн (`ENABLE_JUDGE` flag)
  - [x] Бодолтын үр дүнг DB-д (`submissions` & `judge_results`) хадгалах логик
  - [x] Шүүлтийн үр дүнг Redis Pub/Sub (`submission:{id}`) сувгаар дамжуулах
- [x] **5.2** `backend/app/api/v1/endpoints/ws.py` — WebSocket Endpoint
  - [x] `WS /api/v1/ws/submissions/{submission_id}` — Redis Pub/Sub-аас дүн стрим хийх
  - [x] Шүүлт дуусахад холболтыг автоматаар хаах логик
- [x] **5.3** Docker Compose DMOJ тохиргоо
  - [x] Tier-3 runtime дээр official DMOJ judge-server-ийг build хийдэг `oj-dmoj-bridge` adapter нэмсэн
  - [x] Celery worker-ийн `ENABLE_JUDGE=true` тохиргоог bridge рүү бодит шүүлт хийдэг болгосон

---

## ✅ ШАТ 6 — MinIO Object Storage Integration

> **Зорилго:** PDF өгүүлбэр, зураг, Testcase файлуудыг MinIO-д хадгалах/татаж авах

### Хийх даалгаврууд:
- [x] **6.1** `backend/app/services/storage.py` — MinIO Client
  - [x] `upload_file(bucket, key, data)` — Файл хадгалах логик (sync-to-async wrapper)
  - [x] `get_presigned_url(bucket, key, expires=3600)` — Localhost / Docker сүлжээний орлуулалт бүхий Presigned URL
- [x] **6.2** PDF Statement upload API
  - [x] `POST /api/v1/problems/{code}/statement-pdf` — MinIO `oj-problems` bucket руу PDF хуулж DB шинэчлэх
  - [x] `GET  /api/v1/problems/{code}/statement-pdf` — Presigned URL татах холбоос авах
- [x] **6.3** Зураг (Image) upload — Teacher Editor (TipTap) ашиглах
  - [x] `POST /api/v1/upload/image` — Редакторт зориулж зураг оруулах (7 хоногийн Presigned URL буцаана)

---

## ✅ ШАТ 7 — Gamification Engine (XP, Level-Up, Streak, Achievements)

> **Зорилго:** Бодлого бодоход XP цуглуулж, цол ахиулах, Streak тоолох, Амжилт нээх автомат систем

### Хийх даалгаврууд:
- [x] **7.1** `backend/app/services/xp_engine.py` — XP Тооцоолуур
  - [x] `award_xp(user_id, amount, reason)` — XP олгох + Redis Pub/Sub (`user_progress:{id}`) event илгээх
  - [x] `check_level_up(user_id)` — Сурагчийн прогрессын дагуу дараагийн түвшин рүү автоматаар ахиулж WebSocket event цацах
- [x] **7.2** Streak Engine
  - [x] `update_streak(user_id)` — Сурагчдын идэвхтэй өдөр дараалсан Streak тоолох, тасарсан бол шинэчлэх логик
- [x] **7.3** `backend/app/services/achievement_engine.py` — Амжилт нээгч
  - [x] `check_achievements(user_id)` — Прогресс ахихад нөхцөлүүд (FIRST_AC, SOLVED_10, SOLVED_50, STREAK_7, RATING_1300)-ийг автоматаар шалгах
  - [x] Шинээр нээгдсэн амжилтуудыг `user_achievements` хүснэгтэд тэмдэглэж, `xp_bonus` олгох
- [x] **7.4** Celery Worker Integration
  - [x] Judge Worker-т submission `ACCEPTED` болоход `_award_xp()`, `_check_level_up()`, `_check_achievements()`-ийг sync хэлбэрээр дуудах логик нэгтгэсэн
  - [x] FastAPI эхлэх lifespan-д суурь амжилтуудын seed-ийг автоматаар DB-д бүртгэж ажиллуулдаг болгосон

---

## ✅ ШАТ 8 — Lesson & Theory Content API

> **Зорилго:** Онолын хичээлийн агуулга (Markdown + KaTeX + Mermaid) удирдах, Дэвшил хянах

### Хийх даалгаврууд:
- [x] **8.1** `GET  /api/v1/lessons` — Хичээлүүдийн жагсаалт (хэрэглэгчийн үзсэн төлөв `is_completed`-тэй хамт ачаална)
- [x] **8.2** `GET  /api/v1/lessons/{slug}` — Хичээлийн дэлгэрэнгүй агуулга (Quizzes болон Practice problems-той нь)
- [x] **8.3** `POST /api/v1/lessons` — Шинэ хичээл үүсгэх (Teacher/Admin)
- [x] **8.4** `POST /api/v1/lessons/{slug}/complete` — Квизийн хариулт шалгаж, `UserLessonProgress` бүртгэх
- [x] **8.5** Хичээл дуусгахад `xp_engine.award_xp()` дуудаж геймификациар дамжуулж XP олгодог болгосон

---

## ✅ ШАТ 9 — Worlds & Stage Progression API

> **Зорилго:** Duolingo замналын дагуу World, Stage, Boss Problem зохицуулах

### Хийх даалгаврууд:
- [x] **9.1** `GET  /api/v1/worlds` — World + Stage жагсаалт (Сурагчийн түвшний прогресстэй нь)
- [x] **9.2** `GET  /api/v1/worlds/{slug}/stages` — Stage бүрийн бодлого + хичээлийн жагсаалт
- [x] **9.3** Stage нээх логик — Өмнөх Stage дуусваас дараагийнх нь нээгдэх (is_locked: false)
- [x] **9.4** Lifespan эхлэх үед DB-д World 1 болон Stage 1, Stage 2-ийг үүсгэдэг seed үйлчилгээ нэмсэн

---

## ✅ ШАТ 10 — Contest & Scoreboard API

> **Зорилго:** Тэмцээн үүсгэх, Дүн бүртгэх, Бодит цагийн Scoreboard

### Хийх даалгаврууд:
- [x] **10.1** `GET  /api/v1/contests` — Тэмцээний жагсаалт
- [x] **10.2** `POST /api/v1/contests` — Шинэ тэмцээн үүсгэх (naive datetime конвертер болон бодлого холболттой)
- [x] **10.3** `GET  /api/v1/contests/{id}/standings` — Бодит цагийн Standings JSON (онооны нийлбэрээр байр эзлүүлж, адил оноонд penalty/time-аар эрэмбэлнэ)
- [x] **10.4** WebSocket Scoreboard Push — Илгээлт `AC` болоход standings-ийг Redis Pub/Sub (`contest_scoreboard:{id}`) сувгаар бодит цагт цацах логик
- [x] **10.5** WebSocket endpoints — `WS /api/v1/ws/contests/{contest_id}/scoreboard` болон `WS /api/v1/ws/users/{user_id}/progress` (хиймэл оюуны confetti-д зориулж) нэмсэн

---

## ✅ ШАТ 11 — Teacher Support Ticket API (Classroom Management)

> **Зорилго:** Сурагчдад гараар тусламж үзүүлэх Ticket систем (Socratic AI-ийн өмнөх шат)

### Хийх даалгаврууд:
- [x] **11.1** `GET  /api/v1/tickets` — Тасалбарын жагсаалт (Сурагч өөрийнхөө, Багш/Admin сурагчдын тасалбарыг харна)
- [x] **11.2** `POST /api/v1/tickets` — Сурагч бодлого болон илгээлт холбосон шинэ тасалбар нээх
- [x] **11.3** `POST /api/v1/tickets/{id}/reply` — Харилцан хариу зурвас бичих (Статус автоматаар OPEN/ANSWERED руу шилжинэ)
- [x] **11.4** `POST /api/v1/tickets/{id}/resolve` — Тасалбарыг амжилттай шийдвэрлэж RESOLVED төлөв рүү оруулан хаах
- [x] **11.5** `GET /api/v1/classrooms/{id}/export-report` — Ангийн сурагчдын тайланг Excel/Excel-д уншигдах Монгол үсэгтэй UTF-8 BOM CSV хэлбэрээр экспортлох API

---

## ✅ ШАТ 12 — Docker Compose & Nginx Production Hardening

> **Зорилго:** Үйлдвэрлэлийн орчинд бүрэн аюулгүй, хурдан ажиллах тохируулга

### Хийх даалгаврууд:
- [x] **12.1** Nginx `config/nginx/nginx.conf` — Gzip compression, worker processes auto тохируулга шалгасан
- [x] **12.2** `.env.example` — Системд шаардлагатай орчины бүх хувьсагчдын загвар бэлдсэн
- [x] **12.3** `docker-compose.yml` — Health check, restart policy, дотоод сүлжээ (oj-network) бэхжүүлсэн байдал шалгасан
- [x] **12.4** Nginx `oj.know.mn.conf` — Rate Limiting (10r/s + burst 20), Security Headers (X-Frame, X-XSS, CSP, Referrer-Policy) нэмсэн
- [x] **12.5** Үйлдвэрлэлийн орчны SSL тохируулга, портыг дотоод сүлжээнд хязгаарлах, auto-renewal cron ажиллуулах нэгдсэн удирдамж ([production_hardening_guide.md](file:///home/bd/.gemini/antigravity/brain/d4c27b4c-a43c-491e-b686-e2f5360b4cb5/production_hardening_guide.md)) гаргасан

---

## ✅ ШАТ 13 — AI (Ollama) Pluggable Extension (Phase 2)

> **Зорилго:** `ENABLE_AI=True` болгосноор Socratic AI Mentor, Big-O аудит идэвхжих

### Хийх даалгаврууд:
- [x] **13.1** `backend/app/services/ai_service.py` — Ollama HTTP асинхрон клиент
  - [x] `ENABLE_AI` Feature Flag шалгаж, идэвхгүй бол орон нутгийн mock socratic hint болон mock complexity audit харуулна
- [x] **13.2** Ollama `Modelfile` системийн prompt — Socratic чиглүүлэг болон Монгол хэлний багшийн дүрийн тохируулга нэгтгэсэн
- [x] **13.3** `POST /api/v1/ai-tutor/ask` — 3 Шатны Hint: Concept (0 XP) / EdgeCase (-5 XP) / Pseudocode (-10 XP)
  - [x] Сурагчдын XP-ээс penalty хасаж, Redis Pub/Sub (`user_progress:{id}`) ашиглан websocket stream-ээр Confetti ажиллуулахад зориулсан `XP_PENALTY` event цацна
- [x] **13.4** `POST /api/v1/ai-tutor/complexity-audit` — Сурагчийн кодын хугацаа болон санах ойн Big-O шинжилгээний API хэрэгжүүлсэн
- [x] **13.5** Ollama-д онолын материал болон бодлогын тайлбарыг суралцуулах Modelfile удирдамж бэлтгэсэн (Орон нутгийн Ollama суулгахад `ollama create oj-tutor -f Modelfile` ажиллуулах зааварчилгаа бичсэн)


---

## ⚙️ ШАТ 14 — Frontend SPA API Integration

> **Зорилго:** Frontend-ийн mock өгөгдлийг backend API болон бодит цагийн event-тэй солих.

### Хийх даалгаврууд:
- [x] **14.1** Frontend lint-ийн blocking error-уудыг зассан; typecheck амжилттай ажиллана
- [x] **14.2** Problem, testcase, submission response contract-уудыг backend schema-тай тааруулсан
- [x] **14.3** Бодлогын өгүүлбэр, sample testcase, submission history, WebSocket + polling fallback, progress/leaderboard cache refresh-ийг API-д холбосон
- [/] **14.4** Lesson, World, Contest, Ticket, Classroom/Teacher болон Profile дэлгэцүүдийн mock өгөгдлийг API-д холбох
  - [x] Lesson list, detail, quiz completion болон XP/progress cache refresh
  - [x] World, Stage болон Stage problem progress
  - [x] Contest list, detail, registration, standings болон scoreboard WebSocket
  - [x] Ticket list, detail, create, reply болон resolve
  - [x] Classroom/Teacher list, detail, analytics, create болон CSV export
  - [x] Current-user Profile progress болон topic mastery
  - [x] Public profile болон AI tutor API integration
  - [x] Individual live-board standings WebSocket
  - [ ] Team Arena (backend team model/endpoint шаардлагатай)
- [ ] **14.5** Role-based route хамгаалалт болон бүх frontend урсгалын E2E test нэмэх

## 📅 Гүйцэтгэлийн Хуваарь

| Шат | Гол ажил | Хугацааны Тооцоо | Төлөв |
|---|---|---|---|
| **ШАТ 2** | Auth & JWT | ~1 өдөр | ✅ |
| **ШАТ 3** | Problem & Submission CRUD | ~2 өдөр | ✅ |
| **ШАТ 4** | Classroom & Progress API | ~1 өдөр | ✅ |
| **ШАТ 5** | DMOJ Judge Celery Worker | ~2 өдөр | ✅ |
| **ШАТ 6** | MinIO File Storage | ~1 өдөр | ✅ |
| **ШАТ 7** | Gamification Engine | ~1 өдөр | ✅ |
| **ШАТ 8–10** | Lesson, Worlds, Contest API | ~2 өдөр | ✅ |
| **ШАТ 11** | Teacher Support Tickets | ~1 өдөр | ✅ |
| **ШАТ 12** | Docker Production Hardening | ~0.5 өдөр | ✅ |
| **ШАТ 13** | AI (Ollama) Integration | ~2 өдөр | ✅ |
| **ШАТ 14** | Frontend SPA API Integration | ~5 өдөр | ⏳ |

---

*Сүүлд шинэчлэгдсэн огноо: 2026-08-08 | Хариуцагч: Antigravity AI x Хэрэглэгч*
