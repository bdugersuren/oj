import logging
import httpx
import uuid
from celery import shared_task
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from app.core.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)

QDRANT_URL = "http://qdrant:6333"
COLLECTION_NAME = "curated_knowledge"
EMBEDDING_MODEL = "bge-m3"
VECTOR_SIZE = 1024

_engine = None
_Session = None

def _get_sync_session():
    global _engine, _Session
    if _engine is None:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        _engine = create_engine(sync_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
        _Session = sessionmaker(bind=_engine)
    return _Session()

def _init_qdrant_client():
    client = QdrantClient(url=QDRANT_URL)
    try:
        collections = client.get_collections()
        exist = any(c.name == COLLECTION_NAME for c in collections.collections)
        if not exist:
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
    except Exception as e:
        logger.error(f"Failed to init Qdrant in worker: {e}")
    return client

@celery_app.task(
    name="app.workers.ai_worker.scrape_and_translate_task",
    max_retries=1,
)
def scrape_and_translate_task(url: str, topic: str):
    """URL-аас онолын текстийг хуулж аваад, Орчуулагч агентаар Монгол хэл рүү хөрвүүлж Draft болгон хадгална."""
    import asyncio
    from app.services.scraper_service import scraper_service
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.ai_curator import TopicDataPool, CuratorDataStatus

    logger.info(f"Starting scrape and translate for URL: {url}, topic: {topic}")
    try:
        # Run async scraper methods using asyncio.run since scraper_service is async
        scraped_text = asyncio.run(scraper_service.scrape_url(url))
        if not scraped_text.strip():
            logger.error(f"No text content found at URL: {url}")
            return
            
        translated_text = asyncio.run(scraper_service.translate_content(scraped_text))
        
        # Save to database
        with _get_sync_session() as db:
            entry = TopicDataPool(
                topic=topic,
                title=f"{topic} (Online Scraped)",
                content_mongolian=translated_text,
                source_url=url,
                status=CuratorDataStatus.DRAFT,
                is_vector_indexed=False
            )
            db.add(entry)
            db.commit()
            
        logger.info(f"Successfully scraped and translated {url} to DRAFT pool")
    except Exception as e:
        logger.exception(f"Error in scrape_and_translate_task: {e}")


@celery_app.task(
    name="app.workers.ai_worker.vectorize_approved_entry_task",
    bind=True,
    max_retries=5,
    default_retry_delay=5,
)
def vectorize_approved_entry_task(self, entry_id: int):
    """APPROVED болсон материалыг bge-m3-аар векторжуулж Qdrant санд хадгална."""
    from app.models.ai_curator import TopicDataPool, CuratorDataStatus

    logger.info(f"Starting vectorization for entry_id: {entry_id}")
    
    with _get_sync_session() as db:
        entry = db.get(TopicDataPool, entry_id)
        if not entry:
            logger.error(f"Entry {entry_id} not found")
            return
            
        if entry.status != CuratorDataStatus.APPROVED:
            logger.warning(f"Entry {entry_id} is not APPROVED, skipping vectorization")
            return

        try:
            # 1. Generate Embedding Vector via Ollama (timeout increased to 120s)
            with httpx.Client(timeout=120.0) as client:
                response = client.post(
                    "http://ollama:11434/api/embed",
                    json={
                        "model": EMBEDDING_MODEL,
                        "input": entry.content_mongolian
                    }
                )
                if response.status_code != 200:
                    raise Exception(f"Ollama Embed API returned status {response.status_code}: {response.text}")
                
                vector = response.json()["embeddings"][0]

            # 2. Init Qdrant and Upsert Point
            qdrant_client = _init_qdrant_client()
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"curator_{entry_id}"))

            qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=[
                    PointStruct(
                        id=point_id,
                        vector=vector,
                        payload={
                            "doc_id": entry_id,
                            "topic": entry.topic,
                            "title": entry.title,
                            "content": entry.content_mongolian
                        }
                    )
                ]
            )

            # 3. Update DB
            entry.is_vector_indexed = True
            entry.qdrant_point_id = point_id
            db.commit()
            logger.info(f"Entry {entry_id} successfully vectorized and indexed in Qdrant")

        except Exception as e:
            logger.exception(f"Error in vectorize_approved_entry_task: {e}")
            # Exponential backoff retry: 5s, 10s, 20s, 40s, 80s
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 5)


@celery_app.task(
    name="app.workers.ai_worker.reconcile_vector_index_task",
)
def reconcile_vector_index_task():
    """
    Periodic task: APPROVED боловч векторжуулаагүй байгаа материалуудыг
    автоматаар дахин векторжуулахаар дараалалд оруулж синхрончлолыг хангана.
    """
    from app.models.ai_curator import TopicDataPool, CuratorDataStatus
    
    logger.info("Starting vector reconciliation job...")
    with _get_sync_session() as db:
        # Get all approved entries that are not vector indexed
        entries = (
            db.query(TopicDataPool)
            .filter(
                TopicDataPool.status == CuratorDataStatus.APPROVED,
                TopicDataPool.is_vector_indexed == False
            )
            .all()
        )
        
        count = 0
        for entry in entries:
            celery_app.send_task(
                "app.workers.ai_worker.vectorize_approved_entry_task",
                args=[entry.id]
            )
            count += 1
            
        if count > 0:
            logger.info(f"Reconciled {count} unvectorized approved entries.")
        else:
            logger.info("All approved entries are up to date.")



