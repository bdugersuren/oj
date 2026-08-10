import io
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

from app.core.config import settings
from app.core.dependencies import require_role
from app.models.user import User
from app.services.storage import storage_client

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp"
}

@router.post(
    "/image",
    summary="Багшийн TipTap редакторт ашиглах зургийг MinIO-д байршуулах (Teacher / Admin)"
)
async def upload_editor_image(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("teacher", "admin"))
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Дэмжигдэхгүй файлын төрөл. Зөвхөн JPEG, PNG, GIF, WEBP формат зөвшөөрөгдөнө."
        )

    # Файлын хэмжээ хязгаарлах (5MB max)
    max_size = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Зургийн хэмжээ 5MB-аас хэтэрч болохгүй."
        )

    ext = ALLOWED_IMAGE_TYPES[file.content_type]
    file_id = uuid.uuid4().hex
    key = f"images/{file_id}.{ext}"

    # BytesIO урсгал үүсгэх
    file_stream = io.BytesIO(content)

    # MinIO руу хуулах
    try:
        path = await storage_client.upload_file(
            bucket=settings.MINIO_BUCKET_PROBLEMS,
            key=key,
            data=file_stream,
            length=len(content),
            content_type=file.content_type
        )
        
        # Багшийн TipTap редакторт зориулж шууд хандах боломжтой нийтийн холбоосыг буцаана
        if settings.MINIO_PUBLIC_URL:
            url = f"{settings.MINIO_PUBLIC_URL.rstrip('/')}/{settings.MINIO_BUCKET_PROBLEMS}/{key}"
        else:
            url = f"http://{settings.MINIO_ENDPOINT}/{settings.MINIO_BUCKET_PROBLEMS}/{key}"

        return {
            "status": "success",
            "url": url,
            "path": path
        }
    except Exception as e:
        logger.exception(f"Error uploading editor image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Зураг байршуулахад алдаа гарлаа: {e}"
        )
