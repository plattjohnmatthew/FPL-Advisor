import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SourceLibraryItem } from "./types";
import type { ResolvedYouTubeChannel } from "./youtube-channel-resolver";

function mapSource(row: Record<string, unknown>): SourceLibraryItem {
  return { id: row.id as string, name: row.name as string, platform: row.platform as SourceLibraryItem["platform"], channelUrl: row.channel_url as string, externalChannelId: row.external_channel_id as string, enabled: Boolean(row.enabled), selectedByDefault: Boolean(row.selected_by_default) };
}

export class SupabaseSourceLibraryRepository {
  async list(): Promise<SourceLibraryItem[]> {
    const { data, error } = await createSupabaseServerClient().from("sources")
      .select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default").order("name");
    if (error) throw new Error(`Unable to load creator library: ${error.message}`);
    return data.map((row) => mapSource(row));
  }

  async setSelection(sourceIds: string[]) {
    const supabase = createSupabaseServerClient();
    const unique = [...new Set(sourceIds)];
    const { error } = await supabase.rpc("set_default_source_selection", { target_source_ids: unique });
    if (error) throw new Error(`Unable to save creator selection: ${error.message}`);
  }

  async upsertYouTube(channel: ResolvedYouTubeChannel) {
    const supabase = createSupabaseServerClient();
    const { data: existing, error: findError } = await supabase.from("sources")
      .select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default")
      .eq("platform", "YOUTUBE").eq("external_channel_id", channel.externalChannelId).maybeSingle();
    if (findError) throw new Error(`Unable to check creator identity: ${findError.message}`);
    if (existing) {
      const { data, error } = await supabase.from("sources").update({ selected_by_default: true, enabled: true, name: channel.name, channel_url: channel.channelUrl })
        .eq("id", existing.id).select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default").single();
      if (error) throw new Error(`Unable to select existing creator: ${error.message}`);
      return { source: mapSource(data), existed: true };
    }
    const { data, error } = await supabase.from("sources").insert({ name: channel.name, platform: "YOUTUBE", channel_url: channel.channelUrl, external_channel_id: channel.externalChannelId, enabled: true, selected_by_default: true })
      .select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default").single();
    if (error) throw new Error(`Unable to add creator: ${error.message}`);
    return { source: mapSource(data), existed: false };
  }

  async upsertYouTubeFromVideo(channel: ResolvedYouTubeChannel) {
    const supabase = createSupabaseServerClient();
    const { data: existing, error: findError } = await supabase.from("sources")
      .select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default")
      .eq("platform", "YOUTUBE").eq("external_channel_id", channel.externalChannelId).maybeSingle();
    if (findError) throw new Error(`Unable to check creator identity: ${findError.message}`);
    if (existing) {
      const { data, error } = await supabase.from("sources").update({ name: channel.name, channel_url: channel.channelUrl })
        .eq("id", existing.id).select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default").single();
      if (error) throw new Error(`Unable to refresh creator metadata: ${error.message}`);
      return { source: mapSource(data), existed: true };
    }
    const { data, error } = await supabase.from("sources").insert({
      name: channel.name, platform: "YOUTUBE", channel_url: channel.channelUrl,
      external_channel_id: channel.externalChannelId, enabled: true, selected_by_default: false,
    }).select("id, name, platform, channel_url, external_channel_id, enabled, selected_by_default").single();
    if (error) throw new Error(`Unable to add video creator: ${error.message}`);
    return { source: mapSource(data), existed: false };
  }
}
