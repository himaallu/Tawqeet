import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "./App";
import { TooltipProvider } from "./components/ui/misc";
import "./index.css";
import { queryClient } from "./lib/api";

// Apply the saved theme before first paint.
try {
  const t = localStorage.getItem("tq.theme");
  if (t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
} catch {
  // storage unavailable
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <App />
      <Toaster position="bottom-right" toastOptions={{ className: "!rounded-xl !border !border-line !bg-surface !text-ink !shadow-pop !text-[13px]" }} />
    </TooltipProvider>
  </QueryClientProvider>,
);
