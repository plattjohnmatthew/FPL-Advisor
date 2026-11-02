import { getAppCapabilities } from "@/lib/app-config";
import { readSnapshot } from "@/lib/public-snapshot/storage";
import { PublicSources } from "@/components/public-sources";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { ResearchPage, type ResearchPageProps } from "@/components/research-page";
export const metadata = { title: "Sources | FPL Research", description: "Discover the creators and content behind FPL Research." };
export const dynamic = "force-dynamic";
export default async function SourcesPage(props: ResearchPageProps) {
  if (getAppCapabilities().mode === "public_read_only") {
    const snapshot=await readSnapshot().catch(()=>null);
    if(!snapshot) return <main className="detail-shell"><PageHeader title="Sources" /><EmptyState title="Published sources unavailable">The latest public snapshot could not be loaded.</EmptyState></main>;
    const {tables}=snapshot;
      const creators=new Map(tables.sources.map(source=>[source.id,String(source.name)]));
      return <PublicSources sources={tables.sources.map(source=>({id:String(source.id),name:String(source.name),platform:String(source.platform),episodeCount:tables.episodes.filter(episode=>episode.source_id===source.id).length}))} episodes={[...tables.episodes].sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at))).slice(0,10).map(episode=>({id:String(episode.id),title:String(episode.title),creator:creators.get(episode.source_id) ?? "Creator",publishedAt:String(episode.published_at)}))} />;
  }
  return <ResearchPage {...props} view="sources" />;
}
