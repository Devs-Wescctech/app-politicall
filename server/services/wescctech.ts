/**
 * Wescctech WhatsApp API client
 * Base URL: https://api.wescctech.com.br
 * Auth header: access-token: <token>
 */

const WESCCTECH_BASE = "https://api.wescctech.com.br";

export interface WesccChannelStatus {
  status: "CONNECTED" | "DISCONNECTED" | "TIMEOUT" | string;
}

export interface WesccChat {
  id: string;
  number?: string;
  name?: string;
  photo?: string;
  unread?: number;
  status?: number;
  lastMessage?: string;
  lastMessageAt?: string;
  metadata?: Record<string, any>;
}

export interface WesccMessage {
  id: string;
  chatId?: string;
  fromMe?: boolean;
  body?: string;
  type?: string;
  timestamp?: number;
  mediaUrl?: string;
  mimeType?: string;
  status?: string;
}

export interface WesccChatDetail extends WesccChat {
  attendanceId?: string;
  messages?: any[];
}

export interface WesccUser {
  id: string;
  name: string;
  email?: string;
}

export interface WesccSector {
  id: string;
  name: string;
}

export interface WesccTemplate {
  id?: string;
  name: string;
  language?: string;
  status?: string;
  category?: string;
  components?: any[];
}

export interface WesccListResponse<T> {
  data?: T[];
  chats?: T[];
  total?: number;
  page?: number;
}

// Map Wescctech remote status to local status
export function mapWesccStatus(remoteStatus: number): string {
  const map: Record<number, string> = {
    0: "automatic",
    1: "waiting_agent",
    2: "in_progress",
    3: "finalized",
    4: "finalized",
    5: "out_of_hours",
  };
  return map[remoteStatus] ?? "waiting_agent";
}

async function wesccFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${WESCCTECH_BASE}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "access-token": token,
      ...(options.headers ?? {}),
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Wescctech ${resp.status}: ${text}`);
  }

  const ct = resp.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return resp.json() as Promise<T>;
  }
  return {} as T;
}

export const wescctech = {
  /**
   * Test connection — GET /core/v2/api/channel/status
   * Returns true only if status === CONNECTED
   */
  async getStatus(token: string): Promise<WesccChannelStatus> {
    return wesccFetch<WesccChannelStatus>(token, "/core/v2/api/channel/status");
  },

  /**
   * Channel info — GET /core/v2/api/channel
   */
  async getChannel(token: string): Promise<Record<string, any>> {
    return wesccFetch(token, "/core/v2/api/channel");
  },

  /**
   * List chats (lite) — POST /core/v2/api/chats/list-lite
   */
  async listChatsLite(
    token: string,
    params: { typeChat?: number; status?: number; page?: number } = {}
  ): Promise<WesccListResponse<WesccChat>> {
    return wesccFetch<WesccListResponse<WesccChat>>(
      token,
      "/core/v2/api/chats/list-lite",
      { method: "POST", body: JSON.stringify({ typeChat: 2, status: 1, page: 0, ...params }) }
    );
  },

  /**
   * List chats (full) — POST /core/v2/api/chats/list
   */
  async listChats(
    token: string,
    params: { typeChat?: number; status?: number; page?: number } = {}
  ): Promise<WesccListResponse<WesccChat>> {
    return wesccFetch<WesccListResponse<WesccChat>>(
      token,
      "/core/v2/api/chats/list",
      { method: "POST", body: JSON.stringify({ typeChat: 2, status: 1, page: 0, ...params }) }
    );
  },

  /**
   * Get single chat — GET /core/v2/api/chats/:chatId
   */
  async getChat(token: string, chatId: string): Promise<WesccChatDetail> {
    return wesccFetch<WesccChatDetail>(token, `/core/v2/api/chats/${chatId}`);
  },

  /**
   * Create new chat — POST /core/v2/api/chats/create-new
   */
  async createChat(
    token: string,
    number: string
  ): Promise<WesccChat> {
    return wesccFetch<WesccChat>(token, "/core/v2/api/chats/create-new", {
      method: "POST",
      body: JSON.stringify({ number }),
    });
  },

  /**
   * Send text — POST /core/v2/api/chats/send-text
   */
  async sendText(
    token: string,
    params: {
      number: string;
      message: string;
      isWhisper?: boolean;
      forceSend?: boolean;
      verifyContact?: boolean;
      linkPreview?: boolean;
    }
  ): Promise<WesccMessage> {
    return wesccFetch<WesccMessage>(token, "/core/v2/api/chats/send-text", {
      method: "POST",
      body: JSON.stringify({
        forceSend: true,
        verifyContact: false,
        linkPreview: true,
        isWhisper: false,
        ...params,
      }),
    });
  },

  /**
   * Send media — POST /core/v2/api/chats/send-media
   */
  async sendMedia(
    token: string,
    params: {
      number?: string;
      contactId?: string;
      mediaUrl?: string;
      linkUrl?: string;
      base64?: string;
      extension?: string;
      fileName?: string;
      caption?: string;
      mimeType?: string;
      isWhisper?: boolean;
      forceSend?: boolean;
      verifyContact?: boolean;
    }
  ): Promise<WesccMessage> {
    const linkUrl = params.linkUrl ?? params.mediaUrl;
    const extension = params.extension ?? inferExtension(params.fileName ?? linkUrl ?? "", params.mimeType);
    return wesccFetch<WesccMessage>(token, "/core/v2/api/chats/send-media", {
      method: "POST",
      body: JSON.stringify({
        number: params.number,
        contactId: params.contactId,
        forceSend: params.forceSend ?? true,
        verifyContact: params.verifyContact ?? false,
        linkUrl,
        base64: params.base64,
        extension,
        fileName: params.fileName,
        caption: params.caption,
        isWhisper: params.isWhisper ?? false,
      }),
    });
  },

  /**
   * Send location — POST /core/v2/api/chats/send-location
   */
  async sendLocation(
    token: string,
    params: {
      number?: string;
      contactId?: string;
      description: string;
      latitude: number;
      longitude: number;
      forceSend?: boolean;
      verifyContact?: boolean;
    }
  ): Promise<WesccMessage> {
    return wesccFetch<WesccMessage>(token, "/core/v2/api/chats/send-location", {
      method: "POST",
      body: JSON.stringify({
        forceSend: params.forceSend ?? true,
        verifyContact: params.verifyContact ?? false,
        ...params,
      }),
    });
  },

  /**
   * Send contacts — POST /core/v2/api/chats/send-contacts
   */
  async sendContacts(
    token: string,
    params: {
      number?: string;
      contactId?: string;
      contacts: Array<{ name: string; number: string }>;
      forceSend?: boolean;
      verifyContact?: boolean;
    }
  ): Promise<WesccMessage> {
    return wesccFetch<WesccMessage>(token, "/core/v2/api/chats/send-contacts", {
      method: "POST",
      body: JSON.stringify({
        forceSend: params.forceSend ?? true,
        verifyContact: params.verifyContact ?? false,
        ...params,
      }),
    });
  },

  async listOfficialTemplates(
    token: string,
    params: { businessAccountId: string; graphBaseUrl?: string }
  ): Promise<WesccTemplate[]> {
    const base = params.graphBaseUrl ?? "https://graph.facebook.com/v21.0";
    const url = `${base}/${params.businessAccountId}/message_templates?access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`WhatsApp Official ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    return Array.isArray(data?.data) ? data.data : [];
  },

  async sendOfficialTemplate(
    token: string,
    params: {
      phoneNumberId: string;
      to: string;
      name: string;
      language?: string;
      components?: any[];
      graphBaseUrl?: string;
    }
  ): Promise<any> {
    const base = params.graphBaseUrl ?? "https://graph.facebook.com/v21.0";
    const resp = await fetch(`${base}/${params.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: params.name,
          language: { code: params.language ?? "pt_BR" },
          ...(params.components ? { components: params.components } : {}),
        },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`WhatsApp Official ${resp.status}: ${text}`);
    }
    return resp.json();
  },

  /**
   * Finalize (close) chat — POST /core/v2/api/chats/:chatId/finalize
   */
  async finalizeChat(token: string, chatId: string): Promise<void> {
    await wesccFetch(token, `/core/v2/api/chats/${chatId}/finalize`, {
      method: "POST",
      body: JSON.stringify({
        sendMessageFinalized: false,
        fidelityUser: false,
        sendResearchSatisfaction: false,
      }),
    });
  },

  /**
   * Transfer chat — POST /core/v2/api/chats/:chatId/transfer?sectorId=...&userId=...
   */
  async transferChat(
    token: string,
    chatId: string,
    params: { sectorId?: string; userId?: string }
  ): Promise<void> {
    const qs = new URLSearchParams();
    if (params.sectorId) qs.set("sectorId", params.sectorId);
    if (params.userId) qs.set("userId", params.userId);
    await wesccFetch(token, `/core/v2/api/chats/${chatId}/transfer?${qs}`, { method: "POST", body: "{}" });
  },

  /**
   * Get message — GET /core/v2/api/chats/messages/:messageId
   */
  async getMessage(token: string, messageId: string): Promise<WesccMessage> {
    return wesccFetch<WesccMessage>(token, `/core/v2/api/chats/messages/${messageId}`);
  },

  /**
   * List users — GET /core/v2/api/users
   */
  async getUsers(token: string): Promise<WesccUser[]> {
    const resp = await wesccFetch<WesccUser[] | { data: WesccUser[] }>(token, "/core/v2/api/users");
    return Array.isArray(resp) ? resp : (resp as any).data ?? [];
  },

  /**
   * List sectors — GET /core/v2/api/sectors
   */
  async getSectors(token: string): Promise<WesccSector[]> {
    const resp = await wesccFetch<WesccSector[] | { data: WesccSector[] }>(token, "/core/v2/api/sectors");
    return Array.isArray(resp) ? resp : (resp as any).data ?? [];
  },
};

function inferExtension(fileNameOrUrl: string, mimeType?: string): string {
  const byMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".ogg",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
  };
  if (mimeType && byMime[mimeType.toLowerCase()]) return byMime[mimeType.toLowerCase()];

  const clean = fileNameOrUrl.split("?")[0]?.split("#")[0] ?? "";
  const ext = clean.match(/\.([a-z0-9]{2,8})$/i)?.[0];
  return ext?.toLowerCase() ?? ".bin";
}
