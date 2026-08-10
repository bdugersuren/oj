import logging
import uuid
import httpx
from typing import List, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from app.core.config import settings

logger = logging.getLogger(__name__)

QDRANT_URL = "http://qdrant:6333"
COLLECTION_NAME = "curated_knowledge"
EMBEDDING_MODEL = "bge-m3"
VECTOR_SIZE = 1024

class QdrantService:
    def __init__(self):
        self.client = QdrantClient(url=QDRANT_URL)
        self.ollama_url = "http://ollama:11434/api/embed"

    def init_collection(self):
        """Эмбеддинг хадгалах Qdrant collection-ийг үүсгэж бэлтгэнэ."""
        try:
            collections = self.client.get_collections()
            exist = any(c.name == COLLECTION_NAME for c in collections.collections)
            if not exist:
                logger.info(f"Creating Qdrant collection '{COLLECTION_NAME}' with vector size {VECTOR_SIZE}...")
                self.client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
                )
        except Exception as e:
            logger.exception(f"Failed to initialize Qdrant collection: {e}")

    async def get_embedding(self, text: str) -> List[float]:
        """Ollama bge-m3 ашиглан текстийн вектор эмбеддинг үүсгэнэ."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.ollama_url,
                    json={
                        "model": EMBEDDING_MODEL,
                        "input": text
                    }
                )
                if response.status_code == 200:
                    res_data = response.json()
                    # list of lists of floats -> get the first embedding vector
                    return res_data["embeddings"][0]
                else:
                    raise Exception(f"Ollama Embed API returned status {response.status_code}: {response.text}")
        except Exception as e:
            logger.exception(f"Error generating embedding: {e}")
            raise

    async def upsert_document(self, doc_id: int, topic: str, title: str, content: str) -> str:
        """Батлагдсан онолын контентыг векторжуулж Qdrant-д хадгална."""
        # 1. Ensure collection exists
        self.init_collection()

        # 2. Get embedding vector
        vector = await self.get_embedding(content)

        # 3. Generate a deterministic UUID based on doc_id
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"curator_{doc_id}"))

        # 4. Upsert into Qdrant
        self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "doc_id": doc_id,
                        "topic": topic,
                        "title": title,
                        "content": content
                    }
                )
            ]
        )
        logger.info(f"Successfully upserted doc_id={doc_id} to Qdrant with point_id={point_id}")
        return point_id

    def delete_document(self, point_id: str):
        """Qdrant-аас баримтыг устгана."""
        try:
            self.client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=[point_id]
            )
            logger.info(f"Deleted point_id={point_id} from Qdrant")
        except Exception as e:
            logger.error(f"Error deleting from Qdrant: {e}")

    async def search_context(self, query: str, limit: int = 3) -> List[dict]:
        """Хайлтанд хамгийн ойр холбоотой баталгаат контентыг вектор сангаас хайж олно."""
        if not settings.ENABLE_AI:
            return []
            
        try:
            # 1. Ensure collection exists
            self.init_collection()

            # 2. Get query embedding
            query_vector = await self.get_embedding(query)

            # 3. Search in Qdrant
            results = self.client.query_points(
                collection_name=COLLECTION_NAME,
                query=query_vector,
                limit=limit
            )

            # 4. Extract payloads
            return [hit.payload for hit in results.points if hit.score > 0.35] # cosine similarity score threshold
        except Exception as e:
            logger.error(f"Failed to search Qdrant context: {e}")
            return []

qdrant_service = QdrantService()
