import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import io
import json

from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.user import User
from app.models.ai_curator import TopicDataPool, CuratorDataStatus
from app.core.celery_app import celery_app

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class TopicDataCreate(BaseModel):
    topic: str
    title: str
    content_mongolian: str
    source_url: Optional[str] = None

class TopicDataUpdate(BaseModel):
    topic: Optional[str] = None
    title: Optional[str] = None
    content_mongolian: Optional[str] = None

class UrlScrapeRequest(BaseModel):
    url: str
    topic: str

class TopicDataOut(BaseModel):
    id: int
    topic: str
    title: str
    content_mongolian: str
    source_url: Optional[str]
    status: CuratorDataStatus
    is_vector_indexed: bool
    qdrant_point_id: Optional[str]
    
    class Config:
        from_attributes = True

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/ingest", response_model=TopicDataOut, status_code=status.HTTP_201_CREATED)
async def ingest_topic_data(
    payload: TopicDataCreate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Шинэ алгоритмын өгөгдлийг орон нутгийн DRAFT сан руу оруулах."""
    data_entry = TopicDataPool(
        topic=payload.topic,
        title=payload.title,
        content_mongolian=payload.content_mongolian,
        source_url=payload.source_url,
        status=CuratorDataStatus.DRAFT
    )
    db.add(data_entry)
    await db.commit()
    await db.refresh(data_entry)
    return data_entry


@router.get("/drafts", response_model=List[TopicDataOut])
async def list_drafts(
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Багшийн хянах шаардлагатай байгаа DRAFT материалуудыг авах."""
    result = await db.execute(
        select(TopicDataPool).where(TopicDataPool.status == CuratorDataStatus.DRAFT).order_by(TopicDataPool.created_at.desc())
    )
    return result.scalars().all()


@router.get("/list", response_model=List[TopicDataOut])
async def list_all_curated(
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Бүх материалуудыг (Approved, Draft, Rejected) жагсааж харах."""
    result = await db.execute(
        select(TopicDataPool).order_by(TopicDataPool.created_at.desc())
    )
    return result.scalars().all()


@router.put("/approve/{id}", response_model=TopicDataOut)
async def approve_topic_data(
    id: int,
    payload: TopicDataUpdate,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Материалыг засаж шинэчлэн APPROVED төлөвт оруулах."""
    result = await db.execute(select(TopicDataPool).where(TopicDataPool.id == id))
    data_entry = result.scalar_one_or_none()
    if not data_entry:
        raise HTTPException(status_code=404, detail="Материал олдсонгүй.")

    if payload.topic is not None:
        data_entry.topic = payload.topic
    if payload.title is not None:
        data_entry.title = payload.title
    if payload.content_mongolian is not None:
        data_entry.content_mongolian = payload.content_mongolian

    data_entry.status = CuratorDataStatus.APPROVED
    data_entry.is_vector_indexed = False # Reset so it re-vectorizes updated content
    await db.commit()
    await db.refresh(data_entry)
    
    # Trigger background Celery task for vectorization
    celery_app.send_task("app.workers.ai_worker.vectorize_approved_entry_task", args=[id])
    return data_entry


@router.put("/reject/{id}", response_model=TopicDataOut)
async def reject_topic_data(
    id: int,
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Материалыг REJECTED төлөв рүү шилжүүлэх."""
    result = await db.execute(select(TopicDataPool).where(TopicDataPool.id == id))
    data_entry = result.scalar_one_or_none()
    if not data_entry:
        raise HTTPException(status_code=404, detail="Материал олдсонгүй.")

    # Remove from Qdrant if indexed
    if data_entry.qdrant_point_id:
        try:
            from app.services.qdrant_service import qdrant_service
            qdrant_service.delete_document(data_entry.qdrant_point_id)
        except Exception as e:
            logger.error(f"Failed to delete rejected point from Qdrant: {e}")
        data_entry.qdrant_point_id = None
        data_entry.is_vector_indexed = False

    data_entry.status = CuratorDataStatus.REJECTED
    await db.commit()
    await db.refresh(data_entry)
    return data_entry


@router.get("/export")
async def export_dataset_jsonl(
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """APPROVED материалуудыг AI Fine-Tuning хийхэд тохирсон JSONL форматаар экспортлох."""
    result = await db.execute(
        select(TopicDataPool).where(TopicDataPool.status == CuratorDataStatus.APPROVED)
    )
    entries = result.scalars().all()

    output = io.BytesIO()
    for entry in entries:
        # Instruction tuning format
        line = {
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Чи бол Мэдээлэлзүйн Олимпиадын бэлтгэл хариуцсан AI Туслах Багш байна. "
                        "Сурагчид алгоритмын тухай асуухад Socratic аргаар чиглүүлж, Монгол хэлээр хариул."
                    )
                },
                {
                    "role": "user",
                    "content": f"Надад '{entry.topic}' сэдэвтэй холбоотой '{entry.title}' онолыг тайлбарлаж өгнө үү."
                },
                {
                    "role": "assistant",
                    "content": entry.content_mongolian
                }
            ]
        }
        output.write((json.dumps(line, ensure_ascii=False) + "\n").encode("utf-8"))

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/x-jsonlines",
        headers={"Content-Disposition": "attachment; filename=oj_fine_tuning_dataset.jsonl"}
    )


@router.post("/scrape")
async def scrape_and_translate_url(
    payload: UrlScrapeRequest,
    current_user: User = Depends(require_role("teacher", "admin")),
):
    """URL-оос контент татаж, орчуулж draft болгон оруулах Celery даалгаврыг эхлүүлэх."""
    celery_app.send_task(
        "app.workers.ai_worker.scrape_and_translate_task",
        args=[payload.url, payload.topic]
    )
    return {"message": "Скрапинг даалгавар амжилттай дараалалд орлоо. DRAFT-уудыг хэдэн минутын дараа шалгана уу."}


@router.post("/reindex")
async def reindex_approved_curated_data(
    current_user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """Бүх батлагдсан материалуудыг векторжуулж шинээр индексжүүлэх."""
    result = await db.execute(
        select(TopicDataPool).where(TopicDataPool.status == CuratorDataStatus.APPROVED)
    )
    entries = result.scalars().all()
    count = 0
    for entry in entries:
        entry.is_vector_indexed = False
        db.add(entry)
        celery_app.send_task(
            "app.workers.ai_worker.vectorize_approved_entry_task",
            args=[entry.id]
        )
        count += 1
    await db.commit()
    return {"message": f"Бүх {count} APPROVED материалуудыг дахин векторжуулахаар дараалалд орууллаа."}
