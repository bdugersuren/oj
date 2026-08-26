"""Bounded readers and structural validation for untrusted request payloads."""


class UploadValidationError(ValueError):
    pass


async def read_upload_bytes(upload, max_bytes: int) -> bytes:
    """Read at most max_bytes + 1 so oversized bodies never enter parsers."""
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise UploadValidationError(f"Upload exceeds {max_bytes} bytes.")
    return data


def validate_json_tree(
    value,
    *,
    max_nodes: int = 10_000,
    max_depth: int = 40,
    max_string_bytes: int = 512 * 1024,
) -> None:
    """Reject excessively deep/large decoded JSON before domain processing."""
    stack = [(value, 1)]
    nodes = 0
    while stack:
        current, depth = stack.pop()
        nodes += 1
        if nodes > max_nodes:
            raise UploadValidationError("JSON contains too many nodes.")
        if depth > max_depth:
            raise UploadValidationError("JSON nesting is too deep.")
        if isinstance(current, str):
            if len(current.encode("utf-8")) > max_string_bytes:
                raise UploadValidationError("JSON string is too large.")
        elif isinstance(current, dict):
            for key, item in current.items():
                if not isinstance(key, str):
                    raise UploadValidationError("JSON object keys must be strings.")
                stack.append((key, depth + 1))
                stack.append((item, depth + 1))
        elif isinstance(current, list):
            stack.extend((item, depth + 1) for item in current)
