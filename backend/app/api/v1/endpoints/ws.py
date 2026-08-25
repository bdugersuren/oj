import json
import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import redis.asyncio as aioredis

from app.core.config import settings
from app.core.security import decode_token
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.submission import Submission
from app.models.contest import Contest, ContestParticipant

router = APIRouter()
logger = logging.getLogger(__name__)


def _submission_event_payload(submission: Submission) -> dict:
    return {
        "submission_id": submission.id,
        "status": submission.status.value,
        "score": submission.score,
        "time_ms": submission.time_ms,
        "memory_kb": submission.memory_kb,
        "judge_results": [
            {
                "id": result.id,
                "testcase_id": result.testcase_id,
                "status": result.status.value,
                "time_ms": result.time_ms,
                "memory_kb": result.memory_kb,
                "output_log": result.output_log,
            }
            for result in sorted(submission.judge_results, key=lambda item: item.id)
        ],
    }


async def _websocket_user(websocket: WebSocket) -> User | None:
    """Authenticate before accept; browsers send the HttpOnly access cookie."""
    token = websocket.cookies.get("oj_access")
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type", "access") != "access" or not payload.get("sub"):
            return None
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == payload["sub"], User.is_active == True))
            return result.scalar_one_or_none()
    except JWTError:
        return None


async def _reject_unauthorized(websocket: WebSocket) -> None:
    await websocket.close(code=1008, reason="Authentication required")

@router.websocket("/submissions/{submission_id}")
async def submission_status_ws(websocket: WebSocket, submission_id: int):
    user = await _websocket_user(websocket)
    if not user:
        await _reject_unauthorized(websocket)
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Submission).where(Submission.id == submission_id))
        submission = result.scalar_one_or_none()
        if not submission or (submission.user_id != user.id and user.role.value not in ("teacher", "admin")):
            await _reject_unauthorized(websocket)
            return
    await websocket.accept()
    logger.info(f"WebSocket connected for submission: {submission_id}")

    # Redis client үүсгэх
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    
    # submission:{id} сувгийг сонсох
    channel_name = f"submission:{submission_id}"
    await pubsub.subscribe(channel_name)

    try:
        # Анхны холболт амжилттай болсныг мэдэгдэх
        await websocket.send_json({
            "status": "CONNECTED",
            "message": "Waiting for judge results..."
        })

        # Pub/Sub is intentionally subscribed before this snapshot query. If
        # grading finished before the subscription, the DB snapshot delivers
        # the final state; if it finishes afterwards, the event is queued.
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Submission)
                .options(selectinload(Submission.judge_results))
                .where(Submission.id == submission_id)
            )
            current = result.scalar_one_or_none()
        if current:
            snapshot = _submission_event_payload(current)
            await websocket.send_json(snapshot)
            if snapshot["status"] not in ("PENDING", "RUNNING"):
                return

        # Redis-ээс ирэх мессежүүдийг сонсох гол давталт
        while True:
            # Мессеж байгаа эсэхийг шалгах (timeout=1.0)
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            
            if message:
                data = json.loads(message["data"])
                logger.info(f"Received pubsub data for {submission_id}: {data}")
                
                # Frontend рүү дүн дамжуулах
                await websocket.send_json(data)
                
                # Хэрэв шүүлт дууссан бол (PENDING болон RUNNING биш) холболтыг хаана
                status = data.get("status")
                if status not in ("PENDING", "RUNNING"):
                    logger.info(f"Grading finished for submission {submission_id} with status {status}. Closing WS.")
                    break
            
            # Холболт идэвхтэй байгаа эсэхийг баталгаажуулахын тулд бага зэрэг амрах
            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected by client for submission: {submission_id}")
    except Exception as e:
        logger.exception(f"Error in submission WebSocket: {e}")
        try:
            await websocket.send_json({"status": "ERROR", "message": str(e)})
        except Exception:
            pass
    finally:
        # Сувгаас гарах болон холболтуудыг хаах
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
        await redis_client.close()
        logger.info(f"WebSocket cleaned up for submission: {submission_id}")


@router.websocket("/contests/{contest_id}/scoreboard")
async def contest_scoreboard_ws(websocket: WebSocket, contest_id: int):
    user = await _websocket_user(websocket)
    if not user:
        await _reject_unauthorized(websocket)
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Contest).where(Contest.id == contest_id))
        contest = result.scalar_one_or_none()
        if not contest:
            await websocket.close(code=1008, reason="Contest not found")
            return
        if not contest.is_public and user.role.value not in ("teacher", "admin"):
            participant = await db.execute(select(ContestParticipant).where(ContestParticipant.contest_id == contest_id, ContestParticipant.user_id == user.id))
            if not participant.scalar_one_or_none():
                await _reject_unauthorized(websocket)
                return
    await websocket.accept()
    logger.info(f"WebSocket connected for contest scoreboard: {contest_id}")

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    channel_name = f"contest_scoreboard:{contest_id}"
    await pubsub.subscribe(channel_name)

    try:
        # Анхны холболт амжилттай
        await websocket.send_json({
            "status": "CONNECTED",
            "message": "Waiting for scoreboard updates..."
        })

        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data = json.loads(message["data"])
                logger.info(f"Received scoreboard update for contest {contest_id}")
                await websocket.send_json(data)
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for contest scoreboard: {contest_id}")
    except Exception as e:
        logger.exception(f"Error in contest scoreboard WebSocket: {e}")
    finally:
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
        await redis_client.close()


@router.websocket("/contests/{contest_id}/team-scoreboard")
async def contest_team_scoreboard_ws(websocket: WebSocket, contest_id: int):
    user = await _websocket_user(websocket)
    if not user:
        await _reject_unauthorized(websocket)
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Contest).where(Contest.id == contest_id))
        contest = result.scalar_one_or_none()
        if not contest:
            await websocket.close(code=1008, reason="Contest not found")
            return
        if not contest.is_public and user.role.value not in ("teacher", "admin"):
            participant = await db.execute(select(ContestParticipant).where(ContestParticipant.contest_id == contest_id, ContestParticipant.user_id == user.id))
            if not participant.scalar_one_or_none():
                await _reject_unauthorized(websocket)
                return
    await websocket.accept()
    logger.info(f"WebSocket connected for team contest scoreboard: {contest_id}")

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    channel_name = f"contest_team_scoreboard:{contest_id}"
    await pubsub.subscribe(channel_name)

    try:
        await websocket.send_json({
            "status": "CONNECTED",
            "message": "Waiting for team scoreboard updates..."
        })

        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data = json.loads(message["data"])
                logger.info(f"Received team scoreboard update for contest {contest_id}")
                await websocket.send_json(data)
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for team contest scoreboard: {contest_id}")
    except Exception as e:
        logger.exception(f"Error in team contest scoreboard WebSocket: {e}")
    finally:
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
        await redis_client.close()


@router.websocket("/users/{user_id}/progress")
async def user_progress_ws(websocket: WebSocket, user_id: str):
    user = await _websocket_user(websocket)
    if not user or (str(user.id) != user_id and user.role.value not in ("teacher", "admin")):
        await _reject_unauthorized(websocket)
        return
    await websocket.accept()
    logger.info(f"WebSocket connected for user progress: {user_id}")

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    channel_name = f"user_progress:{user_id}"
    await pubsub.subscribe(channel_name)

    try:
        await websocket.send_json({
            "status": "CONNECTED",
            "message": "Listening for gamification updates..."
        })

        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data = json.loads(message["data"])
                logger.info(f"Received progress event for user {user_id}: {data}")
                await websocket.send_json(data)
            await asyncio.sleep(0.2)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user progress: {user_id}")
    except Exception as e:
        logger.exception(f"Error in user progress WebSocket: {e}")
    finally:
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
        await redis_client.close()
