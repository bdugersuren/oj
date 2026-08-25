"""Socket-level smoke test for the workspace generator DMOJ contract."""
import json
import os
import socket
import struct
from types import SimpleNamespace
from unittest.mock import patch

from app.workers.judge_worker import (
    _workspace_generator_payload,
    _workspace_solution_capture_payload,
)


def request(host: str, payload: dict) -> dict:
    encoded = json.dumps(payload).encode("utf-8")
    with socket.create_connection((host, 9999), timeout=10) as connection:
        connection.sendall(struct.pack("!I", len(encoded)) + encoded)
        header = connection.recv(4)
        if len(header) != 4:
            raise RuntimeError("Bridge response header is incomplete")
        size = struct.unpack("!I", header)[0]
        chunks = bytearray()
        while len(chunks) < size:
            chunk = connection.recv(size - len(chunks))
            if not chunk:
                raise RuntimeError("Bridge response ended early")
            chunks.extend(chunk)
    return json.loads(chunks.decode("utf-8"))


def main() -> None:
    host = os.getenv("DMOJ_SMOKE_HOST", "bridge")
    direct = request(host, {
        "id": 1_299_999_999,
        "problem": "testlib-direct-smoke",
        "language": "g++20",
        "source": (
            '#include "testlib.h"\n#include <iostream>\n'
            "int main(int argc,char** argv){registerGen(argc,argv,1);std::cout<<\"ok\\n\";}"
        ),
        "time_limit": 5.0,
        "memory_limit_mb": 256,
        "capture_output": True,
        "testcases": [{"id": 1, "input_data": "", "output_data": "", "points": 0}],
    })
    assert direct["status"] == "AC", direct
    assert direct["test_results"][0]["program_output"] == "ok\n", direct
    job = SimpleNamespace(
        id=987,
        user_id="smoke-teacher",
        problem_code="GENSMOKE",
        request_payload={"params": ["1 10", "50 60"], "points_per_case": 10},
    )
    generator = (
        '#include "testlib.h"\n#include <iostream>\n'
        "int main(int argc,char** argv){registerGen(argc,argv,1);"
        "std::cout<<opt<int>(1)<<' '<<opt<int>(2)<<'\\n';}"
    )
    inputs = []
    for parameter_index in range(2):
        with patch("app.workers.judge_worker._read_workspace_text", return_value=generator):
            generator_payload = _workspace_generator_payload(job, parameter_index)
        generated = request(host, generator_payload)
        assert generated["status"] == "AC", generated
        inputs.append(generated["test_results"][0]["program_output"])
    assert inputs == ["1 10\n", "50 60\n"], inputs

    solution = (
        "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;"
        "std::cout<<a+b<<'\\n';}"
    )
    with patch("app.workers.judge_worker._read_workspace_text", return_value=solution):
        solution_payload = _workspace_solution_capture_payload(job, inputs)
    solved = request(host, solution_payload)
    assert solved["status"] == "AC", solved
    outputs = [item["program_output"] for item in solved["test_results"]]
    assert outputs == ["11\n", "110\n"], outputs
    print(json.dumps({"status": "AC", "inputs": inputs, "outputs": outputs}))


if __name__ == "__main__":
    main()
