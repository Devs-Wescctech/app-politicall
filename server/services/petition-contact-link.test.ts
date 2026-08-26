import { describe, expect, it, vi } from "vitest";
import { resolvePetitionSignatureContact } from "./petition-contact-link";

const signature = {
  accountId: "account-a",
  userId: "user-a",
  name: "Maria Silva",
  email: " MARIA@EXAMPLE.COM ",
  phone: "+55 (11) 99999-0000",
  city: "Sao Paulo",
  state: "SP",
};

describe("petition signature contact link", () => {
  it("reuses an account contact with the same normalized email", async () => {
    const createContact = vi.fn();
    const id = await resolvePetitionSignatureContact(signature, {
      findContact: vi.fn(async () => ({ id: "contact-a", email: "maria@example.com", phone: null })),
      createContact,
    });

    expect(id).toBe("contact-a");
    expect(createContact).not.toHaveBeenCalled();
  });

  it("reuses an account contact with the same normalized phone", async () => {
    const id = await resolvePetitionSignatureContact({ ...signature, email: null }, {
      findContact: vi.fn(async () => ({ id: "contact-b", email: null, phone: "11999990000" })),
      createContact: vi.fn(),
    });

    expect(id).toBe("contact-b");
  });

  it("creates a CRM contact for an identifiable new signer", async () => {
    const createContact = vi.fn(async () => ({ id: "contact-new" }));
    const id = await resolvePetitionSignatureContact(signature, {
      findContact: vi.fn(async () => undefined),
      createContact,
    });

    expect(id).toBe("contact-new");
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "account-a",
      userId: "user-a",
      email: "maria@example.com",
      source: "Peticao",
    }));
  });

  it("does not create or link a signer without email or phone", async () => {
    const createContact = vi.fn();
    const id = await resolvePetitionSignatureContact({ ...signature, email: null, phone: null }, {
      findContact: vi.fn(async () => ({ id: "same-name", email: null, phone: null })),
      createContact,
    });

    expect(id).toBeNull();
    expect(createContact).not.toHaveBeenCalled();
  });
});
