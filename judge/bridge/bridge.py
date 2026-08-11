"""Length-prefixed JSON adapter from OJ FastAPI jobs to DMOJ's local Judge engine."""
import json
import logging
import os
import shutil
import socketserver
import struct
import sys
import threading
from pathlib import Path
from typing import Any

from dmoj import contrib, executors, judgeenv
from dmoj.judge import Judge, Submission
from dmoj.result import Result

LOG = logging.getLogger("oj.dmoj_bridge")
PROBLEM_ROOT = Path("/problems")
LANGUAGES = {
    # C++
    "g++20":   "CPP20",
    "g++23":   "CPP23",
    "g++17":   "CPP17",
    "g++14":   "CPP14",
    "g++11":   "CPP11",
    "cpp":     "CPP17",
    "c++":     "CPP17",
    "clang++": "CLPP17",
    # C
    "gcc":     "C11",
    "c":       "C11",
    "gcc11":   "C11",
    "gcc23":   "C23",
    "clang":   "CLANG",
    # Python
    "python3": "PY3",
    "pypy3":   "PYPY3",
    "python":  "PY2",
    "pypy":    "PYPY",
    # Java
    "java":    "JAVA",
    "java8":   "JAVA8",
    # Pascal
    "pascal":  "PAS",
    "fpc":     "PAS",
    # Go
    "go":      "GO",
    # Rust
    "cargo":   "RUST",
    # JavaScript
    "node":    "NODEJS",
    # C#
    "mono-csc": "MONOCS",
}
STATUS_PRIORITY = ((Result.TLE, "TLE"), (Result.MLE, "MLE"), (Result.RTE, "RTE"), (Result.WA, "WA"))


class CapturePackets:
    """The Judge calls this PacketManager-shaped object for a local submission."""

    def __init__(self, judge: Judge):
        self.judge = judge
        self.reset()

    def reset(self) -> None:
        self.results: list[dict[str, Any]] = []
        self.compile_error: str | None = None
        self.internal_error: str | None = None

    def supported_problems_packet(self, _problems: Any) -> None: pass
    def compile_message_packet(self, _message: str) -> None: pass
    def begin_grading_packet(self, _pretested: bool) -> None: pass
    def grading_end_packet(self) -> None: pass
    def batch_begin_packet(self) -> None: pass
    def batch_end_packet(self) -> None: pass
    def submission_aborted_packet(self) -> None: pass
    def run(self) -> None: pass
    def close(self) -> None: pass

    def compile_error_packet(self, error: str) -> None:
        self.compile_error = error

    def internal_error_packet(self, error: str) -> None:
        self.internal_error = error

    def test_case_status_packet(self, position: int, result: Result) -> None:
        status = "AC"
        for flag, code in STATUS_PRIORITY:
            if result.result_flag & flag:
                status = code
                break
        self.results.append({
            "position": position,
            "status": status,
            "points": result.points,
            "time_ms": round(result.execution_time * 1000, 3),
            "memory_kb": result.max_memory,
            "checker_output": result.extended_feedback or result.feedback or result.output,
        })


class DMOJAdapter:
    def __init__(self) -> None:
        # DMOJ loads its runtime paths and problem-storage configuration from this file.
        sys.argv = ["oj-dmoj-bridge", "--config", "/tmp/merged_judge.yml", "--skip-self-test", "--no-ansi"]
        judgeenv.load_env(cli=True)
        executors.load_executors()
        contrib.load_contrib_modules()
        self.packets = CapturePackets.__new__(CapturePackets)
        self.judge = Judge(self.packets)
        CapturePackets.__init__(self.packets, self.judge)
        self.lock = threading.Lock()

    @staticmethod
    def _recv(sock) -> dict[str, Any]:
        header = sock.recv(4)
        if len(header) != 4:
            raise ConnectionError("Missing request size")
        size = struct.unpack("!I", header)[0]
        if size > 2 * 1024 * 1024:
            raise ValueError("Request exceeds 2MB")
        data = bytearray()
        while len(data) < size:
            chunk = sock.recv(size - len(data))
            if not chunk:
                raise ConnectionError("Request ended early")
            data.extend(chunk)
        return json.loads(data.decode("utf-8"))

    @staticmethod
    def _send(sock, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        sock.sendall(struct.pack("!I", len(data)) + data)

    @staticmethod
    def _problem_id(submission_id: int) -> str:
        return f"oj-{submission_id}"

    def _write_problem(self, payload: dict[str, Any]) -> tuple[str, list[int], Path]:
        submission_id = int(payload["id"])
        testcases = payload.get("testcases") or []
        if not testcases:
            raise ValueError("No testcases supplied")
        problem_id = self._problem_id(submission_id)
        directory = PROBLEM_ROOT / problem_id
        shutil.rmtree(directory, ignore_errors=True)
        directory.mkdir(parents=True, exist_ok=False)
        cases, testcase_ids = [], []
        for position, testcase in enumerate(testcases, start=1):
            input_name, output_name = f"case{position}.in", f"case{position}.out"
            (directory / input_name).write_text(str(testcase["input_data"]), encoding="utf-8")
            (directory / output_name).write_text(str(testcase["output_data"]), encoding="utf-8")
            cases.append({"in": input_name, "out": output_name, "points": int(testcase.get("points", 0))})
            testcase_ids.append(int(testcase["id"]))
        (directory / "init.yml").write_text("test_cases:\n" + "\n".join(
            f"- {{in: {case['in']}, out: {case['out']}, points: {case['points']}}}" for case in cases
        ) + "\n", encoding="utf-8")
        judgeenv.clear_problem_dirs_cache()
        return problem_id, testcase_ids, directory

    def grade(self, payload: dict[str, Any]) -> dict[str, Any]:
        language = LANGUAGES.get(str(payload.get("language", "")))
        if not language:
            return {"status": "CE", "score": 0, "time_ms": 0, "memory_kb": 0, "error_log": "Unsupported language"}
        with self.lock:
            self.packets.reset()
            directory: Path | None = None
            testcase_ids: list[int] = []
            try:
                # Check if testcases are supplied via socket payload (legacy flow)
                if "testcases" in payload:
                    problem_id, testcase_ids, directory = self._write_problem(payload)
                else:
                    # Zip-cached pre-extracted flow
                    problem_id = f"oj-{payload['problem']}"
                    judgeenv.clear_problem_dirs_cache()

                self.judge.begin_grading(Submission(
                    int(payload["id"]), problem_id, language, str(payload["source"]),
                    float(payload.get("time_limit", 1.0)), int(payload.get("memory_limit_mb", 64)) * 1024,
                    False, {},
                ), blocking=True, report=lambda _message: None)
                if self.packets.compile_error:
                    return {"status": "CE", "score": 0, "time_ms": 0, "memory_kb": 0, "error_log": self.packets.compile_error, "test_results": []}
                if self.packets.internal_error:
                    return {"status": "RTE", "score": 0, "time_ms": 0, "memory_kb": 0, "error_log": self.packets.internal_error, "test_results": []}
                test_results = []
                for item in self.packets.results:
                    position = item.pop("position")
                    item["testcase_id"] = testcase_ids[position - 1] if testcase_ids else position
                    test_results.append(item)
                statuses = {item["status"] for item in test_results}
                status = next((code for _flag, code in STATUS_PRIORITY if code in statuses), "AC")
                return {
                    "status": status,
                    "score": int(sum(item["points"] for item in test_results)),
                    "time_ms": max((item["time_ms"] for item in test_results), default=0),
                    "memory_kb": max((item["memory_kb"] for item in test_results), default=0),
                    "test_results": test_results,
                }
            except Exception as exc:
                LOG.exception("DMOJ grading failed")
                return {"status": "RTE", "score": 0, "time_ms": 0, "memory_kb": 0, "error_log": str(exc), "test_results": []}
            finally:
                if directory:
                    shutil.rmtree(directory, ignore_errors=True)
                judgeenv.clear_problem_dirs_cache()


class Handler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        try:
            payload = ADAPTER._recv(self.request)
            ADAPTER._send(self.request, ADAPTER.grade(payload))
        except Exception as exc:
            LOG.exception("Bridge request failed")
            ADAPTER._send(self.request, {"status": "RTE", "score": 0, "time_ms": 0, "memory_kb": 0, "error_log": str(exc), "test_results": []})


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    ADAPTER = DMOJAdapter()
    with socketserver.ThreadingTCPServer(("0.0.0.0", 9999), Handler) as server:
        server.allow_reuse_address = True
        LOG.info("DMOJ tier-3 adapter listening on port 9999")
        server.serve_forever()
