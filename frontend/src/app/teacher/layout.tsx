"use client";

import React from "react";
import { TeacherSidebar } from "@/components/shared/teacher-sidebar";
import { Footer } from "@/components/shared/footer";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <TeacherSidebar />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <main className="flex-1 flex flex-col w-full">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
