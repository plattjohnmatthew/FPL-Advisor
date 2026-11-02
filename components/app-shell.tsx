"use client";

import { useCapabilities } from "./app-capabilities";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "./ui/interactive";
import { IconButton, StatusBadge } from "./ui/primitives";
import type { ResearchHealth } from "@/lib/processing/research-health";
import { formatDisplayDate } from "@/lib/dates/display";

const destinations = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/intelligence", label: "Intelligence", icon: "intelligence" },
  { href: "/ask", label: "Ask AI", icon: "ask" },
  { href: "/players", label: "Players & Teams", icon: "players" },
  { href: "/squad", label: "My Squad", icon: "squad" },
  { href: "/sources", label: "Sources", icon: "sources" },
] as const;
const preferenceKey = "fpl-sidebar-collapsed";
function subscribe(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener("sidebar-preference", callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener("sidebar-preference", callback); }; }
function getPreference() { try { return localStorage.getItem(preferenceKey); } catch { return null; } }
function subscribeTablet(callback: () => void) { const media = window.matchMedia("(min-width: 768px) and (max-width: 1279px)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
function getTablet() { return window.matchMedia("(min-width: 768px) and (max-width: 1279px)").matches; }
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z", intelligence: "M4 20V10 M10 20V4 M16 20v-8 M22 20H2", ask: "M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z M8 10h8 M8 14h5", players: "M15 21v-3a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v3 M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M17 4a3 3 0 0 1 0 6 M21 21v-3a4 4 0 0 0-3-4", squad: "m8 3 4 2 4-2 6 5-4 4-2-2v11H8V10l-2 2-4-4Z", sources: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5", settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2", collapse: "M4 4h16v16H4z M9 4v16 m7-12-3 4 3 4", menu: "M4 6h16 M4 12h16 M4 18h16" };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.overview} /></svg>;
}
function activeDestination(path: string) { if (path.startsWith("/entities") || path.startsWith("/fixtures")) return "/players"; if (path.startsWith("/analyses")) return "/ask"; if (path.startsWith("/episodes")) return "/intelligence"; return destinations.find((item) => item.href !== "/" && path.startsWith(item.href))?.href ?? (path.startsWith("/settings") ? "/settings" : "/"); }

export function Sidebar({ active, onNavigate, health, links }: { active: string; onNavigate?: () => void; health: ResearchHealth | "checking" | "unavailable"; links: {github:string;setup:string} }) {
  const capabilities = useCapabilities();
  const needsAttention = typeof health === "object" && health.attentionCount > 0;
  const healthLabel = health === "checking" ? "Checking research" : health === "unavailable" ? "Health unavailable" : needsAttention ? `${health.attentionCount} item${health.attentionCount === 1 ? "" : "s"} need attention` : health.updatedAt ? `Research updated ${formatDisplayDate(health.updatedAt, { hour: "2-digit", minute: "2-digit" })}` : "No research processed yet";
  return <><Link prefetch={false} href="/" className="shell-brand" onClick={onNavigate} aria-label="FPL Research home"><span className="shell-monogram">FR</span><span className="sidebar-label">FPL Research</span></Link><nav aria-label="Primary navigation" className="sidebar-nav">{destinations.filter((item) => item.href !== "/squad" || capabilities.canViewSquad).map((item) => <Link prefetch={false} key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined} title={item.label} onClick={onNavigate}><Icon name={item.icon} /><span className="sidebar-label">{item.label}</span></Link>)}</nav>{capabilities.canWriteData && <div className="sidebar-footer"><Link prefetch={false} className="sidebar-health" href="/sources" onClick={onNavigate} title={healthLabel} aria-label={healthLabel}><StatusBadge tone={needsAttention ? "warning" : typeof health === "object" && health.updatedAt ? "success" : "neutral"}><span aria-hidden="true">●</span><span className="sidebar-label">{healthLabel}</span></StatusBadge></Link><Link prefetch={false} href="/settings" aria-current={active === "/settings" ? "page" : undefined} title="Settings" onClick={onNavigate}><Icon name="settings" /><span className="sidebar-label">Settings</span></Link></div>}{capabilities.mode === "public_read_only" && <div className="sidebar-footer"><Link href="/settings" title="How it works" onClick={onNavigate}><Icon name="settings" /><span className="sidebar-label">How it works</span></Link><a href={links.github} onClick={onNavigate} target="_blank" rel="noreferrer" title="View source on GitHub"><span aria-hidden="true">↗</span><span className="sidebar-label">View source on GitHub</span></a></div>}</>;
}

export function TopBar({ title, collapsed, onToggle, onOpen }: { title: string; collapsed: boolean; onToggle: () => void; onOpen: () => void }) {
  return <header className="shell-topbar"><IconButton variant="secondary" className="desktop-nav-toggle" label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggle} aria-expanded={!collapsed} aria-controls="desktop-sidebar"><Icon name="collapse" /></IconButton><IconButton variant="secondary" className="mobile-nav-toggle" label="Open navigation" onClick={onOpen} aria-haspopup="dialog"><Icon name="menu" /></IconButton><span>{title}</span></header>;
}

export function AppShell({ children, links }: { children: ReactNode; links:{github:string;setup:string} }) {
  const capabilities = useCapabilities();
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribe, getPreference, () => null);
  const tablet = useSyncExternalStore(subscribeTablet, getTablet, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [health, setHealth] = useState<ResearchHealth | "checking" | "unavailable">("checking");
  const active = activeDestination(pathname);
  const collapsed = preference === "true" || (preference === null && tablet);
  const title = active === "/settings" ? (capabilities.canEditSettings ? "Settings" : "How it works") : destinations.find((item) => item.href === active)?.label ?? "FPL Research";
  useEffect(() => {
    if (!capabilities.canWriteData) return;
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const response = await fetch("/api/research-health", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Health unavailable");
        setHealth(await response.json() as ResearchHealth);
      } catch { if (!controller.signal.aborted) setHealth("unavailable"); }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("research-health-changed", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("research-health-changed", refresh); };
  }, [capabilities.canWriteData]);
  useEffect(() => { const media = window.matchMedia("(min-width: 768px)"); const close = () => { if (media.matches) setDrawerOpen(false); }; media.addEventListener("change", close); return () => media.removeEventListener("change", close); }, []);
  function toggle() { try { const current = preference === null ? window.matchMedia("(max-width: 1279px)").matches : collapsed; localStorage.setItem(preferenceKey, String(!current)); window.dispatchEvent(new Event("sidebar-preference")); } catch { /* Navigation remains usable when storage is unavailable. */ } }
  return <div className="app-shell" data-collapsed={preference ?? "auto"}><aside id="desktop-sidebar" className="shell-sidebar"><Sidebar links={links} active={active} health={health} /></aside><div className="shell-workspace"><TopBar title={title} collapsed={collapsed} onToggle={toggle} onOpen={() => setDrawerOpen(true)} /><div id="app-content" tabIndex={-1} className="shell-content">{children}{capabilities.mode === "public_read_only" && <footer className="showcase-note"><p>FPL Research is shown here in read-only showcase mode. The full local application supports content processing, live AI research and configurable data integrations using your own API keys.</p><a href={links.setup} target="_blank" rel="noreferrer">Run locally ↗</a></footer>}</div></div><Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navigation" className="navigation-drawer"><Sidebar links={links} active={active} health={health} onNavigate={() => setDrawerOpen(false)} /></Dialog></div>;
}
