"""Minimal socket-level smoke test for the local DMOJ adapter."""
import json
import socket
import struct
import sys


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


def grade(
    host: str,
    submission_id: int,
    source: str,
    *,
    language: str = "g++20",
    capture_output: bool = False,
    time_limit: float = 1.0,
    memory_limit_mb: int = 64,
) -> dict:
    payload = {
        "id": submission_id,
        "problem": "smoke",
        "language": language,
        "source": source,
        "time_limit": time_limit,
        "memory_limit_mb": memory_limit_mb,
        "testcases": [{"id": 1, "input_data": "2\n", "output_data": "4\n", "points": 10}],
    }
    if capture_output:
        payload["capture_output"] = True
    return request(host, payload)


def main() -> None:
    host = sys.argv[1] if len(sys.argv) > 1 else "bridge"
    healthy = request(host, {"health": True})
    accepted = grade(host, 900_000_001, "#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x*2<<'\\n';}")
    wrong = grade(host, 900_000_002, "#include <iostream>\nint main(){std::cout<<0<<'\\n';}")
    compile_error = grade(host, 900_000_003, "int main( { return 0; }")
    runtime_error = grade(host, 900_000_004, "int main(){int* p=nullptr;return *p;}")
    nonzero_exit = grade(host, 900_000_008, "int main(){return 2;}")
    captured = grade(
        host,
        900_000_009,
        "#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x*3<<'\\n';}",
        capture_output=True,
    )
    time_limit = grade(host, 900_000_005, "int main(){for(;;){}}", time_limit=0.1)
    memory_limit = grade(
        host,
        900_000_006,
        (
            "public class Main { public static void main(String[] args) { "
            "byte[] memory = new byte[64 * 1024 * 1024]; memory[0] = 1; } }"
        ),
        language="java",
        memory_limit_mb=32,
    )
    output_limit = grade(
        host,
        900_000_007,
        "#include <iostream>\nint main(){for(int i=0;i<500000000;i++)std::cout<<'x';}",
    )
    results = {
        "health": healthy.get("status"),
        "accepted": accepted.get("status"),
        "wrong": wrong.get("status"),
        "compile_error": compile_error.get("status"),
        "runtime_error": runtime_error.get("status"),
        "nonzero_exit": nonzero_exit.get("status"),
        "capture_output": captured.get("status"),
        "time_limit": time_limit.get("status"),
        "memory_limit": memory_limit.get("status"),
        "output_limit": output_limit.get("status"),
    }
    print(json.dumps(results, ensure_ascii=False, sort_keys=True))
    if results["memory_limit"] != "MLE":
        print(json.dumps({"memory_verdict": memory_limit}, ensure_ascii=False, default=str))
    assert results == {
        "health": "HEALTHY",
        "accepted": "AC",
        "wrong": "WA",
        "compile_error": "CE",
        "runtime_error": "RTE",
        "nonzero_exit": "RTE",
        "capture_output": "AC",
        "time_limit": "TLE",
        "memory_limit": "MLE",
        "output_limit": "OLE",
    }, results
    assert captured["test_results"][0]["program_output"] == "6\n"


if __name__ == "__main__":
    main()
