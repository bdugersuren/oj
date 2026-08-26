import xml.etree.ElementTree as ET
import re

class FlowgorithmTranspileError(Exception):
    pass


MAX_FPRG_BYTES = 512 * 1024
MAX_FPRG_NODES = 5_000
MAX_FPRG_DEPTH = 100


def _validate_xml_tree(root) -> None:
    stack = [(root, 1)]
    nodes = 0
    while stack:
        node, depth = stack.pop()
        nodes += 1
        if nodes > MAX_FPRG_NODES:
            raise FlowgorithmTranspileError("Flowgorithm document has too many nodes")
        if depth > MAX_FPRG_DEPTH:
            raise FlowgorithmTranspileError("Flowgorithm document is too deeply nested")
        if len(node.attrib) > 50 or any(
            len(str(value).encode("utf-8")) > 64 * 1024
            for value in node.attrib.values()
        ):
            raise FlowgorithmTranspileError("Flowgorithm attributes exceed limits")
        stack.extend((child, depth + 1) for child in list(node))

def translate_expression(expr: str) -> str:
    if not expr:
        return ""
    
    # Replace logical operators
    expr = re.sub(r'\b&&\b|\band\b', ' and ', expr, flags=re.IGNORECASE)
    expr = re.sub(r'\b\|\|\b|\bor\b', ' or ', expr, flags=re.IGNORECASE)
    expr = re.sub(r'\b!\b|\bnot\b', ' not ', expr, flags=re.IGNORECASE)
    
    # Replace string concatenation operator '&' with '+' in Python
    # Flowgorithm uses '&' for string concatenation. We'll replace it with '+'
    expr = expr.replace('&', '+')
    
    # Replace common builtins (case-insensitive)
    builtins = {
        r'\bSize\((.*?)\)': r'len(\1)',
        r'\bLen\((.*?)\)': r'len(\1)',
        r'\bToChar\((.*?)\)': r'chr(\1)',
        r'\bToCode\((.*?)\)': r'ord(\1)',
        r'\bToString\((.*?)\)': r'str(\1)',
        r'\bToInteger\((.*?)\)': r'int(\1)',
        r'\bToReal\((.*?)\)': r'float(\1)',
        r'\bRandom\((.*?)\)': r'random.randint(0, (\1) - 1)',
    }
    
    for pattern, repl in builtins.items():
        expr = re.sub(pattern, repl, expr, flags=re.IGNORECASE)
        
    return expr

def transpile_fprg_to_python(xml_content: str) -> str:
    if not isinstance(xml_content, str) or not xml_content.strip():
        raise FlowgorithmTranspileError("Flowgorithm document is empty")
    if len(xml_content.encode("utf-8")) > MAX_FPRG_BYTES:
        raise FlowgorithmTranspileError("Flowgorithm document exceeds 512KB")
    upper_source = xml_content.upper()
    if "<!DOCTYPE" in upper_source or "<!ENTITY" in upper_source:
        raise FlowgorithmTranspileError("DTD and entity declarations are not allowed")
    try:
        root = ET.fromstring(xml_content.strip())
    except Exception as e:
        raise FlowgorithmTranspileError(f"Invalid XML format: {e}")
        
    if root.tag != "program":
        raise FlowgorithmTranspileError("Root tag must be <program>")
    _validate_xml_tree(root)
        
    # We will build symbol tables mapping variables to their types
    # First, let's pre-scan all declare tags in all functions to build symbol tables
    symbol_tables = {} # function_name -> {var_name -> type}
    
    for func in root.findall("function"):
        func_name = func.attrib.get("name", "Main")
        symbol_tables[func_name] = {}
        body = func.find("body")
        if body is not None:
            for decl in body.findall(".//declare"):
                name = decl.attrib.get("name")
                type_str = decl.attrib.get("type", "String")
                if name:
                    symbol_tables[func_name][name] = type_str
                    
    # Generate python code
    python_lines = []
    python_lines.append("import random")
    python_lines.append("import math")
    python_lines.append("")
    
    def translate_nodes(nodes, func_name, indent_level=0):
        indent = "    " * indent_level
        lines = []
        
        for node in nodes:
            tag = node.tag
            if tag == "declare":
                name = node.attrib.get("name")
                type_str = node.attrib.get("type", "String")
                is_array = node.attrib.get("array", "False").lower() == "true"
                if is_array:
                    lines.append(f"{indent}{name} = []")
                else:
                    if type_str == "Integer":
                        lines.append(f"{indent}{name} = 0")
                    elif type_str == "Real":
                        lines.append(f"{indent}{name} = 0.0")
                    elif type_str == "Boolean":
                        lines.append(f"{indent}{name} = False")
                    else:
                        lines.append(f"{indent}{name} = \"\"")
                        
            elif tag == "assign":
                var = node.attrib.get("variable")
                val = node.attrib.get("value")
                val_py = translate_expression(val)
                lines.append(f"{indent}{var} = {val_py}")
                
            elif tag == "input":
                var = node.attrib.get("variable")
                var_type = symbol_tables.get(func_name, {}).get(var, "String")
                if var_type == "Integer":
                    lines.append(f"{indent}{var} = int(input())")
                elif var_type == "Real":
                    lines.append(f"{indent}{var} = float(input())")
                elif var_type == "Boolean":
                    lines.append(f"{indent}{var} = input().strip().lower() in ('true', '1', 'yes')")
                else:
                    lines.append(f"{indent}{var} = input()")
                    
            elif tag == "output":
                expr = node.attrib.get("expression")
                newline = node.attrib.get("newline", "True").lower() == "true"
                expr_py = translate_expression(expr)
                if newline:
                    lines.append(f"{indent}print({expr_py})")
                else:
                    lines.append(f"{indent}print({expr_py}, end=\"\")")
                    
            elif tag == "if":
                cond = node.attrib.get("expression")
                cond_py = translate_expression(cond)
                lines.append(f"{indent}if {cond_py}:")
                
                then_node = node.find("then")
                then_lines = []
                if then_node is not None:
                    then_lines = translate_nodes(then_node, func_name, indent_level + 1)
                if not then_lines:
                    then_lines = [f"{indent}    pass"]
                lines.extend(then_lines)
                
                lines.append(f"{indent}else:")
                else_node = node.find("else")
                else_lines = []
                if else_node is not None:
                    else_lines = translate_nodes(else_node, func_name, indent_level + 1)
                if not else_lines:
                    else_lines = [f"{indent}    pass"]
                lines.extend(else_lines)
                
            elif tag == "while":
                cond = node.attrib.get("expression")
                cond_py = translate_expression(cond)
                lines.append(f"{indent}while {cond_py}:")
                
                body_lines = translate_nodes(node, func_name, indent_level + 1)
                if not body_lines:
                    body_lines = [f"{indent}    pass"]
                lines.extend(body_lines)
                
            elif tag == "for":
                var = node.attrib.get("variable")
                start = node.attrib.get("start")
                end = node.attrib.get("end")
                direction = node.attrib.get("direction", "inc").lower()
                step = node.attrib.get("step", "1")
                
                start_py = translate_expression(start)
                end_py = translate_expression(end)
                step_py = translate_expression(step)
                
                if direction == "inc":
                    lines.append(f"{indent}for {var} in range({start_py}, ({end_py}) + 1, {step_py}):")
                else:
                    lines.append(f"{indent}for {var} in range({start_py}, ({end_py}) - 1, -({step_py})):")
                    
                body_lines = translate_nodes(node, func_name, indent_level + 1)
                if not body_lines:
                    body_lines = [f"{indent}    pass"]
                lines.extend(body_lines)
                
            elif tag == "call":
                expr = node.attrib.get("expression")
                expr_py = translate_expression(expr)
                lines.append(f"{indent}{expr_py}")
                
        return lines

    # Translate functions
    functions = root.findall("function")
    main_defined = False
    
    for func in functions:
        func_name = func.attrib.get("name", "Main")
        if func_name == "Main":
            main_defined = True
            
        parameters = func.find("parameters")
        param_list = []
        if parameters is not None:
            for p in parameters.findall("parameter"):
                p_name = p.attrib.get("name")
                if p_name:
                    param_list.append(p_name)
                    
        params_str = ", ".join(param_list)
        python_lines.append(f"def {func_name}({params_str}):")
        
        body = func.find("body")
        body_lines = []
        if body is not None:
            body_lines = translate_nodes(body, func_name, 1)
        if not body_lines:
            body_lines = ["    pass"]
            
        python_lines.extend(body_lines)
        python_lines.append("")
        
    if main_defined:
        python_lines.append("if __name__ == '__main__':")
        python_lines.append("    Main()")
        
    return "\n".join(python_lines)
