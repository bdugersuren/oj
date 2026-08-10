from fastapi import APIRouter
from app.api.v1.endpoints import auth, problems, submissions, progress, tickets, lessons, ai_tutor, classrooms, ws, upload, worlds, contests, ai_curator, admin_settings, admin_users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(problems.router, prefix="/problems", tags=["Problems"])
api_router.include_router(submissions.router, prefix="/submissions", tags=["Submissions"])
api_router.include_router(progress.router, prefix="/progress", tags=["Progression & Leaderboard"])
api_router.include_router(tickets.router, prefix="/tickets", tags=["Support Tickets"])
api_router.include_router(lessons.router, prefix="/lessons", tags=["Theory Lessons & Quizzes"])
api_router.include_router(ai_tutor.router, prefix="/ai-tutor", tags=["AI Socratic Mentor"])
api_router.include_router(classrooms.router, prefix="/classrooms", tags=["Classrooms & Teacher Portal"])
api_router.include_router(ws.router, prefix="/ws", tags=["WebSockets"])
api_router.include_router(upload.router, prefix="/upload", tags=["File Uploads"])
api_router.include_router(worlds.router, prefix="/worlds", tags=["Worlds & Stage Progress"])
api_router.include_router(contests.router, prefix="/contests", tags=["Online Olympiads / Contests"])
api_router.include_router(ai_curator.router, prefix="/ai-tutor/curator", tags=["AI Training Data Curator"])
api_router.include_router(admin_settings.router, prefix="/admin/settings", tags=["Admin Settings"])
api_router.include_router(admin_users.router, prefix="/admin/users", tags=["Admin User Management"])

