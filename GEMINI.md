# GEMINI.md



# Next-Gen Olympiad & Competitive Programming Platform



## Engineering, Architecture, Educational Progression, and Phased AI Development Specification



---



# 1. Project Mission



## EN



This project is a decoupled, modern informatics olympiad training platform designed to transform learning from generic problem archives into a structured, gamified, and eventually AI-guided educational journey.



To ensure stability and iterative progress, development is divided into two phases:

* **Phase 1 (Core Engine - No AI)**: Focuses on the core Single Page Application (Next.js), high-performance REST API (FastAPI), secure database structure, DMOJ judging integration, gamification (XP/levels), and teacher analytics with a manual ticketing support system.

* **Phase 2 (AI Integration - Pluggable Ollama)**: Integrates a local Ollama service for Socratic mentoring, automated code complexity auditing, and AI task recommendation. The core platform must be fully functional without Ollama.



---



## MN



Энэ төслийн зорилго нь мэдээлэлзүйн олимпиадын сургалт, алгоритмын сургалтыг сурагчийн шаталсан хөгжил, геймификаци болон дараагийн шатны хиймэл оюуны чиглүүлэгтэйгээр удирдах платформ хөгжүүлэхэд оршино.



Системийн тогтвортой байдал, хөгжүүлэлтийн шат дарааллыг хангах үүднээс төслийг хоёр үе шатанд хуваана:

* **1-р Шат (Үндсэн систем - AI-гүй)**: Next.js вэб дэлгэц, FastAPI асинхрон сервер, PostgreSQL өгөгдлийн сан, DMOJ Judge Sandbox, геймификаци (XP/цол) болон багшийн хянах самбар, гараар ажиллах тусламжийн систем.

* **2-р Шат (AI интеграци - Ollama нэмэлт)**: Систем бүрэн ажиллаж эхэлсний дараа Ollama серверийг залгаас (pluggable extension) байдлаар нэмж, сурагчийн AI чиглүүлэг, кодын Big-O шинжилгээ, бодлого санал болгох логикийг идэвхжүүлнэ.



---



# 2. Core Engineering Principle



## EN



We utilize a **decoupled hybrid architecture** where the frontend is fully separated from the backend, and the judging engine runs in an isolated sandbox.



* **Frontend**: Next.js (React, TypeScript, TailwindCSS, shadcn/ui) for a premium user experience.

* **Backend**: FastAPI (Python) for robust, high-performance, asynchronous REST APIs.

* **Database**: PostgreSQL for transactional consistency + Redis for task queues, caching, and websocket events.

* **Judging Sandbox**: Reuse `dmoj-judge` (judge-tier3) and the DMOJ bridge.

* **AI Core (Phase 2 Extension)**: Ollama running locally as a modular service. The backend must isolate all AI-related features using feature-flags and modular service files so that the app starts and runs without any Ollama dependency.



---



## MN



Системийн аюулгүй байдал, хурд болон AI интеграцийг төгс шийдэхийн тулд **Холимог Салгасан (Decoupled Hybrid) архитектур** ашиглана.



* **Frontend**: Next.js (React, TypeScript, TailwindCSS, shadcn/ui) - сурагчийн дэлгэц, анимаци.

* **Backend**: FastAPI (Python) - асинхрон REST API сервер.

* **Database**: PostgreSQL + Redis (queue, кэш, websocket).

* **Judging Sandbox**: DMOJ-ийн `dmoj-judge` болон `bridge` сервисийг ашиглана.

* **AI Core (2-р шатны нэмэлт)**: Ollama нь модуль байдлаар залгагдах ба Backend нь AI функцийг feature-flag ашиглан идэвхгүй болгох боломжтой байна. AI-гүйгээр систем бүрэн ажиллана.



---



# 3. Required Services & Docker Deployment



## EN



The platform composition is configured via Docker Compose. The Ollama service is omitted or disabled by default in Phase 1:



```bash

docker compose up -d

```



### Phase 1 Core Services:

```text

1. nextjs       - Frontend single page application (port 3000)

2. fastapi      - Backend REST API gateway (port 8000)

3. db           - PostgreSQL database

4. redis        - Caching and celery task queuing

5. bridge       - DMOJ Judge communication server

6. judge-tier3  - DMOJ Sandbox execution engine

7. nginx        - Reverse proxy and media server (port 80)

```



### Phase 2 Extension Services:

```text

8. ollama       - Local LLM engine hosting custom model (Added as an optional container)

```



---



## MN



Системийг Docker Compose ашиглан ажиллуулах бөгөөд 1-р шатанд Ollama сервисийг идэвхгүй болгож ажиллуулна:



### 1-р Шатны Үндсэн Сервисүүд:

```text

1. nextjs       - Frontend вэб аппликэйшн (port 3000)

2. fastapi      - Backend API сервер (port 8000)

3. db           - PostgreSQL өгөгдлийн сан

4. redis        - Кеш болон даалгаврын дараалал

5. bridge       - Judge холболтын сервер

6. judge-tier3  - Бодлого шалгах Sandbox

7. nginx        - Урсгал чиглүүлэгч reverse proxy (port 80)

```



### 2-р Шатны Нэмэлт Сервис:

```text

8. ollama       - Локал хиймэл оюуны мотор (Шаардлагатай үед нэмэлтээр залгаж ажиллуулна)

```



---



# 4. Repository Structure



## EN



```text

olympiad-platform/

│

├── GEMINI.md

├── README.md

├── docker-compose.yml

├── .env

├── .env.example

│

├── frontend/                  # Next.js SPA

│   ├── src/

│   │   ├── components/        # shadcn/ui widgets

│   │   ├── pages/

│   │   └── styles/            # Tailwind CSS

│   ├── package.json

│   └── Dockerfile

│

├── backend/                   # FastAPI Server

│   ├── app/

│   │   ├── api/               # Router endpoints (v1)

│   │   ├── core/              # Config, Security, Feature Flags

│   │   ├── models/            # SQLAlchemy / SQLModel models

│   │   ├── services/          # Grading, Analytics, and pluggable AI services

│   │   └── main.py

│   ├── requirements.txt

│   └── Dockerfile

│

├── judge/                     # DMOJ Judge Core

│   ├── bridge/

│   └── judge-tier3/

│

├── config/

│   ├── nginx/

│   └── postgres/

│

├── problems/                  # Portable Problem assets

│   ├── public/

│   └── private/

│

└── backups/

```



---



## MN



```text

olympiad-platform/

│

├── GEMINI.md

├── frontend/                  # Next.js SPA (React + TypeScript)

├── backend/                   # FastAPI (Python) - AI-гүй эхэлж ажиллах боломжтой

├── judge/                     # DMOJ Judge & Bridge

├── config/                    # Сервисүүдийн тохиргоо (Nginx, DB)

├── problems/                  # Бодлогын сан (portable ZIP, statements, tests)

└── backups/                   # Нөөцлөлт хавтас

```



---



# 5. Database Schema & Models (PostgreSQL)



## EN



Educational progression and gamification schemas are stored inside PostgreSQL:



1. **Problem & Data**:

   * `Problem`: code, name, statement_markdown, statement_pdf_path, time_limit, memory_limit.

   * `TestCase`: problem_id, input_path, output_path, points, order.

2. **Progression System**:

   * `StudentLevel`: name, min_xp, required_solved, order, color.

   * `StudentProgress`: user_id, current_level_id, total_xp, solved_count, current_streak, highest_streak, last_active_date.

   * `TopicMastery`: progress_id, topic_slug, mastery_percentage, solved_count, attempted_count.

3. **Gamification**:

   * `Achievement`: code, title, description, icon, xp_bonus.

   * `UserAchievement`: user_id, achievement_id, unlocked_at.

   * `World` & `Stage`: world_slug, stage_slug, order, required_level_id, boss_problem_id.

   * `StageProblem`: stage_id, problem_id, is_required, order.



---



## MN



Өгөгдлийн сангийн хүснэгтүүдийг дараах байдлаар хуваан хадгална:



1. **Бодлого & Дата**:

   * `Problem`: код, нэр, өгүүлбэр, PDF зам, цаг болон санах ойн хязгаарлалт.

   * `TestCase`: бодлогын id, оролт, гаралт, оноо, дараалал.

2. **Шаталсан Систем**:

   * `StudentLevel`: нэр, шаардагдах XP, бодох бодлогын тоо, өнгө.

   * `StudentProgress`: хэрэглэгчийн id, одоогийн түвшин, нийт XP, бодсон тоо, streak, хамгийн сүүлд идэвхтэй байсан огноо.

   * `TopicMastery`: алгоритмын сэдэв бүр дээрх эзэмшилтийн хувь (mastery %).

3. **Геймификаци**:

   * `Achievement`: тэмдэгний код, гарчиг, тайлбар, икон, XP бонус.

   * `World` & `Stage`: Duolingo маягаар суралцах ертөнц, шатууд, шат бүрийн Boss бодлого.

   * `StageProblem`: тухайн шатанд бодох ёстой бодлогын дараалал.



---



# 6. Pluggable AI Integration Architecture (Phase 2 Extension)



## EN



In Phase 2, the local LLM architecture uses Ollama container to host a fine-tuned model (e.g., custom fine-tuned Llama-3 or Codellama model with a specialized system prompt).



### Pluggable System Configuration

* The FastAPI backend has a configuration variable `ENABLE_AI = False` in Phase 1. All endpoints related to AI checks are bypassed or return standard mock hints.

* When `ENABLE_AI = True` in Phase 2, the FastAPI server routes traffic to the Ollama container:

  ```text

  [FastAPI Backend] ──(gRPC/REST API)──> [Ollama Container (custom model)]

  ```



### Ollama Model Definition (Modelfile):

```dockerfile

FROM codellama:7b

PARAMETER temperature 0.3

PARAMETER top_p 0.9

SYSTEM """

Чи бол Мэдээлэлзүйн Олимпиадын бэлтгэл хариуцсан AI Туслах Багш байна.

Сурагчид кодоо явуулж тусламж хүсэхэд:

1. Хэзээ ч бэлэн зөв кодыг шууд өгч болохгүй.

2. Сурагчийн логик алдааг олоход нь асуултаар чиглүүлж, Socratic аргаар заа.

3. Кодын ажиллах хугацааны хүндрэлийг (Complexity) сайжруулах зөвлөмж өгөхдөө Big-O тэмдэглэгээ ашигла.

Үргэлж Монгол хэлээр хариулж байна.

"""

```



---



## MN



2-р шатанд локал Ollama серверийг залгаас (pluggable) хэлбэрээр системтэй холбоно.



### Залгаас архитектурын тохиргоо

* FastAPI сервер нь Phase 1-д `ENABLE_AI = False` гэсэн тохиргоотой байх ба AI-тай холбоотой хүсэлтүүдийг шууд алгасах буюу бэлэн загвар хариултыг өгнө.

* Phase 2-т `ENABLE_AI = True` болгосноор Ollama контейнер луу холболт нээгдэнэ.



---



# 7. Admin Analytics & Student Support System (Core & AI Phased)



## EN



The support and monitoring system runs on a **Manual-First, AI-Second** structure:



1. **Analytics Dashboard (Next.js & FastAPI)**:

   * **Realtime Monitoring**: Active users, submissions per minute, system load.

   * **Student Progress Tracking**: Grid showing each student's current level, solved counts, daily streaks, and topic masteries.

   * **Topic Heatmap**: Visualizes which algorithms have high failure rates across the class.

2. **Teacher Portal**:

   * **Classroom Management**: Teachers group students, assign custom stages, and set deadlines.

   * **Custom Reports**: Export PDF/Excel summaries of students' solved problems, total XP earned, and active days.

3. **Student Support & Ticket Flow**:

   * **Phase 1 (Manual Ticket)**: A student can submit a support ticket when stuck. The teacher receives the ticket, views the student's submission history/source code, and writes manual hints/comments back to the student.

   * **Phase 2 (AI Hybrid Ticket)**: When the student opens a ticket, the AI assistant tries to resolve it first (Socratic mentoring chat). If the student is still stuck, the ticket is forwarded to the teacher. The teacher can see both the student's code history and the AI-student chat transcript.



---



## MN



Сурагчдыг дэмжих систем нь **Эхлээд Гараар (Manual-First), Дараа нь AI (AI-Second)** гэсэн шатлалаар ажиллана:



1. **Анализ Хянах Самбар (Admin Dashboard)**:

   * **Дундаж эзэмшилт**: Алгоритмын сэдвүүдийн дундаж эзэмшилтийг ангиар харах.

   * **Бодлогын Heatmap**: Аль сэдэв эсвэл бодлого дээр сурагчид хамгийн их гацаж (`TLE`, `WA` алдаа авч) байгааг улаан өнгөөр харуулна.

2. **Багшийн Удирдлага (Teacher Portal)**:

   * Анги үүсгэж, сурагчдыг багцлан, тодорхой хугацаатай шатууд үүсгэх ба Excel/PDF тайлан экспортлох.

3. **Сурагчийг Дэмжих Систем (Support Ticket)**:

   * **1-р Шат (Гарын Ticket)**: Сурагч гацсан үедээ багш руу тусламж хүсэх ticket нээнэ. Багш сурагчийн код, алдааны түүхийг харж, гараар шууд зөвлөгөө эсвэл чиглүүлэг өгнө.

   * **2-р Шат (AI Холимог Ticket)**: Сурагч ticket нээхэд эхлээд AI туслах харилцаж, асуудлыг шийдэхийг оролдоно. Шийдэгдэхгүй бол багш руу чиглүүлж, багш AI-тай харилцсан чатны түүх болон кодыг нэг дороос харж зөвлөгөө өгөх боломжтой байна.


# 8. AI Developer Instructions & Coding Standards (AI-д өгөх заавар)

## EN
When generating code for this project, the AI must strictly follow these rules:
1. **Frontend (Next.js)**: 
   - Use App Router (`/app` directory).
   - Use `React Query` for data fetching and caching.
   - Use `Zustand` for global state (e.g., user session, theme).
   - UI components must primarily use `shadcn/ui` and `TailwindCSS`. Do not write custom CSS unless strictly necessary.
2. **Backend (FastAPI)**:
   - Always use strong Pydantic typing and Python type hints.
   - All database operations must be asynchronous (`asyncpg` / Async SQLAlchemy).
   - Implement JWT-based Authentication. Roles include: `admin`, `teacher` (e.g., for managing course standards like BTEC IT), and `student`.
3. **Database**:
   - Use Alembic for migration management. Do not modify the database schema directly without creating an Alembic revision.
4. **Step-by-step Development**:
   - Do not attempt to build the entire system at once. Ask the user which feature to implement first.
   - Before writing code, briefly explain the proposed file structure or logic.

## MN
AI код бичихдээ дараах дүрмийг хатуу баримтална:
1. **Frontend**: Next.js App Router, өгөгдөл татахад React Query, глобал төлөвт Zustand ашиглана. UI-г shadcn/ui болон Tailwind ашиглаж хийнэ.
2. **Backend**: FastAPI дээр үргэлж Type Hint ашиглах ба баазтай харьцах үйлдэл заавал `async` байна. JWT Token ашиглан `admin`, `teacher`, `student` гэсэн эрхийн ялгаатайгаар хамгаална.
3. **Өгөгдлийн сан**: Alembic ашиглаж migration хийнэ.
4. **Хөгжүүлэлтийн явц**: Бүх кодыг нэг дор бичих гэж оролдохгүй. Хэрэглэгчээс эхлээд аль хэсгийг (жишээ нь: Auth, эсвэл Database Model) эхэлж бичихийг асууж, баталгаажуулсны дараа алхам алхмаар хөгжүүлнэ.