import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Source = {
  id: string;
  name: string;
  platform: "YOUTUBE" | "PODCAST";
  channelUrl: string;
  externalChannelId: string;
  enabled: boolean;
  createdAt: string;
};

type SourceRow = {
  id: string;
  name: string;
  platform: Source["platform"];
  channel_url: string;
  external_channel_id: string;
  enabled: boolean;
  created_at: string;
};

export async function listSources(): Promise<Source[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, platform, channel_url, external_channel_id, enabled, created_at")
    .order("name");

  if (error) {
    throw new Error(`Unable to load sources: ${error.message}`);
  }

  return (data as SourceRow[]).map((source) => ({
    id: source.id,
    name: source.name,
    platform: source.platform,
    channelUrl: source.channel_url,
    externalChannelId: source.external_channel_id,
    enabled: source.enabled,
    createdAt: source.created_at,
  }));
}

