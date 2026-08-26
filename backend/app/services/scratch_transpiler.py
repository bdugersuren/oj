import json

from app.services.upload_validation import UploadValidationError, validate_json_tree

class ScratchTranspileError(Exception):
    pass

def transpile_scratch_to_python(source_code: str) -> str:
    """
    Extracts the compiled Python code from the visual editor's JSON payload.
    If the source_code is already raw python, returns it.
    """
    if not isinstance(source_code, str) or not source_code.strip():
        raise ScratchTranspileError("Scratch payload is empty")
    if len(source_code.encode("utf-8")) > 512 * 1024:
        raise ScratchTranspileError("Scratch payload exceeds 512KB")
    try:
        data = json.loads(source_code)
        validate_json_tree(data)
    except (json.JSONDecodeError, UploadValidationError) as exc:
        raise ScratchTranspileError(f"Invalid Scratch JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ScratchTranspileError("Scratch payload must be a JSON object")
    python_code = data.get("python_code")
    if not isinstance(python_code, str) or not python_code.strip():
        raise ScratchTranspileError("Scratch payload requires non-empty python_code")
    if len(python_code.encode("utf-8")) > 256 * 1024:
        raise ScratchTranspileError("Generated Scratch Python exceeds 256KB")
    return python_code
