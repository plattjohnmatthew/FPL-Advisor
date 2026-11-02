"use client";

import { useCapabilities } from "@/components/app-capabilities";
import { useShowcaseAction } from "@/components/showcase-action-gate";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Input, PageHeader, Select, StatusBadge } from "@/components/ui/primitives";
import { DEFAULT_RESEARCH_SCOPE, type ResearchContextMode, type ResearchResponse, type ResearchScopePreset } from "@/lib/research/schema";
import { OVERVIEW_PROMPTS } from "@/lib/research/navigation";
import { answerSections, creatorBreadth, followUpQuestions, resolveCitations, scopeDescription } from "@/lib/research/presentation";
import { buildInsightSourceUrl } from "@/lib/episodes/presentation";

type Turn = { response: ResearchResponse; mode: ResearchContextMode };
const scopes: Array<[ResearchScopePreset, string]> = [["LAST_7_DAYS", "Last 7 days"], ["LAST_14_DAYS", "Last 14 days"], ["LAST_30_DAYS", "Last 30 days"], ["THIS_WEEK", "This week"], ["THIS_SEASON", "This season"], ["ALL_HISTORY", "All history"], ["CUSTOM", "Custom"]];

function Citations({ ids, response }: { ids: string[]; response: ResearchResponse }) {
  const breadth = creatorBreadth(ids, response.sources);
  return <><div className="ask-citations">{resolveCitations(ids, response.sources).map(({ id, source, href }) => <Link prefetch={false} key={id} href={href} title={source.episodeTitle}>{source.sourceName} · {source.publishedAt.slice(0, 10)}</Link>)}</div>{breadth !== null && <p className="ask-note">{breadth} distinct creator{breadth === 1 ? "" : "s"} cited · breadth is not agreement</p>}</>;
}

export function ResearchAnswer({ response, mode }: Turn) {
  return <article className="ask-turn">
    <header><p className="eyebrow">Your question</p><h2>{response.question}</h2><p className="ask-scope">{scopeDescription(response.scope)}</p><StatusBadge>{mode === "MY_TEAM" ? "My Team research" : "Creator research"}</StatusBadge>{response.analysis && <span className="ask-save">{response.analysis.reused ? "Reused saved analysis" : "Analysis saved"}</span>}</header>
    <section><h3>Short answer</h3><p>{response.answer.answerSummary}</p><Citations ids={response.answer.answerSummaryEvidenceIds} response={response} /></section>
    {answerSections(response).map((section) => <section key={section.title}><h3>{section.title}</h3>{section.findings.map((finding, index) => <div className="ask-finding" key={index}><h4>{finding.statement}</h4><p>{finding.explanation}</p><Citations ids={finding.evidenceIds} response={response} /></div>)}</section>)}
    {response.answer.insufficientEvidence && <section className="ask-caveat"><h3>Caveats</h3><p>{response.answer.insufficientEvidence}</p><p>Try a broader date scope or a specific player, team or decision.</p></section>}
    {response.sources.length > 0 && <section><h3>Sources</h3><p className="ask-note">Dated creator opinions. Multiple episodes from one creator do not establish wider agreement.</p><ul className="ask-source-list">{response.sources.map((source) => <li key={source.episodeId}><Link prefetch={false} href={`/episodes/${encodeURIComponent(source.episodeId)}`}>{source.episodeTitle}</Link><span>{source.sourceName} · {source.publishedAt.slice(0, 10)}</span><a href={buildInsightSourceUrl(source.sourceUrl, source.timestampSeconds)} target="_blank" rel="noreferrer">Original source ↗</a></li>)}</ul></section>}
    {mode === "MY_TEAM" && <aside className="ask-note">Squad membership, price, club and position are application metadata, separate from creator opinion. <Link prefetch={false} href="/squad">Inspect your selected squad</Link>.</aside>}
  </article>;
}

export function AskWorkspace({ initialQuestion = "", initialScope = DEFAULT_RESEARCH_SCOPE, initialMode = "GLOBAL", initialFrom = "", initialTo = "" }: { initialQuestion?: string; initialScope?: ResearchScopePreset; initialMode?: ResearchContextMode; initialFrom?: string; initialTo?: string }) {
  const showcase=useShowcaseAction(); const capabilities=useCapabilities();
  const [question, setQuestion] = useState(initialQuestion);
  const [scope, setScope] = useState<ResearchScopePreset>(initialScope);
  const [mode, setMode] = useState<ResearchContextMode>(initialMode);
  const [from, setFrom] = useState(initialFrom); const [to, setTo] = useState(initialTo);
  const [turns, setTurns] = useState<Turn[]>([]); const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false); const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!pending && (turns.length > 0 || error)) composer.current?.focus();
  }, [pending, turns.length, error]);
  const valid = question.trim().length >= 3 && (scope !== "CUSTOM" || Boolean(from && to && from <= to));
  function prefill(value: string) { setQuestion(value); composer.current?.focus(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || !valid) return;
    if (showcase.block("Ask AI")) return;
    busy.current = true; const submitted = question.trim(); const submittedMode = mode;
    setPending(submitted); setError(null);
    try {
      const result = await fetch("/api/research-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: submitted, scope, contextMode: submittedMode, fromDate: from, toDate: to, timezoneOffsetMinutes: new Date().getTimezoneOffset() }) });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Research could not be completed.");
      setTurns((current) => [...current, { response: body as ResearchResponse, mode: submittedMode }]); setQuestion("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Research could not be completed."); }
    finally { busy.current = false; setPending(null); composer.current?.focus(); }
  }
  const latest = turns.at(-1)?.response;
  return <div className="ask-workspace">
    <PageHeader title="Ask anything about FPL" description="Explore creator opinions, compare decisions and inspect the evidence." actions={capabilities.canAskAI ? <Link prefetch={false} href="/analyses">Saved analyses</Link> : undefined} />
    <div className="ask-conversation">{turns.map((turn, index) => <ResearchAnswer key={index} {...turn} />)}</div>
    {pending && <div role="status" className="ask-pending"><strong>{pending}</strong><p>Researching stored evidence…</p></div>}
    {latest && !pending && <nav className="ask-followups" aria-label="Follow-up questions"><p className="eyebrow">Explore further</p>{followUpQuestions(latest.question, Boolean(latest.answer.insufficientEvidence)).map((value) => <Button key={value} variant="secondary" onClick={() => prefill(value)}>{value}</Button>)}</nav>}
    <form onSubmit={submit} className="ask-composer" aria-label="Ask FPL Research">
      <label htmlFor="research-question">{turns.length ? "Ask a follow-up question" : "Your research question"}</label>
      <textarea ref={composer} id="research-question" className="ui-input" placeholder="Compare the main captaincy options using recent creator opinions." value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} rows={4} disabled={Boolean(pending)} aria-describedby="ask-keyboard" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <div className="ask-options"><label>Time scope<Select aria-label="Time scope" value={scope} disabled={Boolean(pending)} onChange={(event) => setScope(event.target.value as ResearchScopePreset)}>{scopes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label>Research context<Select aria-label="Research context" value={mode} disabled={Boolean(pending)} onChange={(event) => setMode(event.target.value as ResearchContextMode)}><option value="GLOBAL">All creator research</option>{capabilities.canViewSquad && <option value="MY_TEAM">My Team</option>}</Select></label>{scope === "CUSTOM" && <><label>From<Input aria-label="From" type="date" required value={from} max={to || undefined} disabled={Boolean(pending)} onChange={(event) => setFrom(event.target.value)} /></label><label>To<Input aria-label="To" type="date" required value={to} min={from || undefined} disabled={Boolean(pending)} onChange={(event) => setTo(event.target.value)} /></label></>}</div>
      {mode === "MY_TEAM" && <p className="ask-note">Uses your currently persisted selected squad. Manage it in <Link prefetch={false} href="/squad">My Squad</Link>.</p>}
      <div className="ask-submit"><span id="ask-keyboard">Enter to ask · Shift+Enter for a new line</span><Button type="submit" loading={Boolean(pending)} disabled={!valid}>Ask FPL Research</Button></div>
      {error && <p role="alert" className="ask-error">{error} Your question is kept above so you can retry.</p>}
    </form>
    {!turns.length && <nav className="ask-suggestions" aria-label="Suggested questions">{OVERVIEW_PROMPTS.map((value) => <Button key={value} variant="secondary" disabled={Boolean(pending)} onClick={() => prefill(value)}>{value}</Button>)}</nav>}
    <p className="ask-note">{capabilities.canAskAI ? "Answers use stored research, not live news. Conversation stays in this page session; completed analyses remain in Saved analyses. Follow-ups are independent questions using the selected scope." : "Explore scopes and suggested prompts. Submit a question to learn how to enable live research locally."}</p>
  </div>;
}
