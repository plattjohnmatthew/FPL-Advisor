import { Overview } from "@/components/overview";
import { getOverviewData } from "@/lib/overview/data";

export const dynamic = "force-dynamic";
export default async function Home() { return <Overview data={await getOverviewData()} />; }
