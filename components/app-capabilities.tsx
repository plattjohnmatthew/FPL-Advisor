"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AppCapabilities } from "@/lib/app-config";
const Context = createContext<AppCapabilities | null>(null);
export function CapabilityProvider({ capabilities, children }: { capabilities: AppCapabilities; children: ReactNode }) {
  return <Context.Provider value={capabilities}>{children}</Context.Provider>;
}
export function useCapabilities() {
  const value = useContext(Context);
  if (!value) throw new Error("CapabilityProvider is required");
  return value;
}
