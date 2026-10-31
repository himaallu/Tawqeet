import * as React from "react";
import { useApi, type Client, type Me } from "./api";

type Ctx = {
  me: Me;
  clients: Client[];
  clientId: string | null; // null = all clients
  client: Client | null;
  setClientId: (id: string | null) => void;
  isStaff: boolean;
  isOwner: boolean;
};

const SessionContext = React.createContext<Ctx | null>(null);
const KEY = "tq.client";

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  const clientsQ = useApi<Client[]>(["clients"], "/clients");
  const clients = clientsQ.data ?? [];
  const viewer = me.user.role === "client_viewer";
  const [chosen, setChosen] = React.useState<string | null>(() => (viewer ? me.user.clientId : readStored()));
  // A stored choice that no longer exists (deleted client) falls back to "All clients".
  const stale = clientsQ.isSuccess && chosen !== null && !clients.some((c) => c.id === chosen);
  const clientId = viewer ? me.user.clientId : stale ? null : chosen;
  const setClientId = (id: string | null) => {
    setChosen(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // storage unavailable: selection just won't persist
    }
  };
  const value: Ctx = {
    me,
    clients,
    clientId,
    client: clients.find((c) => c.id === clientId) ?? null,
    setClientId,
    isStaff: !viewer,
    isOwner: me.user.role === "owner",
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** Query-string suffix for the selected client. */
export function useClientQuery(prefix = "?") {
  const { clientId } = useSession();
  return clientId ? `${prefix}clientId=${clientId}` : "";
}

export function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark" | "system">(() => {
    try {
      return (localStorage.getItem("tq.theme") as "light" | "dark" | null) ?? "system";
    } catch {
      return "system";
    }
  });
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    try {
      if (theme === "system") localStorage.removeItem("tq.theme");
      else localStorage.setItem("tq.theme", theme);
    } catch {
      // ignore
    }
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return { theme, setTheme };
}
