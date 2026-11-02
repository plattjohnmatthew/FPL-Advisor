import Link from "next/link";
export function IntelligenceNavigation({ active }: { active: "research" | "briefings" }) {
  return <nav className="intelligence-navigation" aria-label="Intelligence sections">
    <Link prefetch={false} href="/intelligence" aria-current={active === "research" ? "page" : undefined}>Research</Link>
    <Link prefetch={false} href="/intelligence/briefings" aria-current={active === "briefings" ? "page" : undefined}>Briefings</Link>
  </nav>;
}
