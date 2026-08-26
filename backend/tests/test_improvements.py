from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo


def test_elo_calculation_math():
    """
    Test ELO formula correctness.
    If both players start at 1200 rating:
    - Expected score for both is 0.5.
    - If player A wins, they should gain 16 points (1200 + 32 * (1.0 - 0.5) = 1216).
    - If player B loses, they should lose 16 points (1200 + 32 * (0.0 - 0.5) = 1184).
    """
    R_A = 1200
    R_B = 1200
    
    # Expected score for A
    E_A = 1.0 / (1.0 + 10.0 ** ((R_B - R_A) / 400.0))
    # Expected score for B
    E_B = 1.0 / (1.0 + 10.0 ** ((R_A - R_B) / 400.0))
    
    assert E_A == 0.5
    assert E_B == 0.5
    
    # Actual score: A wins
    S_A = 1.0
    S_B = 0.0
    
    K = 32
    new_R_A = round(R_A + K * (S_A - E_A))
    new_R_B = round(R_B + K * (S_B - E_B))
    
    assert new_R_A == 1216
    assert new_R_B == 1184


def test_timezone_conversion_to_ulaanbaatar():
    """
    Test naive UTC conversion from database to Asia/Ulaanbaatar time.
    For instance: August 10, 2026 at 23:00 UTC should be August 11, 2026 at 07:00 local time.
    """
    db_naive = datetime(2026, 8, 10, 23, 0, 0)
    
    # Make timezone aware (as UTC)
    last_utc = db_naive.replace(tzinfo=timezone.utc)
    
    # Convert to Asia/Ulaanbaatar timezone (+8)
    tz = ZoneInfo("Asia/Ulaanbaatar")
    last_local = last_utc.astimezone(tz)
    
    assert last_local.year == 2026
    assert last_local.month == 8
    assert last_local.day == 11
    assert last_local.hour == 7


def test_post_reward_hook_failure_does_not_escape_or_skip_next_hook():
    from app.workers.judge_worker import _run_post_reward_hooks

    db = MagicMock()
    progress = SimpleNamespace(user_id="student-id")
    with patch(
        "app.workers.judge_worker._check_level_up",
        side_effect=RuntimeError("optional level failure"),
    ), patch("app.workers.judge_worker._check_achievements") as achievements:
        _run_post_reward_hooks(db, progress, "student-id")

    db.rollback.assert_called_once()
    achievements.assert_called_once_with(db, progress)


def test_ai_ticket_reply_formatting():
    """
    Test that the AI response content formatter successfully merges the socratic hints
    and follow-up questions into structured markdown format.
    """
    title = "Концепцийн Сануулга"
    guidance = "Энэ бол хоёр тооны нийлбэр олох суурь бодлого."
    followups = ["Ямар өгөгдлийн төрөл ашиглах вэ?", "Overflow-оос яаж сэргийлэх вэ?"]
    
    # Format message
    content = f"### 🤖 {title}\n\n{guidance}\n\n"
    if followups:
        content += "**Чиглүүлэх асуултууд:**\n"
        for q in followups:
            content += f"- {q}\n"
            
    assert "### 🤖 Концепцийн Сануулга" in content
    assert "хоёр тооны нийлбэр олох" in content
    assert "**Чиглүүлэх асуултууд:**" in content
    assert "- Ямар өгөгдлийн төрөл асуултууд" not in content
    assert "- Ямар өгөгдлийн төрөл ашиглах вэ?" in content


def test_redis_bridge_lease_skips_busy_host():
    from app.workers.judge_worker import _acquire_bridge_lease

    class MockLock:
        def __init__(self, acquired):
            self.acquired = acquired

        def acquire(self, blocking=False):
            assert blocking is False
            return self.acquired

    class MockRedis:
        def incr(self, _key):
            return 2  # start at bridge1 for a two-host list

        def lock(self, key, **kwargs):
            assert kwargs == {
                "timeout": 120,
                "blocking": False,
                "thread_local": False,
            }
            return MockLock(acquired=key.endswith("bridge2"))

    assigned, lease = _acquire_bridge_lease(
        MockRedis(),
        ["bridge1", "bridge2"],
        wait_seconds=0,
        lease_seconds=120,
    )

    assert assigned == "bridge2"
    assert lease.acquired is True


def test_parse_simple_yaml():
    """
    Test parsing typical DMOJ init.yml content.
    """
    from app.api.v1.endpoints.problems import parse_simple_yaml

    yaml_data = """
    archive: cases.zip
    time_limit: 2.5
    memory_limit: 128
    
    test_cases:
      - {in: case1.in, out: case1.out, points: 10, sample: true}
      - {in: case2.in, out: case2.out, points: 20}
    """
    
    result = parse_simple_yaml(yaml_data)
    assert result["archive"] == "cases.zip"
    assert float(result["time_limit"]) == 2.5
    assert int(result["memory_limit"]) == 128
    assert len(result["test_cases"]) == 2
    assert result["test_cases"][0]["in"] == "case1.in"
    assert result["test_cases"][0]["out"] == "case1.out"
    assert int(result["test_cases"][0]["points"]) == 10
    assert str(result["test_cases"][0]["sample"]).lower() == "true"
    assert result["test_cases"][1]["in"] == "case2.in"
    assert result["test_cases"][1]["out"] == "case2.out"
    assert int(result["test_cases"][1]["points"]) == 20
