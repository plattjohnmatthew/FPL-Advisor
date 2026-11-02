"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, cx, IconButton } from "./primitives";

export function Dialog({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  return <dialog ref={ref} className={cx("ui-dialog", className)} aria-labelledby={titleId} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0);
    const first = controls[0]; const last = controls.at(-1);
    if (!first) { event.preventDefault(); event.currentTarget.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}><div className="ui-dialog-heading"><h2 id={titleId}>{title}</h2><IconButton variant="secondary" label="Close dialog" onClick={onClose}>×</IconButton></div>{children}</dialog>;
}

export function Tabs({ label, items, value, onChange, disabled = false, loading = false, children }: { label: string; items: { value: string; label: string; disabled?: boolean }[]; value: string; onChange: (value: string) => void; disabled?: boolean; loading?: boolean; children?: ReactNode }) {
  const id = useId();
  return <><div className="ui-tabs" role="tablist" aria-label={label} aria-busy={loading || undefined}>{items.map((item) => <button key={item.value} type="button" role="tab" id={`${id}-${item.value}`} aria-controls={children ? `${id}-panel` : undefined} aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} disabled={disabled || loading || item.disabled} onClick={() => onChange(item.value)} onKeyDown={(event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const available = items.filter((entry) => !entry.disabled);
    const index = available.findIndex((entry) => entry.value === item.value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
    const target = available[next];
    if (target) { onChange(target.value); document.getElementById(`${id}-${target.value}`)?.focus(); }
  }}>{item.label}</button>)}</div>{children && <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} tabIndex={0}>{children}</div>}</>;
}

export function Toast({ message, tone = "info", onDismiss }: { message: string; tone?: "info" | "danger"; onDismiss: () => void }) {
  return <div className={cx("ui-toast", tone === "danger" && "ui-toast-danger")}><span role={tone === "danger" ? "alert" : "status"}>{message}</span><IconButton variant="secondary" label="Dismiss notification" onClick={onDismiss}>×</IconButton></div>;
}

export function Pagination({ page, pageCount, onChange, disabled, loading }: { page: number; pageCount: number; onChange: (page: number) => void; disabled?: boolean; loading?: boolean }) {
  return <nav className="ui-pagination" aria-label="Pagination" aria-busy={loading || undefined}><Button variant="secondary" disabled={disabled || loading || page <= 1} onClick={() => onChange(page - 1)}>Previous</Button><span aria-live="polite">{pageCount === 0 ? "No pages" : `Page ${page} of ${pageCount}`}</span><Button variant="secondary" disabled={disabled || loading || page >= pageCount} onClick={() => onChange(page + 1)}>Next</Button></nav>;
}
