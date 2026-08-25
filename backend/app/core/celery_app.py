import os
from celery import Celery

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
visibility_timeout = int(os.getenv("CELERY_VISIBILITY_TIMEOUT", "600"))

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
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_transport_options={"visibility_timeout": visibility_timeout},
    result_backend_transport_options={"visibility_timeout": visibility_timeout},
    worker_cancel_long_running_tasks_on_connection_loss=True,
    task_routes={
        "app.workers.judge_worker.execute_submission": {"queue": "judge_queue"},
        "app.workers.judge_worker.execute_workspace_solution": {"queue": "judge_queue"},
        "app.workers.judge_worker.execute_workspace_generator": {"queue": "judge_queue"},
    },
)

celery_app.conf.beat_schedule = {
    "reconcile-vector-indexing": {
        "task": "app.workers.ai_worker.reconcile_vector_index_task",
        "schedule": 600.0,  # 10 minutes
    }
}
