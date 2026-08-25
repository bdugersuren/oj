from types import SimpleNamespace

from app.api.v1.endpoints.ws import _submission_event_payload
from app.models.submission import SubmissionStatus


def test_submission_event_snapshot_matches_pubsub_contract():
    submission = SimpleNamespace(
        id=42,
        status=SubmissionStatus.ACCEPTED,
        score=20,
        time_ms=12.5,
        memory_kb=4096,
        judge_results=[
            SimpleNamespace(
                id=2,
                testcase_id=8,
                status=SubmissionStatus.ACCEPTED,
                time_ms=12.5,
                memory_kb=4096,
                output_log="",
            ),
            SimpleNamespace(
                id=1,
                testcase_id=7,
                status=SubmissionStatus.ACCEPTED,
                time_ms=10.0,
                memory_kb=4000,
                output_log="",
            ),
        ],
    )

    assert _submission_event_payload(submission) == {
        "submission_id": 42,
        "status": "AC",
        "score": 20,
        "time_ms": 12.5,
        "memory_kb": 4096,
        "judge_results": [
            {
                "id": 1,
                "testcase_id": 7,
                "status": "AC",
                "time_ms": 10.0,
                "memory_kb": 4000,
                "output_log": "",
            },
            {
                "id": 2,
                "testcase_id": 8,
                "status": "AC",
                "time_ms": 12.5,
                "memory_kb": 4096,
                "output_log": "",
            },
        ],
    }
