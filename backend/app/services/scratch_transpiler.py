import json

class ScratchTranspileError(Exception):
    pass

def transpile_scratch_to_python(source_code: str) -> str:
    """
    Extracts the compiled Python code from the visual editor's JSON payload.
    If the source_code is already raw python, returns it.
    """
    try:
        data = json.loads(source_code.strip())
        if isinstance(data, dict) and "python_code" in data:
            return data["python_code"]
    except json.JSONDecodeError:
        pass
    
    return source_code
