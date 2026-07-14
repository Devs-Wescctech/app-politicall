const META_WINDOW_MS = 24 * 60 * 60 * 1000;

type ChannelRecord = {
  provider?: unknown;
  channel?: unknown;
  metadata?: unknown;
};

type ConversationRecord = ChannelRecord & {
  lastCustomerActivityAt?: string | Date | null;
};

type OfficialChannelInput = {
  connection?: ChannelRecord | null;
  conversation?: ConversationRecord | null;
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

export function isWhuCloudChannelInfo(value: unknown): boolean {
  const channel = record(value);
  return Boolean(
    channel.wabaId ??
    channel.businessAccountId ??
    channel.whatsappBusinessAccountId ??
    channel.numberId ??
    channel.phoneNumberId ??
    channel.whatsappPhoneNumberId ??
    channel.metaAccessToken,
  );
}

function explicitOfficial(value: ChannelRecord | null | undefined): boolean {
  const provider = String(value?.provider ?? "").toLowerCase();
  const channel = String(value?.channel ?? "").toLowerCase();
  const metadata = record(value?.metadata);
  const providerOrChannelIsOfficial = provider.includes("official") || provider.includes("meta_cloud") ||
    channel.includes("official") || channel.includes("oficial") || channel.includes("cloud");
  if (providerOrChannelIsOfficial) return true;

  // WHU documents these identifiers as WACLOUD-only. They must override stale
  // apiType/channelType metadata written by older detection logic.
  if (isWhuCloudChannelInfo(metadata)) return true;

  const apiType = String(metadata.apiType ?? "").toLowerCase();
  const channelType = Number(metadata.channelType);
  if (apiType === "whu" || channelType === 0 || channelType === 1 || channelType === 4) return false;

  return metadata.apiType === "official" || metadata.official === true || metadata.whatsappOfficial === true || channelType === 3;
}

export function isDirectMetaConnection(connection: ChannelRecord | null | undefined): boolean {
  const provider = String(connection?.provider ?? "").toLowerCase();
  const metadata = record(connection?.metadata);
  return provider === "meta_cloud" || metadata.directMeta === true || metadata.providerMode === "graph";
}

export function isOfficialAttendanceChannel(input: OfficialChannelInput): boolean {
  if (explicitOfficial(input.connection) || explicitOfficial(input.conversation)) return true;

  const conversationMetadata = record(input.conversation?.metadata);
  const connectionSnapshot = record(conversationMetadata.connection);
  if (explicitOfficial({
    provider: connectionSnapshot.provider,
    channel: connectionSnapshot.channel,
    metadata: connectionSnapshot,
  })) return true;

  const remoteRoot = record(conversationMetadata.remote);
  const remote = Object.keys(record(remoteRoot.data)).length
    ? record(remoteRoot.data)
    : Object.keys(record(remoteRoot.chat)).length
      ? record(remoteRoot.chat)
      : Object.keys(record(remoteRoot.result)).length
        ? record(remoteRoot.result)
        : remoteRoot;
  const remoteChannel = record(remote.channel);
  const remoteType = Number(remoteChannel.type ?? remote.channelType ?? remote.typeChannel);
  const remoteText = `${String(remote.channel ?? "")} ${String(remote.provider ?? "")} ${String(remote.platform ?? "")} ${String(remoteChannel.description ?? "")}`.toLowerCase();

  return remoteType === 3 || isWhuCloudChannelInfo(remote) || isWhuCloudChannelInfo(remoteChannel) ||
    remote.official === true || remote.whatsappOfficial === true ||
    remote.apiOfficial === true || remote.apiType === "official" || remoteChannel.official === true ||
    remoteChannel.apiType === "official" || remoteText.includes("wacloud") || remoteText.includes("cloud");
}

export function getMetaWindowState(input: OfficialChannelInput, now: Date = new Date()) {
  const official = isOfficialAttendanceChannel(input);
  const rawActivity = input.conversation?.lastCustomerActivityAt ?? null;
  const activity = rawActivity ? new Date(rawActivity) : null;
  const validActivity = activity && !Number.isNaN(activity.getTime()) ? activity : null;

  if (!official) {
    return { official: false, expired: false, lastCustomerActivityAt: validActivity?.toISOString() ?? null, expiresAt: null };
  }

  if (!validActivity) {
    return { official: true, expired: true, lastCustomerActivityAt: null, expiresAt: null };
  }

  const expiresAt = new Date(validActivity.getTime() + META_WINDOW_MS);
  return {
    official: true,
    expired: now.getTime() >= expiresAt.getTime(),
    lastCustomerActivityAt: validActivity.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
