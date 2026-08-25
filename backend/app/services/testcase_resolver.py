from pathlib import Path, PurePosixPath
from typing import Any

import yaml


def resolve_testcase_data_from_disk(
    problem_code: str,
    testcases_zip_key: str | None,
    test_cases: list[Any],
) -> list[Any]:
    """Fill DB testcase rows from an already validated/extracted DMOJ package."""
    if not testcases_zip_key or not test_cases:
        return test_cases
    local_dir = Path("/problems") / f"oj-{problem_code}"
    init_file = local_dir / "init.yml"
    if not init_file.is_file() or init_file.stat().st_size > 256 * 1024:
        return test_cases
    config = yaml.safe_load(init_file.read_text(encoding="utf-8")) or {}
    configured = config.get("test_cases") or []
    flat_files: list[tuple[str | None, str | None]] = []
    for item in configured:
        if not isinstance(item, dict):
            continue
        nested = item.get("cases")
        entries = nested if isinstance(nested, list) else [item]
        for testcase in entries:
            if isinstance(testcase, dict):
                flat_files.append((testcase.get("in"), testcase.get("out")))

    for index, testcase in enumerate(test_cases):
        if getattr(testcase, "input_data", None) is not None and getattr(testcase, "output_data", None) is not None:
            continue
        order = getattr(testcase, "order", None)
        position = order - 1 if isinstance(order, int) and 0 < order <= len(flat_files) else index
        if not 0 <= position < len(flat_files):
            continue
        input_name, output_name = flat_files[position]
        for attribute, filename in (("input_data", input_name), ("output_data", output_name)):
            if not filename:
                continue
            relative = PurePosixPath(str(filename))
            if relative.is_absolute() or ".." in relative.parts or "\\" in str(filename):
                raise ValueError(f"Invalid testcase path: {filename}")
            candidate = local_dir / relative
            if not candidate.is_file():
                candidate = local_dir / "cases" / relative
            if candidate.is_file() and candidate.stat().st_size <= 64 * 1024 * 1024:
                setattr(testcase, attribute, candidate.read_text(encoding="utf-8", errors="replace"))
    return test_cases
