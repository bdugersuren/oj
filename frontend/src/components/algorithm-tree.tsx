"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder, FolderOpen, ChevronRight, ChevronDown,
  Code2, Sparkles, BookOpen, CheckCircle2, Lock,
  Search, Layers, Plus, Filter, Tag, Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface AlgorithmNode {
  id: string;
  name: string;
  code?: string;
  level: "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";
  masteryPct: number;
  problemCount: number;
  lessonCount: number;
  children?: AlgorithmNode[];
}

export const ALGORITHM_TAXONOMY_TREE: AlgorithmNode[] = [
  {
    id: "math",
    name: "1. Олимпиадын Математик (Olympiad Math)",
    level: "Bronze",
    masteryPct: 75,
    problemCount: 18,
    lessonCount: 4,
    children: [
      {
        id: "number-theory",
        name: "Тооны Онол (Number Theory)",
        level: "Bronze",
        masteryPct: 80,
        problemCount: 8,
        lessonCount: 2,
        children: [
          { id: "primes", name: "Анхны тоо & O(√N) шалгуур", level: "Bronze", masteryPct: 90, problemCount: 3, lessonCount: 1 },
          { id: "sieve", name: "Эратосфены Шүүлтүүр (Sieve of Eratosthenes)", level: "Silver", masteryPct: 70, problemCount: 3, lessonCount: 1 },
          { id: "gcd-lcm", name: "ХИЕХ / ХБЕХ ба Евклидийн алгоритм", level: "Bronze", masteryPct: 85, problemCount: 2, lessonCount: 1 },
        ],
      },
      {
        id: "combinatorics",
        name: "Комбинаторик ба Тоолол (Combinatorics)",
        level: "Silver",
        masteryPct: 65,
        problemCount: 6,
        lessonCount: 1,
        children: [
          { id: "permutations", name: "Сэлгэмэл, Гүйлгэмэл, Хэсэглэл (nCr, nPr)", level: "Silver", masteryPct: 70, problemCount: 3, lessonCount: 1 },
          { id: "pigeonhole", name: "Дирихлейн Зарчим (Pigeonhole Principle)", level: "Silver", masteryPct: 60, problemCount: 3, lessonCount: 0 },
        ],
      },
      {
        id: "geometry",
        name: "Тооцооллын Геометр (Computational Geometry)",
        level: "Gold",
        masteryPct: 40,
        problemCount: 4,
        lessonCount: 1,
        children: [
          { id: "cross-product", name: "Векторын Вектор Үржвэр (Cross Product)", level: "Gold", masteryPct: 50, problemCount: 2, lessonCount: 1 },
          { id: "convex-hull", name: "Гүдгэр Бүлхүүл (Convex Hull / Graham Scan)", level: "Platinum", masteryPct: 30, problemCount: 2, lessonCount: 0 },
        ],
      },
    ],
  },
  {
    id: "data-structures",
    name: "2. Өгөгдлийн Бүтэц (Data Structures)",
    level: "Silver",
    masteryPct: 60,
    problemCount: 24,
    lessonCount: 5,
    children: [
      {
        id: "linear-ds",
        name: "Шугаман Өгөгдлийн Бүтэц",
        level: "Bronze",
        masteryPct: 85,
        problemCount: 8,
        lessonCount: 2,
        children: [
          { id: "stack-queue", name: "Stack & Queue (Стек ба Дараалал)", level: "Bronze", masteryPct: 90, problemCount: 4, lessonCount: 1 },
          { id: "deque", name: "Deque ба Монотон Стек (Monotonic Stack)", level: "Silver", masteryPct: 80, problemCount: 4, lessonCount: 1 },
        ],
      },
      {
        id: "trees-ds",
        name: "Модон Бүтцүүд (Tree Data Structures)",
        level: "Gold",
        masteryPct: 45,
        problemCount: 16,
        lessonCount: 3,
        children: [
          { id: "dsu", name: "Үл Огтлолцох Олонлогуудын Нэгдэл (DSU / Union-Find)", level: "Silver", masteryPct: 75, problemCount: 6, lessonCount: 1 },
          { id: "segment-tree", name: "Завсрын Мод (Segment Tree)", level: "Gold", masteryPct: 40, problemCount: 6, lessonCount: 1 },
          { id: "fenwick", name: "Фенвикийн Мод (Binary Indexed Tree / BIT)", level: "Gold", masteryPct: 50, problemCount: 4, lessonCount: 1 },
        ],
      },
    ],
  },
  {
    id: "graphs",
    name: "3. Графын Алгоритмууд (Graph Algorithms)",
    level: "Silver",
    masteryPct: 55,
    problemCount: 30,
    lessonCount: 6,
    children: [
      {
        id: "graph-traversal",
        name: "Граф Тойролт (Traversal)",
        level: "Silver",
        masteryPct: 80,
        problemCount: 10,
        lessonCount: 2,
        children: [
          { id: "bfs", name: "Өргөөшөө Хайлт (Breadth-First Search - BFS)", level: "Silver", masteryPct: 85, problemCount: 5, lessonCount: 1 },
          { id: "dfs", name: "Гүн рүү Хайлт (Depth-First Search - DFS)", level: "Silver", masteryPct: 75, problemCount: 5, lessonCount: 1 },
        ],
      },
      {
        id: "shortest-paths",
        name: "Хамгийн Богино Зам (Shortest Paths)",
        level: "Gold",
        masteryPct: 50,
        problemCount: 12,
        lessonCount: 2,
        children: [
          { id: "dijkstra", name: "Dijkstra Алгоритм (O((V+E) log V))", level: "Gold", masteryPct: 65, problemCount: 6, lessonCount: 1 },
          { id: "bellman-ford", name: "Bellman-Ford & Сөрөг Цикл", level: "Gold", masteryPct: 45, problemCount: 3, lessonCount: 1 },
          { id: "floyd-warshall", name: "Floyd-Warshall (O(V³))", level: "Silver", masteryPct: 70, problemCount: 3, lessonCount: 0 },
        ],
      },
    ],
  },
  {
    id: "dp",
    name: "4. Динамик Програмчлал (Dynamic Programming)",
    level: "Gold",
    masteryPct: 35,
    problemCount: 35,
    lessonCount: 7,
    children: [
      {
        id: "dp-intro",
        name: "Суурь DP & Санамжжуулалт (Memoization)",
        level: "Silver",
        masteryPct: 60,
        problemCount: 10,
        lessonCount: 2,
        children: [
          { id: "fib-grid", name: "Хүснэгтийн Зам ба Фибоначчи", level: "Bronze", masteryPct: 85, problemCount: 5, lessonCount: 1 },
          { id: "lis", name: "Хамгийн Урт Өсөх Дэд Дараалал (LIS - O(N log N))", level: "Gold", masteryPct: 50, problemCount: 5, lessonCount: 1 },
        ],
      },
      {
        id: "knapsack",
        name: "Үүргэвчний Бодлогууд (Knapsack Family)",
        level: "Gold",
        masteryPct: 40,
        problemCount: 12,
        lessonCount: 2,
        children: [
          { id: "01-knapsack", name: "0/1 Knapsack", level: "Gold", masteryPct: 60, problemCount: 5, lessonCount: 1 },
          { id: "unbounded-knapsack", name: "Хязгааргүй Үүргэвч (Unbounded Knapsack)", level: "Gold", masteryPct: 40, problemCount: 4, lessonCount: 1 },
          { id: "subset-sum", name: "Дэд Олонлогийн Нийлбэр (Subset Sum)", level: "Gold", masteryPct: 50, problemCount: 3, lessonCount: 0 },
        ],
      },
    ],
  },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  Bronze: "text-amber-600 border-amber-600/30 bg-amber-600/10",
  Silver: "text-slate-400 border-slate-400/30 bg-slate-400/10",
  Gold: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  Platinum: "text-sky-500 border-sky-500/30 bg-sky-500/10",
  Diamond: "text-purple-500 border-purple-500/30 bg-purple-500/10",
};

interface TreeNodeProps {
  node: AlgorithmNode;
  depth?: number;
  onSelectNode?: (node: AlgorithmNode) => void;
  selectedId?: string;
}

export function AlgorithmTreeNode({
  node,
  depth = 0,
  onSelectNode,
  selectedId,
}: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(depth === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="select-none">
      <motion.div
        whileHover={{ x: 2 }}
        onClick={() => {
          if (hasChildren) setIsOpen(!isOpen);
          if (onSelectNode) onSelectNode(node);
        }}
        className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all border my-1 ${
          isSelected
            ? "glass-strong border-brand-cyan/60 bg-brand-cyan/10 shadow-sm"
            : "hover:bg-secondary/60 border-transparent"
        }`}
        style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <div className="w-4 h-4 flex items-center justify-center">
              <Zap className="w-3 h-3 text-brand-cyan" />
            </div>
          )}

          <div className="text-xs font-bold text-foreground truncate flex items-center gap-2">
            {hasChildren ? (
              isOpen ? <FolderOpen className="w-4 h-4 text-brand-amber" /> : <Folder className="w-4 h-4 text-brand-amber" />
            ) : null}
            <span>{node.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={`text-[10px] ${DIFFICULTY_COLORS[node.level]}`}>
            {node.level}
          </Badge>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
            <Code2 className="w-3 h-3 text-brand-cyan" />
            <span>{node.problemCount}</span>
          </div>

          <div className="w-16 hidden md:block">
            <Progress value={node.masteryPct} className="h-1.5 bg-secondary" />
          </div>
          <span className="text-[10px] font-mono font-bold text-muted-foreground w-8 text-right">
            {node.masteryPct}%
          </span>
        </div>
      </motion.div>

      {/* Children Nodes (Windows Explorer nested branch) */}
      <AnimatePresence>
        {hasChildren && isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-l border-border/60 ml-5 pl-1"
          >
            {node.children!.map((child) => (
              <AlgorithmTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                onSelectNode={onSelectNode}
                selectedId={selectedId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AlgorithmHierarchyExplorer() {
  const [search, setSearch] = useState<string>("");
  const [selectedNode, setSelectedNode] = useState<AlgorithmNode>(ALGORITHM_TAXONOMY_TREE[0]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Hierarchical Explorer Tree */}
      <div className="lg:col-span-2 glass-strong rounded-3xl p-6 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-cyan" />
              Алгоритмын Шаталсан Бүтэц (Hierarchical Tree)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Windows Explorer шиг задардаг шаталсан ангилал ба эзэмшилтийн хувь
            </p>
          </div>

          <Badge className="bg-primary/15 text-primary border-none text-xs">
            Нийт 4 Үндсэн Бүлэг
          </Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Алгоритм, өгөгдлийн бүтэц хайх..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-secondary text-xs rounded-xl border border-border outline-none focus:border-brand-cyan/60"
          />
        </div>

        {/* Tree Container */}
        <div className="max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
          {ALGORITHM_TAXONOMY_TREE.map((rootNode) => (
            <AlgorithmTreeNode
              key={rootNode.id}
              node={rootNode}
              onSelectNode={setSelectedNode}
              selectedId={selectedNode?.id}
            />
          ))}
        </div>
      </div>

      {/* Right: Selected Node Details & Action Card */}
      <div className="space-y-4">
        <div className="glass-strong rounded-3xl p-6 border border-border space-y-6 sticky top-24">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-brand-cyan uppercase tracking-wider">Сонгогдсон Алгоритм</span>
              <Badge variant="outline" className={DIFFICULTY_COLORS[selectedNode.level]}>
                {selectedNode.level}
              </Badge>
            </div>
            <h4 className="font-black text-lg text-foreground">{selectedNode.name}</h4>
          </div>

          <div className="glass rounded-2xl p-4 border border-border space-y-3 bg-secondary/40">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Эзэмшилтийн Хувь (Mastery)</span>
              <span className="text-brand-cyan font-mono">{selectedNode.masteryPct}%</span>
            </div>
            <Progress value={selectedNode.masteryPct} className="h-2 bg-secondary" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="glass rounded-2xl p-3 border border-border">
              <div className="text-xl font-black text-primary">{selectedNode.problemCount}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Нийт Бодлого</div>
            </div>
            <div className="glass rounded-2xl p-3 border border-border">
              <div className="text-xl font-black text-amber-500">{selectedNode.lessonCount}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Онолын Хичээл</div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Link href="/problems" className="block">
              <button className="w-full py-2.5 rounded-xl gradient-brand text-white font-bold text-xs shadow-md shadow-brand-cyan/20 cursor-pointer">
                Бодлогуудыг Шүүж Харах →
              </button>
            </Link>
            <Link href="/lessons" className="block">
              <button className="w-full py-2.5 rounded-xl glass border border-border text-foreground font-bold text-xs hover:bg-secondary cursor-pointer">
                Онолын Хичээл Үзэх 📖
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
