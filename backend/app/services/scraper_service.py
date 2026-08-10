import logging
import httpx
from bs4 import BeautifulSoup
from typing import Tuple

logger = logging.getLogger(__name__)

class ScraperService:
    def __init__(self):
        self.ollama_url = "http://ollama:11434/api/chat"

    async def scrape_url(self, url: str) -> str:
        """URL-аас онолын контентыг татаж авч цэвэрлэнэ."""
        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    raise Exception(f"Failed to fetch URL. Status code: {response.status_code}")
                
                # BeautifulSoup parsing
                soup = BeautifulSoup(response.text, "html.parser")
                
                # Remove script, style, footer elements
                for element in soup(["script", "style", "footer", "nav", "header", "noscript"]):
                    element.decompose()
                
                # Attempt to find main content or fallback to body text
                content_div = (
                    soup.find("main") or 
                    soup.find("article") or 
                    soup.find("div", class_="content") or 
                    soup.find("div", id="content") or 
                    soup.body
                )
                
                if not content_div:
                    content_div = soup
                
                paragraphs = []
                for child in content_div.find_all(["p", "h1", "h2", "h3", "h4", "pre", "ul", "ol"]):
                    text = child.get_text(strip=True)
                    if text:
                        paragraphs.append(text)
                
                return "\n\n".join(paragraphs)
        except Exception as e:
            logger.error(f"Error scraping URL '{url}': {e}")
            raise

    async def translate_content(self, text: str) -> str:
        """Англи хэл дээрх онолыг Ollama ашиглан Монгол хэл рүү хөрвүүлнэ."""
        system_prompt = (
            "Чи бол Мэдээлэлзүйн олимпиадын алгоритмын онол, тайлбар орчуулдаг мэргэжлийн орчуулагч байна.\n"
            "Дараах дүрмүүдийг чанд баримталж орчуул:\n"
            "1. Зааварчилгаа болон алгоритмыг сурагчдад ойлгомжтой Монгол хэлээр найруулан орчуул.\n"
            "2. LaTeX математик томъёонуудыг ($...$ эсвэл $$...$$) ямар ч өөрчлөлтгүйгээр яг хэвээр нь үлдээ.\n"
            "3. Кодын хэсэг эсвэл псевдокод, хувьсагчийн нэрс, функцийг хөрвүүлэхгүйгээр хэвээр үлдээ.\n"
            "4. Орчуулгаас өөр нэмэлт тайлбар бүү бич."
        )

        try:
            truncated_text = text[:6000]
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self.ollama_url,
                    json={
                        "model": "qwen2.5-coder:7b",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": f"Орчуулна уу:\n\n{truncated_text}"}
                        ],
                        "stream": False
                    }
                )
                if response.status_code == 200:
                    return response.json()["message"]["content"]
                else:
                    raise Exception(f"Ollama Translate API returned status {response.status_code}: {response.text}")
        except Exception as e:
            logger.error(f"Failed to translate content via Ollama: {e}")
            raise

scraper_service = ScraperService()
