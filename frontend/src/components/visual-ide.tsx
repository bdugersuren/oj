"use client";

import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { 
  Play, Pause, Square, Plus, Trash2, Edit2, Upload, 
  Code, RefreshCw, ChevronRight, Check, PlayCircle, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

// ─── Visual Block Type Definition ────────────────────────────────────────────
export interface VisualBlock {
  id: string;
  type: "declare" | "assign" | "input" | "output" | "if" | "while" | "for";
  data: {
    name?: string;
    type?: "Integer" | "Real" | "String" | "Boolean";
    variable?: string;
    value?: string;
    expression?: string;
    start?: string;
    end?: string;
    step?: string;
    direction?: "inc" | "dec";
    newline?: boolean;
    then_blocks?: VisualBlock[];
    else_blocks?: VisualBlock[];
    body_blocks?: VisualBlock[];
  };
}

// Helper to generate unique IDs
const makeId = () => Math.random().toString(36).substr(2, 9);

// Default starting flowchart blocks
const INITIAL_BLOCKS: VisualBlock[] = [
  { id: makeId(), type: "declare", data: { name: "a", type: "Integer" } },
  { id: makeId(), type: "declare", data: { name: "b", type: "Integer" } },
  { id: makeId(), type: "input", data: { variable: "a" } },
  { id: makeId(), type: "input", data: { variable: "b" } },
  { id: makeId(), type: "assign", data: { variable: "a", value: "a + b" } },
  { id: makeId(), type: "output", data: { expression: "a", newline: true } }
];

// ─── Real-time Python & C++ Code Generator ──────────────────────────────────
export function generateSourceCode(blocks: VisualBlock[], targetLang: "python" | "cpp"): { code: string; lineMap: Record<string, number> } {
  let lines: string[] = [];
  let lineMap: Record<string, number> = {}; // blockId -> line number (1-based)
  
  if (targetLang === "python") {
    lines.push("import random");
    lines.push("import math");
    lines.push("");
    
    function genPythonNodes(nodes: VisualBlock[], indent: string) {
      for (let node of nodes) {
        lineMap[node.id] = lines.length + 1;
        if (node.type === "declare") {
          const initVal = node.data.type === "Integer" ? "0" : node.data.type === "Real" ? "0.0" : node.data.type === "Boolean" ? "False" : '""';
          lines.push(`${indent}${node.data.name} = ${initVal}`);
        } else if (node.type === "assign") {
          lines.push(`${indent}${node.data.variable} = ${node.data.value || "0"}`);
        } else if (node.type === "input") {
          lines.push(`${indent}${node.data.variable} = int(input()) # Fallback to int input`);
        } else if (node.type === "output") {
          lines.push(`${indent}print(${node.data.expression || '""'}, end=${node.data.expression ? '"\\n"' : '""'})`);
        } else if (node.type === "if") {
          lines.push(`${indent}if ${node.data.expression || "True"}:`);
          const thenB = node.data.then_blocks || [];
          const startLen = lines.length;
          genPythonNodes(thenB, indent + "    ");
          if (lines.length === startLen) lines.push(`${indent}    pass`);
          
          lines.push(`${indent}else:`);
          const elseB = node.data.else_blocks || [];
          const elseStartLen = lines.length;
          genPythonNodes(elseB, indent + "    ");
          if (lines.length === elseStartLen) lines.push(`${indent}    pass`);
        } else if (node.type === "while") {
          lines.push(`${indent}while ${node.data.expression || "False"}:`);
          const bodyB = node.data.body_blocks || [];
          const startLen = lines.length;
          genPythonNodes(bodyB, indent + "    ");
          if (lines.length === startLen) lines.push(`${indent}    pass`);
        } else if (node.type === "for") {
          const step = node.data.step || "1";
          const endVal = node.data.direction === "dec" ? `(${node.data.end || "0"}) - 1` : `(${node.data.end || "0"}) + 1`;
          const stepVal = node.data.direction === "dec" ? `-${step}` : step;
          lines.push(`${indent}for ${node.data.variable || "i"} in range(${node.data.start || "0"}, ${endVal}, ${stepVal}):`);
          const bodyB = node.data.body_blocks || [];
          const startLen = lines.length;
          genPythonNodes(bodyB, indent + "    ");
          if (lines.length === startLen) lines.push(`${indent}    pass`);
        }
      }
    }
    
    genPythonNodes(blocks, "");
  } else {
    // C++
    lines.push("#include <iostream>");
    lines.push("#include <string>");
    lines.push("#include <cmath>");
    lines.push("using namespace std;");
    lines.push("");
    lines.push("int main() {");
    lines.push("    ios_base::sync_with_stdio(false);");
    lines.push("    cin.tie(NULL);");
    lines.push("");
    
    function genCppNodes(nodes: VisualBlock[], indent: string) {
      for (let node of nodes) {
        lineMap[node.id] = lines.length + 1;
        if (node.type === "declare") {
          const cppType = node.data.type === "Integer" ? "long long" : node.data.type === "Real" ? "double" : node.data.type === "Boolean" ? "bool" : "string";
          lines.push(`${indent}${cppType} ${node.data.name || "x"};`);
        } else if (node.type === "assign") {
          lines.push(`${indent}${node.data.variable || "x"} = ${node.data.value || "0"};`);
        } else if (node.type === "input") {
          lines.push(`${indent}cin >> ${node.data.variable || "x"};`);
        } else if (node.type === "output") {
          lines.push(`${indent}cout << ${node.data.expression || '""'} << "\\n";`);
        } else if (node.type === "if") {
          lines.push(`${indent}if (${node.data.expression || "true"}) {`);
          genCppNodes(node.data.then_blocks || [], indent + "    ");
          lines.push(`${indent}} else {`);
          genCppNodes(node.data.else_blocks || [], indent + "    ");
          lines.push(`${indent}}`);
        } else if (node.type === "while") {
          lines.push(`${indent}while (${node.data.expression || "false"}) {`);
          genCppNodes(node.data.body_blocks || [], indent + "    ");
          lines.push(`${indent}}`);
        } else if (node.type === "for") {
          const stepOp = node.data.direction === "dec" ? "-=" : "+=";
          const compOp = node.data.direction === "dec" ? ">=" : "<=";
          lines.push(`${indent}for (long long ${node.data.variable || "i"} = ${node.data.start || "0"}; ${node.data.variable || "i"} ${compOp} ${node.data.end || "0"}; ${node.data.variable || "i"} ${stepOp} ${node.data.step || "1"}) {`);
          genCppNodes(node.data.body_blocks || [], indent + "    ");
          lines.push(`${indent}}`);
        }
      }
    }
    
    genCppNodes(blocks, "    ");
    lines.push("    return 0;");
    lines.push("}");
  }
  
  return { code: lines.join("\n"), lineMap };
}

// ─── Flowgorithm XML Builder (.fprg structure) ──────────────────────────────
export function buildFprgXml(blocks: VisualBlock[]): string {
  let xml = '<?xml version="1.0"?>\n<program name="Main">\n';
  xml += '    <attributes>\n        <attribute name="name" value=""/>\n        <attribute name="authors" value=""/>\n    </attributes>\n';
  xml += '    <function name="Main" type="None" variable="">\n        <parameters/>\n        <body>\n';
  
  function serializeNodes(nodes: VisualBlock[], indent: string): string {
    let out = "";
    for (let node of nodes) {
      if (node.type === "declare") {
        out += `${indent}<declare name="${node.data.name || ""}" type="${node.data.type || "Integer"}" array="False" size=""/>\n`;
      } else if (node.type === "assign") {
        out += `${indent}<assign variable="${node.data.variable || ""}" value="${node.data.value || ""}"/>\n`;
      } else if (node.type === "input") {
        out += `${indent}<input variable="${node.data.variable || ""}"/>\n`;
      } else if (node.type === "output") {
        out += `${indent}<output expression="${node.data.expression || ""}" newline="${node.data.newline ? "True" : "False"}"/>\n`;
      } else if (node.type === "if") {
        out += `${indent}<if expression="${node.data.expression || ""}">\n`;
        out += `${indent}    <then>\n`;
        out += serializeNodes(node.data.then_blocks || [], indent + "        ");
        out += `${indent}    </then>\n`;
        out += `${indent}    <else>\n`;
        out += serializeNodes(node.data.else_blocks || [], indent + "        ");
        out += `${indent}    </else>\n`;
        out += `${indent}</if>\n`;
      } else if (node.type === "while") {
        out += `${indent}<while expression="${node.data.expression || ""}">\n`;
        out += serializeNodes(node.data.body_blocks || [], indent + "    ");
        out += `${indent}</while>\n`;
      } else if (node.type === "for") {
        out += `${indent}<for variable="${node.data.variable || ""}" start="${node.data.start || ""}" end="${node.data.end || ""}" direction="${node.data.direction || "inc"}" step="${node.data.step || "1"}">\n`;
        out += serializeNodes(node.data.body_blocks || [], indent + "    ");
        out += `${indent}</for>\n`;
      }
    }
    return out;
  }
  
  xml += serializeNodes(blocks, "            ");
  xml += '        </body>\n    </function>\n</program>';
  return xml;
}

// ─── Visual Blocks Parser from XML ───────────────────────────────────────────
export function parseFprgXml(xmlStr: string): VisualBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  const body = doc.querySelector("function[name='Main'] > body");
  if (!body) return [];
  
  function parseNodes(elements: Element[]): VisualBlock[] {
    let list: VisualBlock[] = [];
    for (let el of elements) {
      const tag = el.tagName.toLowerCase();
      if (tag === "declare") {
        list.push({
          id: makeId(),
          type: "declare",
          data: {
            name: el.getAttribute("name") || "",
            type: (el.getAttribute("type") as any) || "Integer"
          }
        });
      } else if (tag === "assign") {
        list.push({
          id: makeId(),
          type: "assign",
          data: {
            variable: el.getAttribute("variable") || "",
            value: el.getAttribute("value") || ""
          }
        });
      } else if (tag === "input") {
        list.push({
          id: makeId(),
          type: "input",
          data: {
            variable: el.getAttribute("variable") || ""
          }
        });
      } else if (tag === "output") {
        list.push({
          id: makeId(),
          type: "output",
          data: {
            expression: el.getAttribute("expression") || "",
            newline: el.getAttribute("newline")?.toLowerCase() !== "false"
          }
        });
      } else if (tag === "if") {
        const thenEl = el.querySelector(":scope > then");
        const elseEl = el.querySelector(":scope > else");
        list.push({
          id: makeId(),
          type: "if",
          data: {
            expression: el.getAttribute("expression") || "",
            then_blocks: thenEl ? parseNodes(Array.from(thenEl.children)) : [],
            else_blocks: elseEl ? parseNodes(Array.from(elseEl.children)) : []
          }
        });
      } else if (tag === "while") {
        list.push({
          id: makeId(),
          type: "while",
          data: {
            expression: el.getAttribute("expression") || "",
            body_blocks: parseNodes(Array.from(el.children))
          }
        });
      } else if (tag === "for") {
        list.push({
          id: makeId(),
          type: "for",
          data: {
            variable: el.getAttribute("variable") || "",
            start: el.getAttribute("start") || "",
            end: el.getAttribute("end") || "",
            direction: (el.getAttribute("direction") as any) || "inc",
            step: el.getAttribute("step") || "1",
            body_blocks: parseNodes(Array.from(el.children))
          }
        });
      }
    }
    return list;
  }
  
  return parseNodes(Array.from(body.children));
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
interface VisualIdeProps {
  code: string;
  sourceCode: string;
  setSourceCode: (val: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  resolvedTheme: string;
  isSubmitting: boolean;
  onSubmit: (finalLang: string, finalSource: string) => void;
}

export function VisualIde({
  code,
  sourceCode,
  setSourceCode,
  language,
  setLanguage,
  resolvedTheme,
  isSubmitting,
  onSubmit
}: VisualIdeProps) {
  const [editorMode, setEditorMode] = useState<"code" | "flowchart" | "scratch">("code");
  const [visualBlocks, setVisualBlocks] = useState<VisualBlock[]>(INITIAL_BLOCKS);
  const [targetLang, setTargetLang] = useState<"python" | "cpp">("python");
  const [activeDebugId, setActiveDebugId] = useState<string | null>(null);
  const [activeDebugLine, setActiveDebugLine] = useState<number | null>(null);
  
  // Debugger state simulation
  const [debugVariables, setDebugVariables] = useState<Record<string, any>>({});
  const [debugOutput, setDebugOutput] = useState<string[]>([]);
  const [isDebugging, setIsDebugging] = useState<boolean>(false);
  const [debugStepIndex, setDebugStepIndex] = useState<number>(0);
  const debugQueueRef = useRef<VisualBlock[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Real-time generated code pane
  const { code: generatedCode, lineMap: generatedLineMap } = generateSourceCode(visualBlocks, targetLang);
  
  // Sync editor value when switching modes
  const handleEditorModeChange = (mode: "code" | "flowchart" | "scratch") => {
    setEditorMode(mode);
    setIsDebugging(false);
    setActiveDebugId(null);
    setActiveDebugLine(null);
    
    if (mode === "code") {
      setLanguage(targetLang === "python" ? "python3" : "g++20");
    } else if (mode === "flowchart") {
      setLanguage("flowgorithm");
    } else {
      setLanguage("scratch");
    }
  };
  
  // Flowchart editor block adding / removal
  const addBlock = (type: VisualBlock["type"], parentBlocks?: VisualBlock[], index?: number) => {
    const newBlock: VisualBlock = {
      id: makeId(),
      type,
      data: type === "declare" ? { name: "x", type: "Integer" } : 
            type === "assign" ? { variable: "x", value: "0" } :
            type === "input" ? { variable: "x" } :
            type === "output" ? { expression: "x", newline: true } :
            type === "if" ? { expression: "x > 0", then_blocks: [], else_blocks: [] } :
            type === "while" ? { expression: "x < 5", body_blocks: [] } :
            { variable: "i", start: "1", end: "5", step: "1", direction: "inc", body_blocks: [] }
    };
    
    if (parentBlocks) {
      if (index !== undefined) {
        parentBlocks.splice(index, 0, newBlock);
      } else {
        parentBlocks.push(newBlock);
      }
      setVisualBlocks([...visualBlocks]);
    } else {
      if (index !== undefined) {
        const copy = [...visualBlocks];
        copy.splice(index, 0, newBlock);
        setVisualBlocks(copy);
      } else {
        setVisualBlocks([...visualBlocks, newBlock]);
      }
    }
    toast.success("Блок амжилттай нэмэгдлээ.");
  };
  
  const removeBlock = (id: string, parentBlocks?: VisualBlock[]) => {
    if (parentBlocks) {
      const idx = parentBlocks.findIndex(b => b.id === id);
      if (idx !== -1) {
        parentBlocks.splice(idx, 1);
        setVisualBlocks([...visualBlocks]);
      }
    } else {
      setVisualBlocks(visualBlocks.filter(b => b.id !== id));
    }
    toast.success("Блок устгагдлаа.");
  };
  
  const updateBlockData = (id: string, data: any, parentBlocks?: VisualBlock[]) => {
    const list = parentBlocks || visualBlocks;
    const findAndUpdate = (blocks: VisualBlock[]): boolean => {
      for (let b of blocks) {
        if (b.id === id) {
          b.data = { ...b.data, ...data };
          return true;
        }
        if (b.data.then_blocks && findAndUpdate(b.data.then_blocks)) return true;
        if (b.data.else_blocks && findAndUpdate(b.data.else_blocks)) return true;
        if (b.data.body_blocks && findAndUpdate(b.data.body_blocks)) return true;
      }
      return false;
    };
    findAndUpdate(list);
    setVisualBlocks([...visualBlocks]);
  };
  
  // File upload support (.fprg)
  const handleFprgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const xmlStr = event.target?.result as string;
      try {
        const blocks = parseFprgXml(xmlStr);
        if (blocks.length > 0) {
          setVisualBlocks(blocks);
          toast.success("Flowgorithm файл амжилттай ачаалагдлаа!");
        } else {
          toast.error("XML-ээс ачаалахад блок олдсонгүй.");
        }
      } catch (err) {
        toast.error("Файлыг уншихад алдаа гарлаа. XML зөв бүтэцтэй эсэхийг шалгана уу.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  
  // Submit implementation
  const handleVisualSubmit = () => {
    if (editorMode === "code") {
      onSubmit(language, sourceCode);
    } else if (editorMode === "flowchart") {
      const xml = buildFprgXml(visualBlocks);
      onSubmit("flowgorithm", xml);
    } else {
      // Scratch mode - submit JSON package containing blocks & transpiled python/cpp
      const payload = JSON.stringify({
        blocks_xml: buildFprgXml(visualBlocks),
        python_code: generateSourceCode(visualBlocks, "python").code,
        cpp_code: generateSourceCode(visualBlocks, "cpp").code
      });
      onSubmit("scratch", payload);
    }
  };
  
  // Stepper execution debugger simulation
  const startDebugging = () => {
    // Collect flat list of blocks to run step-by-step
    let queue: VisualBlock[] = [];
    function flatten(nodes: VisualBlock[]) {
      for (let n of nodes) {
        queue.push(n);
        if (n.type === "if") {
          // Flatten conditionally based on simulated evaluation
          // For debugger simulation, we'll just run both branches or mock execution
          flatten(n.data.then_blocks || []);
        } else if (n.type === "while" || n.type === "for") {
          flatten(n.data.body_blocks || []);
        }
      }
    }
    flatten(visualBlocks);
    debugQueueRef.current = queue;
    
    setDebugVariables({});
    setDebugOutput([]);
    setDebugStepIndex(0);
    setIsDebugging(true);
    
    if (queue.length > 0) {
      runStep(0, queue);
    }
  };
  
  const runStep = (idx: number, queue: VisualBlock[]) => {
    if (idx >= queue.length) {
      setIsDebugging(false);
      setActiveDebugId(null);
      setActiveDebugLine(null);
      toast.success("Алхам алхмаар ажиллуулж дууслаа.");
      return;
    }
    
    const block = queue[idx];
    setActiveDebugId(block.id);
    const line = generatedLineMap[block.id];
    if (line) {
      setActiveDebugLine(line);
    }
    
    // Simulate node execution
    setDebugVariables(prev => {
      let next = { ...prev };
      if (block.type === "declare" && block.data.name) {
        next[block.data.name] = block.data.type === "Integer" ? 0 : 0.0;
      } else if (block.type === "assign" && block.data.variable) {
        next[block.data.variable] = block.data.value; // simple assignment
      } else if (block.type === "input" && block.data.variable) {
        next[block.data.variable] = Math.floor(Math.random() * 10) + 1; // mock input
      }
      return next;
    });
    
    if (block.type === "output" && block.data.expression) {
      setDebugOutput(prev => [...prev, `stdout: ${block.data.expression}`]);
    }
  };
  
  const stepNext = () => {
    const nextIdx = debugStepIndex + 1;
    setDebugStepIndex(nextIdx);
    runStep(nextIdx, debugQueueRef.current);
  };
  
  const stopDebugging = () => {
    setIsDebugging(false);
    setActiveDebugId(null);
    setActiveDebugLine(null);
  };

  // Render a visual block card
  const renderBlockNode = (node: VisualBlock, parentBlocks?: VisualBlock[]) => {
    const isActive = activeDebugId === node.id;
    const blockColors: Record<string, string> = {
      declare: "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50",
      assign: "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50",
      input: "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50",
      output: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50",
      if: "border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50",
      while: "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50",
      for: "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50"
    };
    
    return (
      <div 
        key={node.id} 
        className={`p-3 rounded-2xl border text-xs flex flex-col gap-2 transition-all duration-300 relative ${
          isActive 
            ? "border-brand-cyan bg-brand-cyan/15 shadow-[0_0_15px_rgba(34,211,238,0.25)] scale-[1.02] ring-2 ring-brand-cyan/25" 
            : blockColors[node.type]
        }`}
      >
        <div className="flex items-center justify-between font-bold text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${
              node.type === "declare" ? "bg-rose-500" :
              node.type === "assign" ? "bg-amber-500" :
              node.type === "input" ? "bg-blue-500" :
              node.type === "output" ? "bg-emerald-500" :
              node.type === "if" ? "bg-purple-500" : "bg-orange-500"
            }`} />
            {node.type}
          </span>
          <button 
            onClick={() => removeBlock(node.id, parentBlocks)}
            className="text-muted-foreground hover:text-rose-500 p-0.5"
            title="Устгах"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {/* Render Editable Inputs */}
        <div className="flex flex-wrap gap-2 items-center text-xs font-mono">
          {node.type === "declare" && (
            <>
              <span>Хувьсагч:</span>
              <input 
                type="text" 
                value={node.data.name || ""} 
                onChange={(e) => updateBlockData(node.id, { name: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground w-16"
              />
              <span>Төрөл:</span>
              <select 
                value={node.data.type || "Integer"}
                onChange={(e) => updateBlockData(node.id, { type: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground text-[10px]"
              >
                <option value="Integer">Integer</option>
                <option value="Real">Real</option>
                <option value="String">String</option>
                <option value="Boolean">Boolean</option>
              </select>
            </>
          )}
          
          {node.type === "assign" && (
            <>
              <input 
                type="text" 
                value={node.data.variable || ""} 
                onChange={(e) => updateBlockData(node.id, { variable: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground w-16"
              />
              <span>=</span>
              <input 
                type="text" 
                value={node.data.value || ""} 
                onChange={(e) => updateBlockData(node.id, { value: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground w-28"
              />
            </>
          )}
          
          {node.type === "input" && (
            <>
              <span>Унших:</span>
              <input 
                type="text" 
                value={node.data.variable || ""} 
                onChange={(e) => updateBlockData(node.id, { variable: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground w-20"
              />
            </>
          )}
          
          {node.type === "output" && (
            <>
              <span>Хэвлэх:</span>
              <input 
                type="text" 
                value={node.data.expression || ""} 
                onChange={(e) => updateBlockData(node.id, { expression: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground w-36"
              />
            </>
          )}
          
          {node.type === "if" && (
            <>
              <span>Хэрэв:</span>
              <input 
                type="text" 
                value={node.data.expression || ""} 
                onChange={(e) => updateBlockData(node.id, { expression: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground w-40"
              />
            </>
          )}
          
          {node.type === "while" && (
            <>
              <span>Хүртэл:</span>
              <input 
                type="text" 
                value={node.data.expression || ""} 
                onChange={(e) => updateBlockData(node.id, { expression: e.target.value }, parentBlocks)}
                className="bg-secondary px-2 py-0.5 rounded border border-border/40 text-foreground w-32"
              />
            </>
          )}
          
          {node.type === "for" && (
            <>
              <span>Тоологч:</span>
              <input 
                type="text" 
                value={node.data.variable || "i"} 
                onChange={(e) => updateBlockData(node.id, { variable: e.target.value }, parentBlocks)}
                className="bg-secondary px-1.5 py-0.5 rounded border border-border/40 text-foreground w-12"
              />
              <span>эхлэл:</span>
              <input 
                type="text" 
                value={node.data.start || "1"} 
                onChange={(e) => updateBlockData(node.id, { start: e.target.value }, parentBlocks)}
                className="bg-secondary px-1.5 py-0.5 rounded border border-border/40 text-foreground w-10"
              />
              <span>төгсгөл:</span>
              <input 
                type="text" 
                value={node.data.end || "5"} 
                onChange={(e) => updateBlockData(node.id, { end: e.target.value }, parentBlocks)}
                className="bg-secondary px-1.5 py-0.5 rounded border border-border/40 text-foreground w-10"
              />
            </>
          )}
        </div>
        
        {/* Nestable child blocks render */}
        {node.type === "if" && (
          <div className="pl-4 border-l border-purple-500/30 space-y-3 mt-2">
            <div>
              <div className="font-bold text-[9px] text-purple-400 mb-1">ЗӨВ БОЛ:</div>
              <div className="space-y-2">
                {(node.data.then_blocks || []).map(b => renderBlockNode(b, node.data.then_blocks))}
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 hover:bg-purple-500/10 text-purple-400" onClick={() => addBlock("assign", node.data.then_blocks)}>+ Assign</Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 hover:bg-purple-500/10 text-purple-400" onClick={() => addBlock("output", node.data.then_blocks)}>+ Output</Button>
                </div>
              </div>
            </div>
            <div>
              <div className="font-bold text-[9px] text-purple-400 mb-1">БУРУУ БОЛ:</div>
              <div className="space-y-2">
                {(node.data.else_blocks || []).map(b => renderBlockNode(b, node.data.else_blocks))}
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 hover:bg-purple-500/10 text-purple-400" onClick={() => addBlock("assign", node.data.else_blocks)}>+ Assign</Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 hover:bg-purple-500/10 text-purple-400" onClick={() => addBlock("output", node.data.else_blocks)}>+ Output</Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {(node.type === "while" || node.type === "for") && (
          <div className="pl-4 border-l border-orange-500/30 space-y-2 mt-2">
            <div className="font-bold text-[9px] text-orange-400 mb-1">ДАВТАХ:</div>
            {(node.data.body_blocks || []).map(b => renderBlockNode(b, node.data.body_blocks))}
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 hover:bg-orange-500/10 text-orange-400" onClick={() => addBlock("assign", node.data.body_blocks)}>+ Assign</Button>
              <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 hover:bg-orange-500/10 text-orange-400" onClick={() => addBlock("output", node.data.body_blocks)}>+ Output</Button>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-card/20 select-text">
      {/* Visual Editor Toolbar */}
      <div className="h-11 bg-[#252526] border-b border-white/5 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex bg-secondary p-0.5 rounded-lg border border-border/40 mr-4">
            <button
              onClick={() => handleEditorModeChange("code")}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                editorMode === "code" ? "bg-background text-brand-cyan shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Код редактор
            </button>
            <button
              onClick={() => handleEditorModeChange("flowchart")}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                editorMode === "flowchart" ? "bg-background text-brand-cyan shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Урсгалын зураг
            </button>
            <button
              onClick={() => handleEditorModeChange("scratch")}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                editorMode === "scratch" ? "bg-background text-brand-cyan shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Scratch Блок
            </button>
          </div>
          
          {/* Language / Target Selection */}
          {editorMode === "code" ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Хэл:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-[#333333] text-xs text-white px-2 py-0.5 rounded border border-white/10 outline-none"
              >
                <option value="g++20">C++20</option>
                <option value="g++23">C++23</option>
                <option value="python3">Python 3</option>
                <option value="java">Java 21/25</option>
                <option value="go">Go</option>
                <option value="cargo">Rust</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
              <span>Хөрвөх хэл:</span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as any)}
                className="bg-[#333333] text-xs text-white px-2 py-0.5 rounded border border-white/10 outline-none"
              >
                <option value="python">Python 3</option>
                <option value="cpp">C++20</option>
              </select>
            </div>
          )}
        </div>
        
        {/* Right side buttons */}
        <div className="flex items-center gap-2">
          {/* Flowchart import files */}
          {editorMode === "flowchart" && (
            <>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFprgUpload}
                className="hidden" 
                accept=".fprg"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-7 text-xs text-slate-400 hover:text-brand-cyan gap-1"
              >
                <Upload className="w-3.5 h-3.5" /> .fprg Файл унших
              </Button>
            </>
          )}
          
          {editorMode !== "code" && (
            <div className="flex items-center gap-1 border-l border-border/50 pl-2 mr-2">
              {isDebugging ? (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={stepNext}
                    className="h-7 text-xs text-emerald-400 hover:text-emerald-300 gap-1"
                  >
                    <Play className="w-3 h-3" /> Алхам (Step)
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={stopDebugging}
                    className="h-7 text-xs text-rose-400 hover:text-rose-300 gap-1"
                  >
                    <Square className="w-3 h-3" /> Зогсоох
                  </Button>
                </>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={startDebugging}
                  className="h-7 text-xs text-brand-cyan hover:text-brand-cyan/80 gap-1"
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Алхам ажиллуулах
                </Button>
              )}
            </div>
          )}
          
          <Button
            size="sm"
            onClick={handleVisualSubmit}
            disabled={isSubmitting}
            className="h-8 text-xs gradient-brand text-white border-0 hover:opacity-90 shadow-md shadow-brand-cyan/20 gap-1.5 font-bold cursor-pointer"
          >
            {isSubmitting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Шалгаж байна...</>
            ) : (
              <><Code className="w-3.5 h-3.5" /> Илгээх</>
            )}
          </Button>
        </div>
      </div>
      
      {/* Editor Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {editorMode === "code" ? (
          <div className="flex-1 relative">
            <Editor
              height="100%"
              language={language.startsWith("python") ? "python" : language.startsWith("java") ? "java" : "cpp"}
              theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
              value={sourceCode}
              onChange={(value) => setSourceCode(value || "")}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                fontFamily: "JetBrains Mono, monospace"
              }}
            />
          </div>
        ) : (
          // Visual Block IDE split pane layout
          <div className="flex-1 flex">
            {/* Visual Editor Canvas (Left) */}
            <div className="w-1/2 flex flex-col border-r border-border/40 overflow-y-auto p-4 space-y-3 bg-[#1e1e1e]/60 scrollbar-thin">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="font-bold text-[10px] uppercase text-muted-foreground tracking-wider">
                  {editorMode === "flowchart" ? "Flowchart зургийн блокууд" : "Scratch Блок удирдах"}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5 hover:bg-secondary" onClick={() => addBlock("declare")}>+ Declare</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5 hover:bg-secondary" onClick={() => addBlock("assign")}>+ Assign</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5 hover:bg-secondary" onClick={() => addBlock("input")}>+ Input</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5 hover:bg-secondary" onClick={() => addBlock("output")}>+ Output</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5 hover:bg-secondary" onClick={() => addBlock("if")}>+ If/Else</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5 hover:bg-secondary" onClick={() => addBlock("while")}>+ While</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[9px] px-1.5 hover:bg-secondary" onClick={() => addBlock("for")}>+ For</Button>
                </div>
              </div>
              
              <div className="space-y-3">
                {visualBlocks.map(block => renderBlockNode(block))}
              </div>
            </div>
            
            {/* Live Generated Code & Variables View (Right) */}
            <div className="w-1/2 flex flex-col bg-[#1e1e1e] overflow-hidden">
              <div className="h-7 bg-[#252526] border-b border-white/5 px-4 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase shrink-0">
                <span>{targetLang.toUpperCase()} Хэл дээр үүссэн код</span>
                <span>Зэрэгцээ Харагдац</span>
              </div>
              
              {/* Highlight active execution line inside code view */}
              <div className="flex-1 relative overflow-y-auto font-mono text-xs p-4 leading-relaxed bg-[#1e1e1e]">
                {generatedCode.split("\n").map((lineText, idx) => {
                  const lineNum = idx + 1;
                  const isLineActive = activeDebugLine === lineNum;
                  return (
                    <div 
                      key={idx} 
                      className={`flex gap-4 -mx-4 px-4 transition-all duration-300 ${
                        isLineActive ? "bg-amber-500/20 text-amber-300 font-bold border-l-2 border-amber-500" : "text-slate-300 hover:bg-secondary/5"
                      }`}
                    >
                      <span className="w-6 text-right text-muted-foreground/60 select-none text-[10px]">{lineNum}</span>
                      <pre className="m-0 whitespace-pre">{lineText || " "}</pre>
                    </div>
                  );
                })}
              </div>
              
              {/* Stepper Variables / Output pane when debugging */}
              {isDebugging && (
                <div className="h-36 border-t border-border bg-card flex flex-col shrink-0 font-mono text-[10px]">
                  <div className="h-7 bg-secondary border-b border-border px-3 flex items-center justify-between shrink-0 font-bold text-muted-foreground text-[9px] uppercase tracking-wider">
                    <span>Хувьсагчдын Хяналт & Гаралт</span>
                    <span>Алхам #{debugStepIndex + 1}</span>
                  </div>
                  <div className="flex-1 flex divide-x divide-border/30 overflow-hidden">
                    {/* Watch Variables */}
                    <div className="w-1/2 p-2.5 overflow-y-auto space-y-1.5 scrollbar-thin">
                      <div className="font-bold text-[9px] text-brand-cyan mb-1.5">ХУВЬСАГЧИД (Variables Watch):</div>
                      {Object.keys(debugVariables).length === 0 ? (
                        <div className="italic text-muted-foreground">Зарласан хувьсагч байхгүй байна.</div>
                      ) : (
                        Object.entries(debugVariables).map(([k, v]) => (
                          <div key={k} className="flex justify-between border-b border-border/10 pb-0.5">
                            <span className="text-slate-200">{k}</span>
                            <span className="text-brand-cyan font-bold">{String(v)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Simulation Outputs */}
                    <div className="w-1/2 p-2.5 overflow-y-auto space-y-1.5 scrollbar-thin">
                      <div className="font-bold text-[9px] text-emerald-400 mb-1.5">КОНСОЛЫН ГАРАЛТ (Simulation Output):</div>
                      {debugOutput.length === 0 ? (
                        <div className="italic text-muted-foreground">Гаралт хоосон байна.</div>
                      ) : (
                        debugOutput.map((out, idx) => (
                          <div key={idx} className="text-emerald-400">{out}</div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
