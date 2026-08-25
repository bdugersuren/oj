import pytest
from app.services.flowgorithm_transpiler import transpile_fprg_to_python, FlowgorithmTranspileError
from app.services.scratch_transpiler import transpile_scratch_to_python

def test_flowgorithm_transpiler_simple():
    xml_content = """<?xml version="1.0"?>
<program name="Main">
    <attributes>
        <attribute name="name" value=""/>
        <attribute name="authors" value=""/>
    </attributes>
    <function name="Main" type="None" variable="">
        <parameters/>
        <body>
            <declare name="x" type="Integer" array="False" size=""/>
            <assign variable="x" value="5"/>
            <output expression="x" newline="True"/>
        </body>
    </function>
</program>
"""
    python_code = transpile_fprg_to_python(xml_content)
    assert "x = 0" in python_code
    assert "x = 5" in python_code
    assert "print(x)" in python_code
    assert "def Main():" in python_code
    assert "Main()" in python_code

def test_flowgorithm_transpiler_complex():
    xml_content = """<?xml version="1.0"?>
<program name="Main">
    <function name="Main" type="None" variable="">
        <parameters/>
        <body>
            <declare name="a" type="Integer" array="False" size=""/>
            <declare name="b" type="Integer" array="False" size=""/>
            <input variable="a"/>
            <input variable="b"/>
            <if expression="a &gt; b">
                <then>
                    <output expression="a" newline="True"/>
                </then>
                <else>
                    <output expression="b" newline="True"/>
                </else>
            </if>
        </body>
    </function>
</program>
"""
    python_code = transpile_fprg_to_python(xml_content)
    assert "a = int(input())" in python_code
    assert "b = int(input())" in python_code
    assert "if a > b:" in python_code
    assert "print(a)" in python_code
    assert "print(b)" in python_code

def test_scratch_transpiler():
    json_payload = '{"blocks_xml": "<xml></xml>", "python_code": "print(10)", "cpp_code": "cout << 10;"}'
    python_code = transpile_scratch_to_python(json_payload)
    assert python_code == "print(10)"
    
    # Fallback
    raw_python = "print(10)"
    assert transpile_scratch_to_python(raw_python) == "print(10)"
