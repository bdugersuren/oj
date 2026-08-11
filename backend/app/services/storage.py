import logging
from datetime import timedelta
from typing import Optional
from minio import Minio
from minio.error import S3Error
import anyio
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)

class MinioStorage:
    def __init__(self):
        # MinIO Client-ийг үүсгэх
        # Localhost болон docker сүлжээний endpoint-уудыг зөв тохируулах шаардлагатай.
        # Secure=False нь HTTP ашиглана (local docker setup)
        self.client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ROOT_USER,
            secret_key=settings.MINIO_ROOT_PASSWORD,
            secure=False
        )
        self._initialize_buckets()

    def _initialize_buckets(self):
        """Платформд шаардлагатай бүх bucket-уудыг үүсгэж эхлүүлнэ."""
        import json
        buckets = [
            settings.MINIO_BUCKET_PROBLEMS,
            settings.MINIO_BUCKET_SUBMISSIONS,
            settings.MINIO_BUCKET_AVATARS,
            "oj-testcases",
            "oj-private-problems",
            "oj-workspace-drafts"
        ]
        public_buckets = [
            settings.MINIO_BUCKET_PROBLEMS,
            settings.MINIO_BUCKET_AVATARS
        ]
        for bucket in buckets:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
                    logger.info(f"MinIO bucket '{bucket}' successfully created.")
                else:
                    logger.info(f"MinIO bucket '{bucket}' already exists.")

                # Нийтийн хандалттай bucket-уудад зориулж "GetObject" зөвшөөрөл тохируулах
                if bucket in public_buckets:
                    policy = {
                        "Version": "2012-10-17",
                        "Statement": [
                            {
                                "Effect": "Allow",
                                "Principal": {"AWS": ["*"]},
                                "Action": ["s3:GetObject"],
                                "Resource": [f"arn:aws:s3:::{bucket}/*"]
                            }
                        ]
                    }
                    self.client.set_bucket_policy(bucket, json.dumps(policy))
                    logger.info(f"Set public read policy on MinIO bucket '{bucket}' successfully.")
            except S3Error as e:
                logger.error(f"Error checking/creating/setting policy on MinIO bucket '{bucket}': {e}")

    async def upload_file(self, bucket: str, key: str, data, length: int, content_type: str = "application/octet-stream") -> str:
        """
        Файлыг MinIO рүү асинхроноор хуулна (thread pool ашиглана).
        `data` нь file-like object байх шаардлагатай.
        """
        def _upload():
            self.client.put_object(
                bucket_name=bucket,
                object_name=key,
                data=data,
                length=length,
                content_type=content_type
            )
            return f"/{bucket}/{key}"

        try:
            return await anyio.to_thread.run_sync(_upload)
        except S3Error as e:
            logger.error(f"Failed to upload file to MinIO {bucket}/{key}: {e}")
            raise HTTPException(status_code=500, detail=f"Файл хадгалахад алдаа гарлаа: {e}")

    async def get_presigned_url(self, bucket: str, key: str, expires_seconds: int = 3600) -> str:
        """
        Файл татаж авах presigned URL авах логик.
        Ингэснээр хувийн өгөгдлүүд (PDF, testcase)-ийг аюулгүй татах боломжтой болно.
        """
        def _get_url():
            return self.client.presigned_get_object(
                bucket_name=bucket,
                object_name=key,
                expires=timedelta(seconds=expires_seconds)
            )

        try:
            url = await anyio.to_thread.run_sync(_get_url)
            if settings.MINIO_PUBLIC_URL:
                internal = f"http://{settings.MINIO_ENDPOINT}"
                url = url.replace(internal, settings.MINIO_PUBLIC_URL.rstrip("/"))
            return url
        except S3Error as e:
            logger.error(f"Failed to generate presigned URL for {bucket}/{key}: {e}")
            return ""

    async def delete_file(self, bucket: str, key: str):
        """Файлыг MinIO-оос устгана."""
        def _delete():
            self.client.remove_object(bucket, key)

        try:
            await anyio.to_thread.run_sync(_delete)
        except S3Error as e:
            logger.error(f"Failed to delete file from MinIO {bucket}/{key}: {e}")

# Singleton instance үүсгэх
storage_client = MinioStorage()
