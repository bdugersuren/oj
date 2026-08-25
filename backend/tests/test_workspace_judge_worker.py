from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.workers.judge_worker import (
    _read_workspace_text,
    _workspace_generator_payload,
    _workspace_solution_payload,
)


def make_job():
    return SimpleNamespace(id=12, user_id="teacher-id", problem_code="SUM")


def test_workspace_payload_is_bounded_and_uses_explicit_testcases():
    files = {
        "solution.cpp": "int main() { return 0; }",
        "init.yml": "time_limit: 2\nmemory_limit: 128\ntest_cases:\n  - {in: cases/1.in, out: cases/1.out, points: 20}\n",
        "cases/1.in": "1 2\n",
        "cases/1.out": "3\n",
    }
    with patch(
        "app.workers.judge_worker._read_workspace_text",
        side_effect=lambda _user, _code, name, *_args: files[name],
    ):
        payload = _workspace_solution_payload(make_job())

    assert payload["id"] == 1_000_000_012
    assert payload["language"] == "g++20"
    assert payload["time_limit"] == 2.0
    assert payload["memory_limit_mb"] == 128
    assert payload["testcases"] == [
        {"id": 1, "input_data": "1 2\n", "output_data": "3\n", "points": 20}
    ]


def test_workspace_payload_rejects_too_many_testcases():
    entries = "\n".join("  - {in: a.in, out: a.out}" for _ in range(501))
    files = {
        "solution.cpp": "int main() {}",
        "init.yml": f"test_cases:\n{entries}\n",
    }
    with patch(
        "app.workers.judge_worker._read_workspace_text",
        side_effect=lambda _user, _code, name, *_args: files[name],
    ), pytest.raises(ValueError, match="500"):
        _workspace_solution_payload(make_job())


def test_workspace_payload_rejects_traversal_path():
    with pytest.raises(ValueError, match="Invalid workspace filename"):
        _read_workspace_text("teacher", "SUM", "../secret")


def test_workspace_generator_payload_uses_capture_mode_and_bounded_arguments():
    job = SimpleNamespace(
        id=13,
        user_id="teacher-id",
        problem_code="SUM",
        request_payload={"params": ["10 20", '"two words" 7']},
    )
    generator = (
        '#include "testlib.h"\n#include <iostream>\n'
        "int main(int argc,char** argv){registerGen(argc,argv,1);std::cout<<opt<int>(1);}" 
    )
    with patch("app.workers.judge_worker._read_workspace_text", return_value=generator):
        payload = _workspace_generator_payload(job, 1)

    assert payload["capture_output"] is True
    assert payload["testcases"] == [
        {"id": 2, "input_data": "", "output_data": "", "points": 1},
    ]
    assert 'static char workspace_arg_1[] = "two words";' in payload["source"]
    assert "argc=3; argv=workspace_argv; registerGen(argc,argv,1)" in payload["source"]


def test_workspace_generator_payload_rejects_too_many_arguments():
    job = SimpleNamespace(
        id=14,
        user_id="teacher-id",
        problem_code="SUM",
        request_payload={"params": [" ".join(["x"] * 21)]},
    )
    with patch("app.workers.judge_worker._read_workspace_text", return_value="int main(){}"):
        with pytest.raises(ValueError, match="argument limits"):
            _workspace_generator_payload(job)
