import asyncio
import json
from datetime import datetime
from sqlalchemy import select
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.progression import StudentLevel, StudentProgress, TopicMastery
from app.models.gamification import Achievement, World, Stage, StageProblem
from app.models.problem import Problem, TestCase, ProblemHint, DifficultyLevel, OlympiadScope, DivisionCategory
from app.models.classroom import Classroom, ClassroomStudent
from app.models.lesson import Lesson, LessonQuiz, LessonProblem, LessonCategory

async def seed_all():
    print("🌱 Seeding database with initial data & lessons...")
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Check if already seeded
        result = await session.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none():
            print("⚠️ Database already seeded. Updating lessons if needed.")

        # 1. Seed Student Levels
        levels_data = [
            {"name": "Bronze", "min_xp": 0, "required_solved": 0, "order": 1, "color": "#cd7f32", "icon": "Star"},
            {"name": "Silver", "min_xp": 500, "required_solved": 10, "order": 2, "color": "#94a3b8", "icon": "Star"},
            {"name": "Gold", "min_xp": 1500, "required_solved": 25, "order": 3, "color": "#d97706", "icon": "Star"},
            {"name": "Platinum", "min_xp": 3500, "required_solved": 50, "order": 4, "color": "#0284c7", "icon": "Star"},
            {"name": "Diamond", "min_xp": 7000, "required_solved": 80, "order": 5, "color": "#7c3aed", "icon": "Star"},
            {"name": "Master", "min_xp": 15000, "required_solved": 120, "order": 6, "color": "#db2777", "icon": "Trophy"},
            {"name": "Grandmaster", "min_xp": 30000, "required_solved": 150, "order": 7, "color": "#dc2626", "icon": "Crown"},
        ]
        levels = []
        for l in levels_data:
            existing = await session.execute(select(StudentLevel).where(StudentLevel.name == l["name"]))
            lvl = existing.scalar_one_or_none()
            if not lvl:
                lvl = StudentLevel(**l)
                session.add(lvl)
            levels.append(lvl)
        await session.flush()

        # 2. Seed Users
        admin_res = await session.execute(select(User).where(User.username == "admin"))
        if not admin_res.scalar_one_or_none():
            admin = User(username="admin", email="admin@oj.know.mn", hashed_password=get_password_hash("Admin1234!"), role=UserRole.ADMIN)
            teacher = User(username="teacher_bat", email="teacher@oj.know.mn", hashed_password=get_password_hash("Teacher1234!"), role=UserRole.TEACHER)
            student1 = User(username="bold_coder", email="student@oj.know.mn", hashed_password=get_password_hash("Student1234!"), role=UserRole.STUDENT)
            student2 = User(username="algo_master", email="temuulen@oj.know.mn", hashed_password=get_password_hash("Student1234!"), role=UserRole.STUDENT)
            session.add_all([admin, teacher, student1, student2])
            await session.flush()

            prog1 = StudentProgress(user_id=student1.id, current_level_id=levels[2].id, total_xp=2340, solved_count=48, current_streak=7, highest_streak=14)
            prog2 = StudentProgress(user_id=student2.id, current_level_id=levels[6].id, total_xp=34200, solved_count=142, current_streak=35, highest_streak=35)
            session.add_all([prog1, prog2])
            await session.flush()

        # 3. Seed Problems with Olympiad Metadata
        problems_data = [
            {
                "code": "1001",
                "title": "A+B Нийлбэр",
                "statement_markdown": "Танд хоёр бүхэл тоо $A$ ба $B$ өгөгдөнө. Эдгээр тоонуудын нийлбэрийг олж хэвлэнэ үү.",
                "time_limit": 1.0,
                "memory_limit": 64,
                "points": 10,
                "xp_reward": 20,
                "difficulty": DifficultyLevel.BRONZE,
                "topic": "Суурь Математик",
                "olympiad_scope": OlympiadScope.TRAINING,
                "division": DivisionCategory.SENIOR,
                "olympiad_year": 2024,
                "source_citation": "Сургалтын суурь дасгал #1",
            },
            {
                "code": "1002",
                "title": "Хамгийн Их Элемент",
                "statement_markdown": "Өгөгдсөн $N$ ширхэг бүхэл тооны хамгийн ихийг олно уу.",
                "time_limit": 1.0,
                "memory_limit": 64,
                "points": 20,
                "xp_reward": 40,
                "difficulty": DifficultyLevel.BRONZE,
                "topic": "Brute Force",
                "olympiad_scope": OlympiadScope.DISTRICT_SCHOOL,
                "division": DivisionCategory.JUNIOR,
                "olympiad_year": 2023,
                "source_citation": "2023 Дүүргийн Олимпиад, 1-р Даваа",
            },
            {
                "code": "1003",
                "title": "Анхны Тооны Шалгуур",
                "statement_markdown": "Өгөгдсөн $N$ тоог анхны тоо мөн эсэхийг шалгана уу. Мөн бол YES, биш бол NO гэж хэвлэ.",
                "time_limit": 1.0,
                "memory_limit": 128,
                "points": 30,
                "xp_reward": 60,
                "difficulty": DifficultyLevel.BRONZE,
                "topic": "Тооны Онол",
                "olympiad_scope": OlympiadScope.PROVINCE_CITY,
                "division": DivisionCategory.SENIOR,
                "olympiad_year": 2022,
                "source_citation": "2022 Нийслэлийн Олимпиад, 2-р Даваа",
            },
            {
                "code": "1004",
                "title": "Хоёртын Хайлт ба Завсар",
                "statement_markdown": "Эрэмбэлэгдсэн $N$ урттай массив болон $Q$ ширхэг асуулга өгөгдөнө.",
                "time_limit": 1.5,
                "memory_limit": 256,
                "points": 50,
                "xp_reward": 100,
                "difficulty": DifficultyLevel.SILVER,
                "topic": "Binary Search",
                "olympiad_scope": OlympiadScope.NATIONAL,
                "division": DivisionCategory.SENIOR,
                "olympiad_year": 2024,
                "source_citation": "2024 Улсын Олимпиад (Finals), Бодлого #2",
            },
        ]

        created_problems = {}
        for p_data in problems_data:
            prob_res = await session.execute(select(Problem).where(Problem.code == p_data["code"]))
            prob = prob_res.scalar_one_or_none()
            if not prob:
                prob = Problem(**p_data)
                session.add(prob)
                await session.flush()
                # add sample test case
                tc = TestCase(problem_id=prob.id, input_data="3 5\n", output_data="8\n", order=1, is_sample=True)
                session.add(tc)
            created_problems[p_data["code"]] = prob
        await session.flush()

        # 4. Seed Lessons & Quizzes
        lessons_data = [
            {
                "slug": "prime-numbers-math",
                "title": "Олимпиадын Математик: Анхны Тоо ба O(√N) Шалгуур",
                "category": LessonCategory.MATH,
                "topic": "Тооны Онол",
                "difficulty": "Bronze",
                "estimated_minutes": 10,
                "xp_reward": 30,
                "summary": "Анхны тооны математик чанар, яагаад ямар ч нийлмэл тооны бага хуваагч нь язгуур N-ээс хэтэрдэггүй тухай баталгаа ба кодчилол.",
                "content_markdown": """# 🧮 Олимпиадын Математик: Анхны Тооны Шалгуур

Мэдээлэлзүйн олимпиадад тооны онолын бодлогууд маш өндөр байр суурь эзэлдэг. 

## 1. Тодорхойлолт
1-ээс их бөгөөд зөвхөн $1$ болон өөртөө л хуваагддаг бүхэл тоог **Анхны тоо (Prime Number)** гэнэ.

$$2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, \\dots$$

---

## 2. Гэнэн арга (Naive Algorithm) — $O(N)$
Хэрэв $2$-оос $N-1$ хүртэл бүх тоонд хувааж шалгавал:
```cpp
bool isPrime(long long n) {
    if (n <= 1) return false;
    for (long long i = 2; i < n; i++) {
        if (n % i == 0) return false;
    }
    return true;
}
```
> [!WARNING]
> Энэ арга нь $N = 10^9$ үед $10^9$ үйлдэл хийх тул **Time Limit Exceeded (TLE)** алдаа өгнө!

---

## 3. Математик Чанар & $O(\\sqrt{N})$ Оновчлол
Хэрэв $N$ нь нийлмэл тоо ($N = a \\times b$) бол $a$ ба $b$-ийн ядаж нэг нь $\\le \\sqrt{N}$ байна.
Тиймээс бид зөвхөн $\\sqrt{N}$ хүртэл шалгахад хангалттай!

```cpp
bool isPrimeFast(long long n) {
    if (n <= 1) return false;
    for (long long i = 2; i * i <= n; i++) {
        if (n % i == 0) return false;
    }
    return true;
}
```
Энэ нь $N = 10^9$ үед ердөө **31,622** үйлдэл хийх тул **0.001 секундэд** шуурхай ажиллана!
""",
                "quizzes": [
                    {
                        "question": "Хэрэв N = 10^9 бол O(√N) аргаар хамгийн ихдээ ойролцоогоор хэдэн үйлдэл хийгдэх вэ?",
                        "options": ["1,000,000,000 үйлдэл", "31,622 үйлдэл", "100 үйлдэл", "500,000 үйлдэл"],
                        "correct_index": 1,
                        "explanation": "√1,000,000,000 ≈ 31622.77 тул ойролцоогоор 31,622 давталт хийгдэнэ."
                    },
                    {
                        "question": "Аль нь анхны тоо БИШ вэ?",
                        "options": ["2", "17", "1", "29"],
                        "correct_index": 2,
                        "explanation": "1 тоо нь тодорхойлолтоор анхны тоо ч биш, нийлмэл тоо ч биш юм."
                    }
                ],
                "problem_codes": ["1003"],
            },
            {
                "slug": "binary-search-foundations",
                "title": "Хоёртын Хайлтын Үндэс ба Завсрын Оновчлол",
                "category": LessonCategory.ALGORITHMS,
                "topic": "Binary Search",
                "difficulty": "Silver",
                "estimated_minutes": 15,
                "xp_reward": 40,
                "summary": "Эрэмбэлэгдсэн массив дээр O(log N) хурдаар хайх болон хариун дээр хоёртын хайлт (Binary Search on Answer) хийх арга.",
                "content_markdown": """# 🔍 Хоёртын Хайлт (Binary Search)

Хоёртын хайлт нь олимпиадад хамгийн өргөн хэрэглэгддэг $O(\\log N)$ хугацааны алгоритм юм.

## 1. Сонгодог Хоёртын Хайлт
Өгөгдөл **заавал эрэмбэлэгдсэн** байх шаардлагатай.

```cpp
int binarySearch(const vector<int>& a, int target) {
    int left = 0, right = a.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}
```
""",
                "quizzes": [
                    {
                        "question": "1,000,000 урттай эрэмбэлэгдсэн массивт хоёртын хайлт хамгийн ихдээ хэдэн алхам хийх вэ?",
                        "options": ["1,000,000", "500,000", "20 алхам", "100 алхам"],
                        "correct_index": 2,
                        "explanation": "log2(1,000,000) ≈ 19.93 тул дээд тал нь 20 алхамд хайж олно."
                    }
                ],
                "problem_codes": ["1004"],
            },
        ]

        for l_data in lessons_data:
            q_list = l_data.pop("quizzes")
            p_codes = l_data.pop("problem_codes")

            lesson_res = await session.execute(select(Lesson).where(Lesson.slug == l_data["slug"]))
            lesson = lesson_res.scalar_one_or_none()
            if not lesson:
                lesson = Lesson(**l_data)
                session.add(lesson)
                await session.flush()

                # add quizzes
                for idx, q in enumerate(q_list, 1):
                    quiz = LessonQuiz(
                        lesson_id=lesson.id,
                        question=q["question"],
                        options_json=json.dumps(q["options"], ensure_ascii=False),
                        correct_option_index=q["correct_index"],
                        explanation=q["explanation"],
                        order=idx,
                    )
                    session.add(quiz)

                # add practice problems link
                for idx, p_code in enumerate(p_codes, 1):
                    if p_code in created_problems:
                        lp = LessonProblem(
                            lesson_id=lesson.id,
                            problem_id=created_problems[p_code].id,
                            order=idx,
                            is_recommended=True,
                        )
                        session.add(lp)

        await session.commit()
        print("✅ Seeding with interactive lessons & math modules completed!")

if __name__ == "__main__":
    asyncio.run(seed_all())
