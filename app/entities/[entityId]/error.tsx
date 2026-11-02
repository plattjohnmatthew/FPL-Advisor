"use client";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";
export default function EntityError({ reset }: { reset: () => void }) { return <section className="detail-shell"><h1>Research could not be loaded</h1><p>The stored research or selected date range is unavailable. Try again or choose a different player or team.</p><Button onClick={reset}>Try again</Button> <Link href="/players">Search players and teams</Link></section>; }
