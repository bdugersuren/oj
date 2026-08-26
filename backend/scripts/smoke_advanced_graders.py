"""Socket regression matrix for native DMOJ advanced grader modes."""
import json
import os
import shutil
import socket
import struct
import zipfile
from pathlib import Path


ROOT = Path("/problems")


def request(host: str, payload: dict) -> dict:
    encoded = json.dumps(payload).encode("utf-8")
    with socket.create_connection((host, 9999), timeout=10) as connection:
        connection.sendall(struct.pack("!I", len(encoded)) + encoded)
        connection.settimeout(90)
        header = connection.recv(4)
        if len(header) != 4:
            raise RuntimeError("Bridge response header is incomplete")
        size = struct.unpack("!I", header)[0]
        data = bytearray()
        while len(data) < size:
            chunk = connection.recv(size - len(data))
            if not chunk:
                raise RuntimeError("Bridge response ended early")
            data.extend(chunk)
    return json.loads(data.decode("utf-8"))


def write_problem(code: str, files: dict[str, str]) -> Path:
    directory = ROOT / f"oj-{code}"
    shutil.rmtree(directory, ignore_errors=True)
    directory.mkdir(parents=True)
    for name, content in files.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return directory


def install_bundled_private_package(code: str, archive_path: str) -> Path:
    directory = ROOT / f"oj-{code}"
    shutil.rmtree(directory, ignore_errors=True)
    directory.mkdir(parents=True)
    with zipfile.ZipFile(archive_path, "r") as archive:
        for info in archive.infolist():
            if not info.filename.startswith("private/") or info.is_dir():
                continue
            relative = Path(info.filename).relative_to("private")
            if ".." in relative.parts:
                raise ValueError(f"Unsafe bundled path: {info.filename}")
            target = directory / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))
    return directory


def grade(host: str, code: str, submission_id: int, source: str) -> dict:
    return request(host, {
        "id": submission_id,
        "problem": code,
        "language": "g++20",
        "source": source,
        "time_limit": 2.0,
        "memory_limit_mb": 128,
    })


def main() -> None:
    host = os.getenv("DMOJ_SMOKE_HOST", "bridge1")
    codes = [
        "adv-checker", "adv-subtask", "adv-interactive", "adv-signature",
        "bundle-checker", "bundle-interactive", "bundle-signature",
    ]
    try:
        write_problem("adv-checker", {
            "init.yml": (
                "checker: checker.py\n"
                "test_cases:\n"
                "- {in: case.in, out: case.out, points: 25}\n"
            ),
            "checker.py": (
                "def check(process_output, judge_output, **kwargs):\n"
                "    try:\n"
                "        return int(process_output.strip()) % 2 == 0\n"
                "    except ValueError:\n"
                "        return False\n"
            ),
            "case.in": "10\n",
            "case.out": "ignored\n",
        })
        checker_ac = grade(
            host, "adv-checker", 1_300_000_001,
            "#include <iostream>\nint main(){std::cout<<8<<'\\n';}",
        )
        checker_wa = grade(
            host, "adv-checker", 1_300_000_002,
            "#include <iostream>\nint main(){std::cout<<7<<'\\n';}",
        )

        write_problem("adv-subtask", {
            "init.yml": (
                "test_cases:\n"
                "- points: 60\n"
                "  batched:\n"
                "  - {in: one.in, out: one.out}\n"
                "  - {in: two.in, out: two.out}\n"
                "- points: 40\n"
                "  batched:\n"
                "  - {in: three.in, out: three.out}\n"
            ),
            "one.in": "1\n", "one.out": "1\n",
            "two.in": "2\n", "two.out": "2\n",
            "three.in": "3\n", "three.out": "3\n",
        })
        echo_source = (
            "#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x<<'\\n';}"
        )
        partial_source = (
            "#include <iostream>\nint main(){int x;std::cin>>x;"
            "std::cout<<(x==2?0:x)<<'\\n';}"
        )
        subtask_ac = grade(host, "adv-subtask", 1_300_000_003, echo_source)
        subtask_partial = grade(
            host, "adv-subtask", 1_300_000_004, partial_source
        )

        write_problem("adv-interactive", {
            "init.yml": (
                "unbuffered: true\n"
                "interactive: {files: interactor.cpp, type: testlib}\n"
                "test_cases:\n"
                "- {in: secret.in, points: 30}\n"
            ),
            "secret.in": "73\n",
            "interactor.cpp": (
                "#include <cstdio>\n#include <cstdlib>\n"
                "int main(int argc,char**argv){FILE*f=fopen(argv[1],\"r\");"
                "int secret,guess,tries=0;fscanf(f,\"%d\",&secret);"
                "while(scanf(\"%d\",&guess)==1){tries++;"
                "if(guess==secret){puts(\"OK\");fflush(stdout);return tries<=31?0:1;}"
                "puts(guess>secret?\"FLOATS\":\"SINKS\");fflush(stdout);}return 2;}"
            ),
        })
        interactive_ac_source = (
            "#include <iostream>\n#include <string>\nint main(){int lo=1,hi=100;"
            "while(lo<=hi){int mid=(lo+hi)/2;std::cout<<mid<<std::endl;"
            "std::string s;if(!(std::cin>>s))return 1;if(s==\"OK\")return 0;"
            "if(s==\"FLOATS\")hi=mid-1;else lo=mid+1;}return 1;}"
        )
        interactive_wa_source = (
            "#include <iostream>\n#include <string>\nint main(){std::string s;"
            "for(int i=0;i<31;i++){std::cout<<1<<std::endl;std::cin>>s;}"
            "std::cout<<73<<std::endl;std::cin>>s;return 0;}"
        )
        interactive_ac = grade(
            host, "adv-interactive", 1_300_000_005, interactive_ac_source
        )
        interactive_wa = grade(
            host, "adv-interactive", 1_300_000_006, interactive_wa_source
        )

        write_problem("adv-signature", {
            "init.yml": (
                "signature_grader: {entry: grader.cpp, header: grader.h}\n"
                "test_cases:\n"
                "- {in: case.in, out: case.out, points: 45}\n"
            ),
            "grader.h": "#pragma once\nint add(int a,int b);\n",
            "grader.cpp": (
                "#include <iostream>\n#include \"grader.h\"\n"
                "int main(){int a,b;std::cin>>a>>b;std::cout<<add(a,b)<<'\\n';}"
            ),
            "case.in": "20 22\n",
            "case.out": "42\n",
        })
        signature_ac = grade(
            host, "adv-signature", 1_300_000_007,
            "int add(int a,int b){return a+b;}",
        )
        signature_wa = grade(
            host, "adv-signature", 1_300_000_008,
            "int add(int a,int b){return a-b;}",
        )

        install_bundled_private_package(
            "bundle-checker", "/app/app/samples/custom_checker.zip"
        )
        bundled_checker = grade(
            host, "bundle-checker", 1_300_000_009,
            "#include <iostream>\nint main(){std::cout<<8<<'\\n';}",
        )
        install_bundled_private_package(
            "bundle-interactive", "/app/app/samples/interactive_guessing.zip"
        )
        bundled_interactive = grade(
            host, "bundle-interactive", 1_300_000_010, interactive_ac_source
        )
        install_bundled_private_package(
            "bundle-signature", "/app/app/samples/ioi_function_signature.zip"
        )
        bundled_signature = grade(
            host, "bundle-signature", 1_300_000_011,
            "int add(int a,int b){return a+b;}",
        )

        matrix = {
            "custom_checker": [checker_ac["status"], checker_wa["status"]],
            "subtask": [
                subtask_ac["status"], subtask_ac["score"],
                subtask_partial["status"], subtask_partial["score"],
            ],
            "interactive": [interactive_ac["status"], interactive_wa["status"]],
            "signature": [signature_ac["status"], signature_wa["status"]],
            "bundled_samples": [
                bundled_checker["status"],
                bundled_interactive["status"],
                bundled_signature["status"],
            ],
        }
        assert matrix == {
            "custom_checker": ["AC", "WA"],
            "subtask": ["AC", 100, "WA", 40],
            "interactive": ["AC", "WA"],
            "signature": ["AC", "WA"],
            "bundled_samples": ["AC", "AC", "AC"],
        }, {"matrix": matrix, "details": {
            "checker": [checker_ac, checker_wa],
            "subtask": [subtask_ac, subtask_partial],
            "interactive": [interactive_ac, interactive_wa],
            "signature": [signature_ac, signature_wa],
            "bundled_samples": [bundled_checker, bundled_interactive, bundled_signature],
        }}
        print(json.dumps({"status": "AC", "matrix": matrix}))
    finally:
        for code in codes:
            shutil.rmtree(ROOT / f"oj-{code}", ignore_errors=True)


if __name__ == "__main__":
    main()
