import { describe, expect, it, vi } from "vitest";
import { matchContactIdentity, resolveContactIdentity } from "./contact-identity";

const contacts = [
  { id: "email", email: "maria@example.com", phone: null },
  { id: "phone", email: null, phone: "+55 (11) 99999-0000" },
];

describe("contact identity", () => {
  it("matches normalized email before phone", () => {
    expect(matchContactIdentity(contacts, { email: " MARIA@EXAMPLE.COM ", phone: "11999990000" })?.id).toBe("email");
  });

  it("matches a normalized Brazilian phone", () => {
    expect(matchContactIdentity(contacts, { phone: "11 99999-0000" })?.id).toBe("phone");
  });

  it("creates a new contact without deleting a homonym", async () => {
    const createContact = vi.fn(async () => ({ id: "new", name: "Maria Silva" }));
    const result = await resolveContactIdentity({ accountId: "a", userId: "u", name: "Maria Silva", email: "other@example.com" }, {
      findContact: vi.fn(async () => undefined),
      createContact,
    });
    expect(result.id).toBe("new");
    expect(createContact).toHaveBeenCalledTimes(1);
  });
});
