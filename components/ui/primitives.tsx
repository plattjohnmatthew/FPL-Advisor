import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function cx(...values: (string | false | undefined)[]) { return values.filter(Boolean).join(" "); }
type Busy = { loading?: boolean };
export function Button({ loading, disabled, variant = "primary", className, children, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & Busy & { variant?: "primary" | "secondary" | "danger" }) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cx("ui-button", `ui-button-${variant}`, className)}>{loading && <span className="ui-spinner" aria-hidden="true" />}{children}</button>;
}
export function IconButton({ label, className, ...props }: Parameters<typeof Button>[0] & { label: string }) {
  return <Button {...props} aria-label={label} title={label} className={cx("ui-icon-button", className)} />;
}
export function Input({ loading, disabled, className, ...props }: InputHTMLAttributes<HTMLInputElement> & Busy) {
  return <input {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={cx(props.type === "checkbox" ? "ui-checkbox" : "ui-input", className)} />;
}
export function SearchInput({ label, ...props }: Omit<Parameters<typeof Input>[0], "type"> & { label: string }) {
  return <Input {...props} type="search" aria-label={label} />;
}
export function Select({ loading, disabled, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Busy) {
  return <select {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={cx("ui-input", className)} />;
}
export function PageHeader({ title, description, actions, eyebrow, className }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string; className?: string }) {
  return <header className={cx("ui-page-header", className)}><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions}</header>;
}
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) { return <section {...props} className={cx("ui-card", className)} />; }
export function StatusBadge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" }) { return <span {...props} className={cx("ui-badge", `ui-badge-${tone}`, className)} />; }
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) { return <div className="empty-state"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>; }
export function Skeleton({ label = "Loading", className, ...props }: HTMLAttributes<HTMLDivElement> & { label?: string }) { return <div {...props} role="status" aria-label={label} className={cx("ui-skeleton", className)}><span className="sr-only">{label}</span></div>; }
