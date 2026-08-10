import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveProgressWidget } from "@/components/live-progress-modal";
import { CommandPalette } from "@/components/command-palette";

export const metadata: Metadata = {
  title: {
    default: "OJ Platform — Мэдээлэлзүйн Олимпиадын Сургалт",
    template: "%s | OJ Platform",
  },
  description:
    "Мэдээлэлзүйн олимпиадын бэлтгэл: алгоритм, шаталсан сургалт, геймификаци — бүгд нэг дор.",
  keywords: ["olympiad", "programming", "algorithm", "competitive", "Mongolia"],
  authors: [{ name: "OJ Team" }],
  openGraph: {
    type: "website",
    locale: "mn_MN",
    siteName: "OJ Platform",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
        <Providers>
          <TooltipProvider>
            {children}
            <LiveProgressWidget />
            <CommandPalette />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
