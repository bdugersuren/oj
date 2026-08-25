import io
import stat
import zipfile

import pytest

from app.services.safe_archive import (
    ArchiveLimits,
    UnsafeArchiveError,
    open_validated_zip,
    safe_extract_zip,
)


def _zip_bytes(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_safe_extract_accepts_regular_files(tmp_path):
    safe_extract_zip(_zip_bytes({"cases/1.in": b"1 2\n"}), tmp_path)
    assert (tmp_path / "cases" / "1.in").read_bytes() == b"1 2\n"


@pytest.mark.parametrize("name", ["../escape", "/absolute", "dir\\escape"])
def test_validation_rejects_unsafe_paths(name):
    with pytest.raises(UnsafeArchiveError):
        with open_validated_zip(_zip_bytes({name: b"bad"})):
            pass


def test_validation_rejects_symlink():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        info = zipfile.ZipInfo("link")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, "target")
    with pytest.raises(UnsafeArchiveError):
        with open_validated_zip(buffer.getvalue()):
            pass


def test_validation_enforces_expanded_size():
    limits = ArchiveLimits(max_total_bytes=3, max_file_bytes=10)
    with pytest.raises(UnsafeArchiveError):
        with open_validated_zip(_zip_bytes({"data.txt": b"1234"}), limits):
            pass
