import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";
import { SpendCounter } from "@/components/spend-counter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drop Studio",
  description: "Turn your EDM tracks into YouTube-ready music videos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center justify-end gap-3 border-b px-5">
              <SpendCounter />
            </header>
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}
