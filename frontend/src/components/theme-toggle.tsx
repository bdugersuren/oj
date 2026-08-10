"use client";

import * as React from "react";
import { Moon, Sun, Laptop } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const subscribeToMount = () => () => undefined;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(subscribeToMount, () => true, () => false);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="outline"
          size="icon"
          className="w-9 h-9 rounded-xl border-border bg-card/60 backdrop-blur-sm relative cursor-pointer"
          title="Сэдэв солих (Theme)"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-sky-400" />
          <span className="sr-only">Сэдэв сонгох</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong border-border text-xs rounded-xl min-w-[130px]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={`flex items-center gap-2 cursor-pointer rounded-lg py-2 ${theme === "light" ? "text-primary font-bold bg-primary/10" : ""}`}
        >
          <Sun className="h-3.5 w-3.5 text-amber-500" />
          Гэгээлэг (Light)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={`flex items-center gap-2 cursor-pointer rounded-lg py-2 ${theme === "dark" ? "text-primary font-bold bg-primary/10" : ""}`}
        >
          <Moon className="h-3.5 w-3.5 text-sky-400" />
          Харанхуй (Dark)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={`flex items-center gap-2 cursor-pointer rounded-lg py-2 ${theme === "system" ? "text-primary font-bold bg-primary/10" : ""}`}
        >
          <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
          Систем (System)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
