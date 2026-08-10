import os
from celery import Celery

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "oj_tasks",
    broker=redis_url,
    backend=redis_url,
    include=["app.workers.judge_worker", "app.workers.ai_worker"],   # Task-уудыг бүртгэх
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ulaanbaatar",
    enable_utc=True,
    task_routes={
        "app.workers.judge_worker.execute_submission": {"queue": "judge_queue"},
    },
)

celery_app.conf.beat_schedule = {
    "reconcile-vector-indexing": {
        "task": "app.workers.ai_worker.reconcile_vector_index_task",
        "schedule": 600.0,  # 10 minutes
    }
}

