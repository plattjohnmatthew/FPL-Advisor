import { PageHeader, Skeleton } from "@/components/ui/primitives";

export default function AskLoading() {
  return <div className="ask-workspace"><PageHeader title="Ask anything about FPL" /><Skeleton label="Loading research composer" style={{ minHeight: 280 }} /></div>;
}
