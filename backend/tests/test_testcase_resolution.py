import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch
from app.services.local_judge import LocalSubprocessJudge

class MockProblem:
    def __init__(self, code, zip_key):
        self.code = code
        self.testcases_zip_key = zip_key

class MockTestCase:
    def __init__(self, id, order, points):
        self.id = id
        self.order = order
        self.points = points
        self.input_data = None
        self.output_data = None

def test_resolve_testcase_data_from_disk_flat():
    # Setup mock problem and testcases
    problem = MockProblem("TEST_RESOLVE", "oj-private-problems/test_resolve.zip")
    test_cases = [
        MockTestCase(101, 1, 10),
        MockTestCase(102, 2, 20)
    ]
    
    # Create the target directory and write mock cases and init.yml
    local_dir = Path("/problems") / f"oj-{problem.code}"
    shutil.rmtree(local_dir, ignore_errors=True)
    local_dir.mkdir(parents=True, exist_ok=True)
    
    init_content = """
test_cases:
  - in: 1.in
    out: 1.out
    points: 10
  - in: 2.in
    out: 2.out
    points: 20
"""
    (local_dir / "init.yml").write_text(init_content, encoding="utf-8")
    (local_dir / "1.in").write_text("input1", encoding="utf-8")
    (local_dir / "1.out").write_text("output1", encoding="utf-8")
    (local_dir / "2.in").write_text("input2", encoding="utf-8")
    (local_dir / "2.out").write_text("output2", encoding="utf-8")
    
    # Write marker file so it skips download
    (local_dir / "cases_extracted.txt").write_text(problem.testcases_zip_key, encoding="utf-8")
    
    try:
        resolved = LocalSubprocessJudge.resolve_testcase_data_from_disk(
            problem_code=problem.code,
            testcases_zip_key=problem.testcases_zip_key,
            test_cases=test_cases
        )
        
        assert resolved[0].input_data == "input1"
        assert resolved[0].output_data == "output1"
        assert resolved[1].input_data == "input2"
        assert resolved[1].output_data == "output2"
    finally:
        shutil.rmtree(local_dir, ignore_errors=True)
