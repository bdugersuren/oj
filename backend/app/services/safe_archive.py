"""Bounded ZIP validation and extraction for untrusted uploads."""

from __future__ import annotations

import io
import os
import shutil
import stat
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterator


class UnsafeArchiveError(ValueError):
    """Raised when an archive violates the platform's safety policy."""


@dataclass(frozen=True)
class ArchiveLimits:
    max_archive_bytes: int = 64 * 1024 * 1024
    max_entries: int = 5_000
    max_file_bytes: int = 64 * 1024 * 1024
    max_total_bytes: int = 256 * 1024 * 1024
    max_compression_ratio: int = 200
    max_path_depth: int = 20


DEFAULT_LIMITS = ArchiveLimits()


def _validated_member_name(info: zipfile.ZipInfo, limits: ArchiveLimits) -> str:
    name = info.filename
    if not name or "\x00" in name or "\\" in name:
        raise UnsafeArchiveError(f"Unsafe ZIP member name: {name!r}")

    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise UnsafeArchiveError(f"ZIP path traversal is not allowed: {name}")
    if len(path.parts) > limits.max_path_depth:
        raise UnsafeArchiveError(f"ZIP path is too deep: {name}")

    unix_mode = info.external_attr >> 16
    if unix_mode and stat.S_ISLNK(unix_mode):
        raise UnsafeArchiveError(f"ZIP symbolic links are not allowed: {name}")
    if info.file_size > limits.max_file_bytes:
        raise UnsafeArchiveError(f"ZIP member is too large: {name}")
    if info.file_size and info.compress_size == 0:
        raise UnsafeArchiveError(f"Invalid compressed size for ZIP member: {name}")
    if info.compress_size and info.file_size / info.compress_size > limits.max_compression_ratio:
        raise UnsafeArchiveError(f"ZIP compression ratio is too high: {name}")
    return path.as_posix()


def validate_zip(archive: zipfile.ZipFile, limits: ArchiveLimits = DEFAULT_LIMITS) -> None:
    infos = archive.infolist()
    if len(infos) > limits.max_entries:
        raise UnsafeArchiveError("ZIP archive contains too many entries.")

    seen: set[str] = set()
    total_size = 0
    for info in infos:
        normalized = _validated_member_name(info, limits)
        if normalized in seen:
            raise UnsafeArchiveError(f"Duplicate ZIP member: {normalized}")
        seen.add(normalized)
        total_size += info.file_size
        if total_size > limits.max_total_bytes:
            raise UnsafeArchiveError("ZIP archive expands beyond the allowed size.")

    bad_member = archive.testzip()
    if bad_member:
        raise UnsafeArchiveError(f"Corrupt ZIP member: {bad_member}")


@contextmanager
def open_validated_zip(
    data: bytes,
    limits: ArchiveLimits = DEFAULT_LIMITS,
) -> Iterator[zipfile.ZipFile]:
    if len(data) > limits.max_archive_bytes:
        raise UnsafeArchiveError("ZIP archive is larger than the upload limit.")
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as archive:
            validate_zip(archive, limits)
            yield archive
    except zipfile.BadZipFile as exc:
        raise UnsafeArchiveError("Invalid ZIP archive.") from exc


def safe_extract_zip(
    data: bytes,
    destination: str | os.PathLike[str],
    limits: ArchiveLimits = DEFAULT_LIMITS,
) -> None:
    root = Path(destination).resolve()
    root.mkdir(parents=True, exist_ok=True)

    with open_validated_zip(data, limits) as archive:
        for info in archive.infolist():
            relative = PurePosixPath(info.filename)
            target = root.joinpath(*relative.parts)
            resolved = target.resolve()
            if resolved != root and root not in resolved.parents:
                raise UnsafeArchiveError(f"ZIP member escapes destination: {info.filename}")
            if info.is_dir():
                resolved.mkdir(parents=True, exist_ok=True)
                continue
            resolved.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info, "r") as source, resolved.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
