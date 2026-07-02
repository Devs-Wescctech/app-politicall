import assert from "node:assert/strict";
import { WebSocket } from "ws";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const EMAIL = process.env.TEST_EMAIL ?? "adm@politicall.com.br";
const PASSWORD = process.env.TEST_PASSWORD ?? "admin123";

function buildHeaders(options = {}) {
  return {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers ?? {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed ${res.status}: ${text}`);
  }
  return data;
}

async function requestFailure(path, options = {}, expectedStatus) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} unexpectedly succeeded`);
  }
  if (expectedStatus && res.status !== expectedStatus) {
    throw new Error(`${options.method ?? "GET"} ${path} expected ${expectedStatus}, got ${res.status}: ${text}`);
  }
  return { status: res.status, data, text };
}

async function requestForm(path, { token, formData, method = "POST" } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} failed ${res.status}: ${text}`);
  }
  return data;
}

async function requestBlob(path, { token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path} failed ${res.status}: ${text}`);
  }
  return text;
}

function waitForRealtimeEvent(socket, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for realtime event"));
    }, timeoutMs);

    function onMessage(raw) {
      const event = JSON.parse(raw.toString());
      if (!predicate(event)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(event);
    }

    socket.on("message", onMessage);
  });
}

function waitForOpen(socket, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening websocket")), timeoutMs);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", reject);
  });
}

async function createOperator(adminToken, suffix, slot) {
  const email = `smoke-${slot}-${suffix}@politicall.local`;
  const password = `Smoke${slot}-${suffix}!`;
  const user = await request("/api/admin/users/create", {
    method: "POST",
    token: adminToken,
    body: {
      email,
      password,
      name: `Smoke Operador ${slot}`,
      role: "assessor",
    },
  });
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.ok(login.token, `operator ${slot} should login`);
  return { ...user, token: login.token };
}

const adminLogin = await request("/api/auth/login", {
  method: "POST",
  body: { email: EMAIL, password: PASSWORD },
});
assert.ok(adminLogin.token, "admin login should return token");
const adminMe = await request("/api/auth/me", { token: adminLogin.token });
assert.ok(adminMe.accountId, "admin user should expose accountId");

const suffix = Date.now().toString(36);
const operatorA = await createOperator(adminLogin.token, suffix, "a");
const operatorB = await createOperator(adminLogin.token, suffix, "b");

const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/api/attendance/realtime?token=${encodeURIComponent(adminLogin.token)}`;
const socket = new WebSocket(wsUrl);
await waitForOpen(socket);

let connection;
let queue;

try {
  connection = await request("/api/attendance/connections", {
    method: "POST",
    token: adminLogin.token,
    body: {
      name: `Smoke Test ${suffix}`,
      channel: "webchat",
      provider: "local-test",
      status: "connected",
    },
  });
  assert.ok(connection.id, "connection should be created");

  queue = await request("/api/attendance/queues", {
    method: "POST",
    token: adminLogin.token,
    body: {
      name: `Smoke Queue ${suffix}`,
      channel: "webchat",
      strategy: "manual",
      maxWaitMinutes: 15,
      priority: 1,
    },
  });
  assert.ok(queue.id, "queue should be created");

  const whuIntegration = await request(`/api/admin/accounts/${adminMe.accountId}/integrations/whatsapp`, {
    method: "PATCH",
    token: adminLogin.token,
    body: {
      service: "whatsapp",
      enabled: false,
      whatsappPhoneNumber: "+5500000000000",
      whatsappPhoneNumberId: `phone-${suffix}`,
      whatsappBusinessAccountId: `waba-${suffix}`,
      whatsappWebhookUrl: `${BASE_URL}/api/webhooks/attendance/whu`,
    },
  });
  assert.equal(whuIntegration.whatsappPhoneNumberId, `phone-${suffix}`, "whatsapp integration should be scoped to account");

  const smsIntegration = await request(`/api/admin/accounts/${adminMe.accountId}/integrations/sms`, {
    method: "PATCH",
    token: adminLogin.token,
    body: {
      service: "sms",
      enabled: true,
      smsEndpoint: "http://integracao.oktor.com.br/integracao3.do",
      smsAccount: `sms-${suffix}@politicall.local`,
      smsCode: `code-${suffix}`,
      smsClient: `client-${suffix}`,
      smsTipoEnvio: "7",
    },
  });
  assert.equal(smsIntegration.smsCode, "***", "sms code should be masked");
  assert.equal(smsIntegration.smsClient, `client-${suffix}`, "sms client should come from company integration");

  const storedSmsIntegration = await request(`/api/admin/accounts/${adminMe.accountId}/integrations/sms`, { token: adminLogin.token });
  assert.equal(storedSmsIntegration.smsCode, "***", "stored sms code should remain masked");
  assert.equal(storedSmsIntegration.smsClient, `client-${suffix}`, "stored sms client should not be hardcoded");

  const smsIntegrationTest = await request(`/api/admin/accounts/${adminMe.accountId}/integrations/sms/test`, {
    method: "POST",
    token: adminLogin.token,
    body: { action: "validate" },
  });
  assert.equal(smsIntegrationTest.success, true, "sms integration validation should pass without external send");

  const emailIntegration = await request(`/api/admin/accounts/${adminMe.accountId}/integrations/email`, {
    method: "PATCH",
    token: adminLogin.token,
    body: {
      service: "email",
      enabled: true,
      locawebBaseUrl: "https://emailmarketing.locaweb.com.br/api/v1",
      locawebAccountId: `account-${suffix}`,
      locawebApiKey: `locaweb-${suffix}`,
      locawebAuthHeader: "Authorization",
      locawebAuthScheme: "Bearer",
    },
  });
  assert.equal(emailIntegration.locawebApiKey, "***", "locaweb api key should be masked");

  const externalThreadId = `smoke-thread-${suffix}`;
  const externalMessageId = `smoke-msg-${suffix}`;
  const realtimePromise = waitForRealtimeEvent(socket, (event) =>
    event.type === "attendance.message.created" &&
    event.payload?.externalMessageId === externalMessageId
  );

  await request(`/api/webhooks/attendance/webchat/${connection.id}`, {
    method: "POST",
    body: {
      externalThreadId,
      externalContactId: `55${suffix.replace(/[^0-9]/g, "").padEnd(11, "9").slice(0, 11)}`,
      body: "Mensagem inbound smoke",
      messageType: "text",
      externalMessageId,
    },
  });

  await realtimePromise;

  const conversations = await request("/api/attendance/conversations?channel=webchat", { token: adminLogin.token });
  const conversation = conversations.find((item) => item.externalThreadId === externalThreadId);
  assert.ok(conversation, "webhook should create conversation");
  assert.ok(conversation.attendanceCode?.startsWith("ATD-"), "conversation should have immutable attendance code");
  assert.equal(conversation.mode, "automatic", "new conversation should start in automatic mode");
  assert.equal(conversation.assignedUserId, null, "new conversation should not have an operator");

  const transferThreadId = `smoke-transfer-thread-${suffix}`;
  const transferMessageId = `smoke-transfer-msg-${suffix}`;
  await request(`/api/webhooks/attendance/webchat/${connection.id}`, {
    method: "POST",
    body: {
      externalThreadId: transferThreadId,
      externalContactId: `55${suffix.replace(/[^0-9]/g, "").padEnd(11, "8").slice(0, 11)}`,
      body: "Chat transferido para o usuário: Smoke Operador - Suporte no setor: Suporte",
      messageType: "system",
      externalMessageId: transferMessageId,
    },
  });
  const conversationsAfterTransfer = await request("/api/attendance/conversations?channel=webchat", { token: adminLogin.token });
  const transferredFromWebhook = conversationsAfterTransfer.find((item) => item.externalThreadId === transferThreadId);
  assert.ok(transferredFromWebhook, "external manual transfer should create/find conversation");
  assert.equal(transferredFromWebhook.mode, "manual", "external transfer should move conversation out of automatic mode");
  assert.equal(transferredFromWebhook.status, "waiting_agent", "external transfer without local owner should wait for an attendant");
  assert.equal(transferredFromWebhook.assignedUserId, null, "external transfer should not invent a local owner");

  const detail = await request(`/api/attendance/conversations/${conversation.id}`, { token: adminLogin.token });
  assert.ok(detail.messages.some((message) => message.externalMessageId === externalMessageId), "conversation should include inbound message");

  const blockedBeforeAssume = await requestFailure(`/api/attendance/conversations/${conversation.id}/send`, {
    method: "POST",
    token: operatorA.token,
    body: { message: "Mensagem antes de assumir", isWhisper: true },
  }, 403);
  assert.match(blockedBeforeAssume.text, /Assuma|responsável|responsavel/i, "operator should be blocked before assuming");

  const [claimA, claimB] = await Promise.allSettled([
    request(`/api/attendance/conversations/${conversation.id}/assume`, { method: "POST", token: operatorA.token, body: {} }),
    request(`/api/attendance/conversations/${conversation.id}/assume`, { method: "POST", token: operatorB.token, body: {} }),
  ]);
  const claims = [
    { slot: "a", user: operatorA, result: claimA },
    { slot: "b", user: operatorB, result: claimB },
  ];
  const winners = claims.filter((claim) => claim.result.status === "fulfilled");
  const losers = claims.filter((claim) => claim.result.status === "rejected");
  assert.equal(winners.length, 1, "only one operator should win concurrent assume");
  assert.equal(losers.length, 1, "one operator should receive assume conflict");
  assert.match(losers[0].result.reason.message, /409|assumido/i, "loser should receive conflict message");

  const winner = winners[0].user;
  const target = winner.id === operatorA.id ? operatorB : operatorA;

  await requestFailure(`/api/attendance/conversations/${conversation.id}/send`, {
    method: "POST",
    token: target.token,
    body: { message: "Mensagem do operador bloqueado", isWhisper: true },
  }, 403);

  const sentByWinner = await request(`/api/attendance/conversations/${conversation.id}/send`, {
    method: "POST",
    token: winner.token,
    body: { message: "Nota interna smoke", isWhisper: true },
  });
  assert.equal(sentByWinner.direction, "internal", "assigned operator should send internal message");

  const transferred = await request(`/api/attendance/conversations/${conversation.id}/transfer`, {
    method: "POST",
    token: adminLogin.token,
    body: {
      queueId: queue.id,
      userId: target.id,
      reason: "Smoke transfer",
    },
  });
  assert.equal(transferred.assignedUserId, target.id, "transfer should assign target operator");
  assert.equal(transferred.queueId, queue.id, "transfer should move conversation to queue");

  await requestFailure(`/api/attendance/conversations/${conversation.id}/send`, {
    method: "POST",
    token: winner.token,
    body: { message: "Mensagem do operador anterior", isWhisper: true },
  }, 403);

  const sentByTarget = await request(`/api/attendance/conversations/${conversation.id}/send`, {
    method: "POST",
    token: target.token,
    body: { message: "Mensagem do novo responsável", isWhisper: true },
  });
  assert.equal(sentByTarget.direction, "internal", "transferred operator should send internal message");

  await request(`/api/attendance/conversations/${conversation.id}/release`, { method: "POST", token: target.token, body: {} });
  const reassumed = await request(`/api/attendance/conversations/${conversation.id}/assume`, { method: "POST", token: target.token, body: {} });
  assert.equal(reassumed.assignedUserId, target.id, "released conversation should be claimable again");

  const paused = await request(`/api/attendance/conversations/${conversation.id}/pause`, { method: "POST", token: target.token, body: {} });
  assert.equal(paused.status, "paused", "pause should update status");

  const label = await request("/api/attendance/labels", {
    method: "POST",
    token: adminLogin.token,
    body: { name: `Smoke Label ${suffix}`, color: "#0ea5e9" },
  });
  assert.ok(label.id, "label should be created");

  const labeledConversation = await request(`/api/attendance/conversations/${conversation.id}/labels`, {
    method: "PATCH",
    token: adminLogin.token,
    body: { tags: [label.name] },
  });
  assert.ok(labeledConversation.tags.includes(label.name), "conversation should receive normalized label");

  const csv = `Nome,Telefone,Email,Cidade,Estado,Etiquetas,Observacoes\nSmoke Contato ${suffix},559199999${suffix.slice(-3)},smoke-${suffix}@politicall.local,Porto Alegre,RS,${label.name},Importado pelo smoke`;
  const formData = new FormData();
  formData.append("file", new Blob([csv], { type: "text/csv" }), `contacts-${suffix}.csv`);
  formData.append("mapping", JSON.stringify({
    name: "Nome",
    phone: "Telefone",
    email: "Email",
    city: "Cidade",
    state: "Estado",
    tags: "Etiquetas",
    notes: "Observacoes",
  }));
  const importJob = await requestForm("/api/attendance/contacts/import-file", { token: adminLogin.token, formData });
  assert.equal(importJob.status.startsWith("completed"), true, "contact file import should complete");
  assert.equal(importJob.processedRows, 1, "contact file import should process one row");

  const exportedContacts = await requestBlob(`/api/attendance/contacts/export?tag=${encodeURIComponent(label.name)}`, { token: adminLogin.token });
  assert.match(exportedContacts, new RegExp(`Smoke Contato ${suffix}`), "contact export should include imported labeled contact");

  await request(`/api/attendance/conversations/${conversation.id}/flags`, {
    method: "PATCH",
    token: adminLogin.token,
    body: { pinned: true, favorite: true },
  });

  const history = await request(`/api/attendance/conversations/${conversation.id}/history`, { token: adminLogin.token });
  assert.ok(history.events.length >= 8, "history should include audited events");
  assert.ok(history.messages.length >= 3, "history should include inbound and internal messages");
  assert.ok(history.transfers.length >= 1, "history should include transfer records");

  const audit = await request(`/api/attendance/audit?conversationId=${conversation.id}`, { token: adminLogin.token });
  assert.ok(audit.some((event) => event.action === "message.received"), "audit should include received message");
  assert.ok(audit.some((event) => event.action === "conversation.assumed"), "audit should include assume event");
  assert.ok(audit.some((event) => event.action === "conversation.transferred"), "audit should include transfer event");

  const dashboard = await request("/api/attendance/dashboard", { token: adminLogin.token });
  assert.ok(typeof dashboard.total === "number", "dashboard should return numeric totals");
  assert.ok(typeof dashboard.automatic === "number", "dashboard should return automatic totals");
  assert.ok(dashboard.byQueue && typeof dashboard.byQueue === "object", "dashboard should include queue distribution");
  assert.ok(dashboard.byQueue[queue.id] >= 1, "dashboard should include created queue in distribution");

  const exportedReport = await requestBlob("/api/attendance/reports/export?format=csv", { token: adminLogin.token });
  assert.match(exportedReport, /Total/, "report export should include KPI rows");

  const finalized = await request(`/api/attendance/conversations/${conversation.id}/close`, { method: "POST", token: adminLogin.token, body: {} });
  assert.equal(finalized.status, "finalized", "close should finalize conversation");

  const historyList = await request(`/api/attendance/history?search=${encodeURIComponent(conversation.attendanceCode)}`, { token: adminLogin.token });
  assert.ok(historyList.some((item) => item.id === conversation.id), "history list should include finalized conversation");

  const exportedHistory = await requestBlob(`/api/attendance/history/export?format=csv&search=${encodeURIComponent(conversation.attendanceCode)}`, { token: adminLogin.token });
  assert.match(exportedHistory, new RegExp(conversation.attendanceCode), "history export should include attendance code");

  const archived = await request(`/api/attendance/conversations/${conversation.id}/archive`, { method: "POST", token: adminLogin.token, body: {} });
  assert.equal(archived.metadata.flags.archived, true, "archive should mark conversation as archived");

  const archivedList = await request(`/api/attendance/archived?search=${encodeURIComponent(conversation.attendanceCode)}`, { token: adminLogin.token });
  assert.ok(archivedList.some((item) => item.id === conversation.id), "archived endpoint should include archived conversation");

  const normalListAfterArchive = await request(`/api/attendance/conversations?search=${encodeURIComponent(conversation.attendanceCode)}`, { token: adminLogin.token });
  assert.equal(normalListAfterArchive.some((item) => item.id === conversation.id), false, "archived conversation should be hidden from normal list");

  const restored = await request(`/api/attendance/conversations/${conversation.id}/restore`, { method: "POST", token: adminLogin.token, body: {} });
  assert.equal(restored.metadata.flags.archived, false, "restore should unarchive conversation");

  await request(`/api/attendance/conversations/${conversation.id}/archive`, { method: "POST", token: adminLogin.token, body: {} });
  const tombstone = await request(`/api/attendance/conversations/${conversation.id}`, {
    method: "DELETE",
    token: adminLogin.token,
    body: { reason: "Smoke tombstone" },
  });
  assert.equal(tombstone.success, true, "delete should create tombstone");

  const archivedAfterDelete = await request(`/api/attendance/archived?search=${encodeURIComponent(conversation.attendanceCode)}`, { token: adminLogin.token });
  assert.equal(archivedAfterDelete.some((item) => item.id === conversation.id), false, "tombstoned conversation should not appear in archived list");

  if (transferredFromWebhook?.id) {
    await request(`/api/attendance/conversations/${transferredFromWebhook.id}/archive`, { method: "POST", token: adminLogin.token, body: {} }).catch(() => null);
    await request(`/api/attendance/conversations/${transferredFromWebhook.id}`, {
      method: "DELETE",
      token: adminLogin.token,
      body: { reason: "Smoke transfer tombstone" },
    }).catch(() => null);
  }
} finally {
  if (queue?.id) {
    await request(`/api/attendance/queues/${queue.id}`, { method: "DELETE", token: adminLogin.token }).catch(() => null);
  }
  if (connection?.id) {
    await request(`/api/attendance/connections/${connection.id}`, { method: "DELETE", token: adminLogin.token }).catch(() => null);
  }
  socket.close();
}

console.log("Attendance smoke test passed");
