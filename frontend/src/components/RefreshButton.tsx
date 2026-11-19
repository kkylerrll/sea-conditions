"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";

export default function RefreshButton({ tone = "light" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function run() {
    setState("loading");
    try {
      const res = await fetch(`${API_BASE}/api/refresh?wait=true`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={run}
      disabled={state === "loading"}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 ${
        tone === "dark"
          ? "bg-white/12 text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/20"
          : "border border-slate-200 bg-white text-slate-600 hover:border-sea-300 hover:text-sea-700"
      }`}
    >
      <span className={state === "loading" ? "animate-spin" : ""}>⟳</span>
      {state === "loading" ? "更新中…" : state === "error" ? "更新失敗，再試一次" : "重新抓海況"}
    </button>
  );
}
