import os
import pytest
from unittest.mock import MagicMock, patch
from app.api.v1.endpoints.workspace import verify_workspace_solution

class MockUser:
    def __init__(self, id):
        self.id = id

@pytest.mark.asyncio
async def test_workspace_test_solution_success():
    # Setup mock user
    user = MockUser("teacher-123")
    
    solution_code = """
#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) {
        cout << a + b << endl;
    }
    return 0;
}
"""
    init_content = """
test_cases:
  - in: cases/1.in
    out: cases/1.out
    points: 10
"""
    draft_files = {
        "solution.cpp": solution_code,
        "init.yml": init_content,
        "cases/1.in": "10 20\n",
        "cases/1.out": "30\n"
    }
    
    def mock_read(user_id, code, filename):
        if filename in draft_files:
            return draft_files[filename]
        raise FileNotFoundError()
        
    def mock_list(user_id, code):
        return list(draft_files.keys())

    with patch("app.api.v1.endpoints.workspace._read_draft_file", side_effect=mock_read), \
         patch("app.api.v1.endpoints.workspace._list_draft_files", side_effect=mock_list):
         
        res = await verify_workspace_solution(code="TESTPROB", current_user=user)
        
        assert res["status"] == "AC"
        assert res["error_log"] is None
        assert len(res["results"]) == 1
        assert res["results"][0]["status"] == "AC"
        assert res["results"][0]["input_file"] == "cases/1.in"

@pytest.mark.asyncio
async def test_workspace_test_solution_compile_error():
    user = MockUser("teacher-123")
    
    draft_files = {
        "solution.cpp": "this is not valid c++ code!",
        "init.yml": "test_cases:\n  - {in: cases/1.in, out: cases/1.out, points: 10}\n",
        "cases/1.in": "1 2\n",
        "cases/1.out": "3\n"
    }
    
    def mock_read(user_id, code, filename):
        if filename in draft_files:
            return draft_files[filename]
        raise FileNotFoundError()
        
    def mock_list(user_id, code):
        return list(draft_files.keys())

    with patch("app.api.v1.endpoints.workspace._read_draft_file", side_effect=mock_read), \
         patch("app.api.v1.endpoints.workspace._list_draft_files", side_effect=mock_list):
         
        res = await verify_workspace_solution(code="TESTPROB", current_user=user)
        
        assert res["status"] == "CE"
        assert "Model Solution" in res["error_log"]
        assert len(res["results"]) == 0
