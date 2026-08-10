import logging
import httpx
from typing import Optional, List, Tuple
from app.core.config import settings

logger = logging.getLogger(__name__)

# Mock Socratic Hints (AI идэвхгүй үед ашиглана)
MOCK_SOCRATIC_KNOWLEDGE = {
    "BF101": {
        1: ("Концепцийн Сануулга", "Энэ бол хоёр тооны нийлбэр олох суурь бодлого. Стандарт урсгалаас тоонуудыг хэрхэн унших вэ? cin >> A >> B ашиглаж, утгыг хэвлэхдээ cout << A + B; хийхэд хангалттай.", 0, ["Ямар өгөгдлийн төрөл ашиглах вэ?", "cin.tie(NULL) ямар үүрэгтэй вэ?"]),
        2: ("Захын Тохиолдлын Сануулга", "Хэрэв өгөгдсөн тоонууд $10^{18}$ хүртэлх том утгатай байвал яах вэ? 32-бит integer-ийн хязгаараас давж overflow үүсэх магадлалтай тул `long long` төрөл ашиглах хэрэгтэй.", 5, ["Сөрөг тооны үед яаж ажиллах вэ?", "Overflow-оос яаж сэргийлэх вэ?"]),
        3: ("Псевдокод Зааварчилгаа", "1. A, B хувьсагчдыг long long төрлөөр зарлана.\n2. Стандарт оролтоос A, B-ийг уншина.\n3. Тэдгээрийн нийлбэрийг хэвлэнэ.\nЦагийн хүндрэл: O(1).", 10, ["Энэ санааг шууд кодолж үзье."]),
    }
}

class AIService:
    def __init__(self):
        # Ollama үйлчилгээний url
        self.ollama_url = "http://ollama:11434/api/chat"
        self.timeout = 30.0

    async def ask_socratic_mentor(
        self,
        problem_code: str,
        problem_title: str,
        problem_statement: str,
        student_code: str,
        student_question: str,
        hint_level: int,
        last_error: Optional[str] = None
    ) -> Tuple[str, str, int, List[str]]:
        """
        Socratic аргаар сурагчийн логик алдааг олоход чиглүүлэх сануулга илгээнэ.
        Буцаах утга: (hint_title, message, xp_penalty, suggested_followups)
        """
        penalty_map = {1: 0, 2: 5, 3: 10}
        penalty = penalty_map.get(hint_level, 0)
        
        # Хэрэв AI идэвхгүй бол Mock хариулт өгөх
        if not settings.ENABLE_AI:
            logger.info("AI is disabled. Returning mock socratic response.")
            knowledge = MOCK_SOCRATIC_KNOWLEDGE.get(problem_code, MOCK_SOCRATIC_KNOWLEDGE["BF101"])
            title, msg, pen, followups = knowledge.get(hint_level, knowledge[1])
            
            if last_error:
                msg = f"🚨 Таны кодод [{last_error}] алдаа илэрсэн байна!\n\n" + msg
            return title, msg, penalty, followups

        # Хэрэв AI идэвхтэй бол Ollama руу хандана
        hint_level_desc = {
            1: "Concept: Зөвхөн алгоритмын үндсэн санааг тайлбарлах, хэзээ ч шууд код эсвэл псевдокод өгч болохгүй.",
            2: "Edge Case: Бодлогын захын утгууд, хүндрэлүүд эсвэл алдаа өгч буй шалтгааныг (жишээ нь overflow, TLE) тайлбарлах.",
            3: "Pseudocode: Бодлогыг шийдэх логикийг алхам алхмаар псевдокодоор (ямар нэг програмчлалын хэл биш) харуулах."
        }

        # 1. Fetch relevant approved knowledge from Qdrant Vector DB
        context_str = ""
        try:
            from app.services.qdrant_service import qdrant_service
            search_query = f"{problem_title} {student_question}"
            hits = await qdrant_service.search_context(search_query, limit=2)
            if hits:
                context_paragraphs = []
                for hit in hits:
                    context_paragraphs.append(f"--- Сэдэв: {hit['topic']} / Онол: {hit['title']} ---\n{hit['content']}")
                context_str = "\n\n".join(context_paragraphs)
        except Exception as e:
            logger.error(f"Error fetching RAG context from Qdrant: {e}")

        system_prompt = (
            "Чи бол Мэдээлэлзүйн Олимпиадын бэлтгэл хариуцсан AI Туслах Багш байна.\n"
            "Сурагчид кодоо явуулж тусламж хүсэхэд:\n"
            "1. Хэзээ ч бэлэн зөв кодыг шууд өгч болохгүй.\n"
            "2. Сурагчийн логик алдааг олоход нь асуултаар чиглүүлж, Socratic аргаар заа.\n"
            "3. Кодын ажиллах хугацааны хүндрэлийг (Complexity) сайжруулах зөвлөмж өгөхдөө Big-O тэмдэглэгээ ашигла.\n"
            "Үргэлж Монгол хэлээр хариулж байна.\n\n"
            f"Дараах зааварчилгааг хатуу баримтална: {hint_level_desc.get(hint_level, 1)}"
        )

        if context_str:
            system_prompt += (
                "\n\nҮүнд ашиглах баталгаат онолын контент (RAG Context). Энэ мэдээллийн дагуу тайлбар хийж, чиглүүлэг өгнө үү:\n"
                f"{context_str}"
            )

        user_content = (
            f"Бодлогын код: {problem_code}\n"
            f"Бодлогын нэр: {problem_title}\n"
            f"Өгүүлбэр: {problem_statement}\n"
            f"Сурагчийн бичсэн код:\n```\n{student_code}\n```\n"
            f"Сүүлийн алдаа: {last_error or 'Байхгүй'}\n"
            f"Сурагчийн асуулт: {student_question}"
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.ollama_url,
                    json={
                        "model": "qwen2.5-coder:7b",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_content}
                        ],
                        "stream": False
                    }
                )
                if response.status_code == 200:
                    res_data = response.json()
                    message_content = res_data["message"]["content"]
                    
                    # Гарчиг үүсгэх
                    titles = {1: "Концепцийн Сануулга", 2: "Хөгжүүлэлтийн Сануулга", 3: "Псевдокод Заавар"}
                    title = titles.get(hint_level, "AI Сануулга")

                    # Зөвлөмж асуултууд
                    followups = ["Үүнийг яаж оновчтой болгох вэ?", "Кодын Big-O хүндрэл ямар байх вэ?", "Өөр захын тохиолдол байгаа юу?"]

                    return title, message_content, penalty, followups
                else:
                    logger.error(f"Ollama API returned status {response.status_code}: {response.text}")
        except Exception as e:
            logger.exception(f"Error calling Ollama API: {e}")

        # Алдаа гарвал mock буцаах
        knowledge = MOCK_SOCRATIC_KNOWLEDGE.get(problem_code, MOCK_SOCRATIC_KNOWLEDGE["BF101"])
        title, msg, pen, followups = knowledge.get(hint_level, knowledge[1])
        return title, f"⚠️ AI Туслах ачааллахад алдаа гарлаа. (Сэрвэр холбогдоогүй)\n\n" + msg, penalty, followups

    async def get_complexity_audit(self, student_code: str) -> str:
        """Сурагчийн кодын хугацаа болон санах ойн Big-O шинжилгээг буцаана."""
        if not settings.ENABLE_AI:
            return (
                "### 📊 Кодын Хүндрэлийн Шинжилгээ (Mock)\n\n"
                "- **Цагийн хүндрэл (Time Complexity)**: $O(N^2)$\n"
                "- **Санах ойн хүндрэл (Space Complexity)**: $O(1)$\n\n"
                "💡 **Зөвлөмж**: Та давхар давталт ($N=10^5$) ашигласан байна. Энэ нь хугацааны хязгаар хэтрэх (TLE) аюултай тул хоёртын хайлт эсвэл hash map ашиглаж $O(N \\log N)$ эсвэл $O(N)$ болгож сайжруулна уу."
            )

        system_prompt = (
            "Чи бол кодын Big-O хүндрэлийг шинжилдэг мэргэжлийн инженер байна.\n"
            "Сурагчийн илгээсэн кодонд цагийн болон санах ойн хүндрэлийг нарийн тодорхойлж, хэрхэн сайжруулах зөвлөмжийг Big-O тэмдэглэгээ ашиглан Монгол хэлээр тайлбарлаж өгнө үү.\n"
            "Хариултыг Markdown форматтай, цэгцтэй гаргана уу."
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.ollama_url,
                    json={
                        "model": "qwen2.5-coder:7b",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": f"Кодыг шинжилнэ үү:\n```cpp\n{student_code}\n```"}
                        ],
                        "stream": False
                    }
                )
                if response.status_code == 200:
                    return response.json()["message"]["content"]
        except Exception as e:
            logger.exception(f"Error calling Ollama for complexity audit: {e}")

        return "⚠️ Кодонд Big-O шинжилгээ хийхэд алдаа гарлаа. (Local Ollama сервис холбогдоогүй байна)"

ai_service_client = AIService()
