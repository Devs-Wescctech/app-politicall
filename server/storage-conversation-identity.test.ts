import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { attConversations } from "@shared/schema";

process.env.DATABASE_URL ??= "postgres://username:password@127.0.0.1:5432/database_name";

function compileExternalConversationLookup(filter: unknown) {
  return new PgDialect().sqlToQuery(sql`SELECT * FROM ${attConversations} WHERE ${filter as any}`);
}

describe("conversation external identity lookup", () => {
  it("matches an explicit connection as part of the thread identity", async () => {
    const storageModule = await import("./storage");
    const buildConversationExternalIdentityFilter = (storageModule as any).buildConversationExternalIdentityFilter;

    expect(buildConversationExternalIdentityFilter).toBeTypeOf("function");

    const query = compileExternalConversationLookup(
      buildConversationExternalIdentityFilter("account-1", "thread-1", "connection-a"),
    );

    expect(query.sql).toContain('"att_conversations"."connection_id" = $3');
    expect(query.params).toEqual(["account-1", "thread-1", "connection-a"]);
  });

  it("limits legacy callers to rows with a null connection identity", async () => {
    const storageModule = await import("./storage");
    const buildConversationExternalIdentityFilter = (storageModule as any).buildConversationExternalIdentityFilter;

    expect(buildConversationExternalIdentityFilter).toBeTypeOf("function");

    const query = compileExternalConversationLookup(
      buildConversationExternalIdentityFilter("account-1", "thread-1"),
    );

    expect(query.sql).toContain('"att_conversations"."connection_id" is null');
    expect(query.params).toEqual(["account-1", "thread-1"]);
  });
});
