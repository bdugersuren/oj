import os
import shutil
import tempfile
import pytest
from app.services.local_judge import LocalSubprocessJudge
from app.api.v1.endpoints.submissions import SUPPORTED_LANGUAGES

def test_supported_languages_dict():
    # Make sure key languages are present in the submissions supported list
    assert "g++20" in SUPPORTED_LANGUAGES
    assert "g++23" in SUPPORTED_LANGUAGES
    assert "go" in SUPPORTED_LANGUAGES
    assert "cargo" in SUPPORTED_LANGUAGES
    assert "node" in SUPPORTED_LANGUAGES
    assert "mono-csc" in SUPPORTED_LANGUAGES
    assert "pascal" in SUPPORTED_LANGUAGES

def test_local_judge_cpp20_compile():
    # Test compilation of C++20 code containing a C++20 concept
    cpp20_code = """
#include <iostream>
#include <concepts>

template<typename T>
concept Hashable = requires(T a) {
    { std::hash<T>{}(a) } -> std::convertible_to<std::size_t>;
};

struct S {};

int main() {
    std::cout << std::boolalpha << Hashable<int> << " " << Hashable<S> << std::endl;
    return 0;
}
"""
    work_dir = tempfile.mkdtemp()
    try:
        success, err_log, run_cmd = LocalSubprocessJudge.compile_code("g++20", cpp20_code, work_dir)
        assert success, f"C++20 compilation failed: {err_log}"
        assert run_cmd is not None
        assert len(run_cmd) == 1
        assert os.path.exists(run_cmd[0])
    finally:
        shutil.rmtree(work_dir)

def test_local_judge_python_compile():
    py_code = "print('Hello')"
    work_dir = tempfile.mkdtemp()
    try:
        success, err_log, run_cmd = LocalSubprocessJudge.compile_code("python3", py_code, work_dir)
        assert success
        assert run_cmd == ["python3", os.path.join(work_dir, "solution.py")]
    finally:
        shutil.rmtree(work_dir)
