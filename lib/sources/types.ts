export type SourceLibraryItem = {
  id: string;
  name: string;
  platform: "YOUTUBE" | "PODCAST";
  channelUrl: string;
  externalChannelId: string;
  enabled: boolean;
  selectedByDefault: boolean;
};
