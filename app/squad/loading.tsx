export default function SquadLoading() {
  return <main id="main-content" className="dashboard-shell detail-shell squad-shell" aria-busy="true">
    <header className="dashboard-hero"><div><p className="eyebrow">Personal squad</p><h1>Loading your FPL team…</h1><p>Reading your saved squad and official fixture calendar.</p></div></header>
    <Card className="squad-loading-card"><Skeleton label="Loading squad" /><Skeleton label="Loading players" /><Skeleton label="Loading fixtures" /></Card>
  </main>;
}
import { Card, Skeleton } from "@/components/ui/primitives";
