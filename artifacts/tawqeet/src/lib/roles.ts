import type { User } from "@workspace/api-client-react";
export const roleLabel: Record<User["role"], string> = { owner: "Owner", member: "Member", client_viewer: "Client viewer" };
export const can = (u: User | null | undefined) => ({
  viewClients: !!u && u.role !== "client_viewer",
  editClients: !!u && u.role !== "client_viewer",
  deleteClients: u?.role === "owner",
  editAgency: u?.role === "owner",
  viewSignals: !!u && u.role !== "client_viewer",
  editSignals: u?.role === "owner",
  systemChecks: u?.role === "owner",
});
