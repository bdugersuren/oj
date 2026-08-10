"use client";

import React, { useState } from "react";
import {
  CheckCircle2, XCircle, AlertTriangle, ArrowRight,
  Copy, Check, Bug, Terminal, FileCode, Split
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

interface TestcaseDiff {
  id: number;
  input: string;
  expected: string;
  actual: string;
  status: "AC" | "WA" | "TLE";
  time: string;
  memory: string;
  diffLines: Array<{
    lineNum: number;
    expectedLine: string;
    actualLine: string;
    isMatch: boolean;
  }>;
}

const MOCK_DIFF_CASES: TestcaseDiff[] = [
  {
    id: 1,
    status: "AC",
    time: "4ms",
    memory: "1.8MB",
    input: "3 5\n",
    expected: "8\n",
    actual: "8\n",
    diffLines: [
      { lineNum: 1, expectedLine: "8", actualLine: "8", isMatch: true },
    ],
  },
  {
    id: 2,
    status: "AC",
    time: "8ms",
    memory: "2.4MB",
    input: "-10 25\n",
    expected: "15\n",
    actual: "15\n",
    diffLines: [
      { lineNum: 1, expectedLine: "15", actualLine: "15", isMatch: true },
    ],
  },
  {
    id: 3,
    status: "WA",
    time: "12ms",
    memory: "3.2MB",
    input: "1000000000 1000000000\n",
    expected: "2000000000\n",
    actual: "-294967296\n",
    diffLines: [
      { lineNum: 1, expectedLine: "2000000000", actualLine: "-294967296  (🚨 32-bit Integer Overflow!)", isMatch: false },
    ],
  },
];

export function TestcaseDiffDebugger() {
  const [selectedCaseId, setSelectedCaseId] = useState<number>(3);
  const currentCase = MOCK_DIFF_CASES.find((c) => c.id === selectedCaseId) || MOCK_DIFF_CASES[0];

  return (
    <div className="glass-strong rounded-3xl p-6 border border-border space-y-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="text-base font-black flex items-center gap-2">
            <Bug className="w-5 h-5 text-rose-500" />
            Visual Testcase Diff Debugger
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Зөв хариу ба таны хариуг мөр мөрөөр харьцуулан алдааг илрүүлэх хэрэгсэл
          </p>
        </div>

        {/* Testcase Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-secondary rounded-2xl">
          {MOCK_DIFF_CASES.map((tc) => {
            const isSelected = tc.id === selectedCaseId;
            const isAc = tc.status === "AC";
            return (
              <button
                key={tc.id}
                onClick={() => setSelectedCaseId(tc.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? isAc
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-rose-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAc ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Test #{tc.id}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input Data */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground flex items-center justify-between">
          <span>Оролтын Өгөгдөл (stdin)</span>
          <span className="font-mono text-[11px]">{currentCase.time} · {currentCase.memory}</span>
        </div>
        <pre className="bg-[#1e1e1e] text-slate-200 p-3 rounded-2xl font-mono text-xs overflow-x-auto border border-border">
          {currentCase.input}
        </pre>
      </div>

      {/* Side-by-Side Diff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Expected Output */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Зөв Гаралт (Expected Output)
          </div>
          <div className="bg-[#1e1e1e] rounded-2xl border border-emerald-500/30 overflow-hidden font-mono text-xs">
            {currentCase.diffLines.map((line) => (
              <div key={line.lineNum} className="p-3 bg-emerald-500/10 text-emerald-400 font-bold border-b border-emerald-500/20 last:border-0 flex items-center gap-3">
                <span className="text-muted-foreground select-none w-4">{line.lineNum}</span>
                <span>{line.expectedLine}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Actual Output */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> Таны Гаралт (Your Output)
          </div>
          <div className="bg-[#1e1e1e] rounded-2xl border border-rose-500/30 overflow-hidden font-mono text-xs">
            {currentCase.diffLines.map((line) => (
              <div
                key={line.lineNum}
                className={`p-3 border-b last:border-0 flex items-center gap-3 font-bold ${
                  line.isMatch
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse"
                }`}
              >
                <span className="text-muted-foreground select-none w-4">{line.lineNum}</span>
                <span>{line.actualLine}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {currentCase.status === "WA" && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            <strong>Шалтгаан:</strong> $10^9 + 10^9 = 2 \times 10^9$ үед 32-bit `int` төрөл хальж сөрөг утга болсон байна. Кодод <code>long long</code> ашиглан засна уу.
          </span>
        </div>
      )}
    </div>
  );
}
