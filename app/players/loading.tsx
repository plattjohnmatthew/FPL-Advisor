import { PageHeader, Skeleton } from "@/components/ui/primitives";
export default function PlayersLoading() { return <div className="detail-shell"><PageHeader title="Players & teams" /><Skeleton label="Loading player search" style={{ minHeight: 160 }} /></div>; }
