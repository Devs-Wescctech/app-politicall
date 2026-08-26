import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

const runDatabaseIntegration = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);

describe.skipIf(!runDatabaseIntegration)("channel connection lifecycle SQL", () => {
  it("disables connections referenced through either campaign JSON path", async () => {
    const [{ db }, { DatabaseStorage }, schema, drizzle] = await Promise.all([
      import("./db"),
      import("./storage"),
      import("@shared/schema"),
      import("drizzle-orm"),
    ]);
    const { accounts, users, channelConnections, marketingCampaigns } = schema;
    const { and, eq } = drizzle;
    const accountId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const sendConnectionId = crypto.randomUUID();
    const templateConnectionId = crypto.randomUUID();
    const storage = new DatabaseStorage();

    try {
      await db.insert(accounts).values({ id: accountId, name: "Lifecycle SQL test" });
      await db.insert(users).values({
        id: userId,
        accountId,
        email: `lifecycle-${userId}@example.test`,
        password: "not-used-by-test",
        name: "Lifecycle SQL test",
        role: "admin",
      });
      await db.insert(channelConnections).values([
        { id: sendConnectionId, accountId, name: "Send", channel: "whatsapp", provider: "wescctech", status: "connected" },
        { id: templateConnectionId, accountId, name: "Template", channel: "whatsapp", provider: "wescctech", status: "connected" },
      ]);
      await db.insert(marketingCampaigns).values([
        {
          id: crypto.randomUUID(), accountId, userId, name: "Send reference", type: "whatsapp", message: "test", recipients: [], status: "rascunho",
          sendConfig: { waConnectionId: sendConnectionId },
        },
        {
          id: crypto.randomUUID(), accountId, userId, name: "Template reference", type: "whatsapp", message: "test", recipients: [], status: "rascunho",
          templateConfig: { waConnectionId: templateConnectionId },
        },
      ]);

      expect(await storage.removeChannelConnection(accountId, sendConnectionId)).toMatchObject({ deleted: false, connection: { status: "disabled" } });
      expect(await storage.removeChannelConnection(accountId, templateConnectionId)).toMatchObject({ deleted: false, connection: { status: "disabled" } });
    } finally {
      await db.delete(marketingCampaigns).where(eq(marketingCampaigns.accountId, accountId));
      await db.delete(channelConnections).where(eq(channelConnections.accountId, accountId));
      await db.delete(users).where(and(eq(users.id, userId), eq(users.accountId, accountId)));
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });
});
