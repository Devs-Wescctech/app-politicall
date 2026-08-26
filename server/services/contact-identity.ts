import { normalizeBrazilPhone } from "@shared/phone";

export interface ContactIdentityCandidate {
  id: string;
  email?: string | null;
  phone?: string | null;
}

export interface ContactIdentityInput {
  accountId: string;
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  source?: string | null;
  interests?: string[] | null;
}

export function normalizeContactEmail(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchContactIdentity<T extends ContactIdentityCandidate>(
  contacts: T[],
  identity: { email?: string | null; phone?: string | null },
): T | undefined {
  const email = normalizeContactEmail(identity.email);
  const phone = normalizeBrazilPhone(identity.phone);
  if (email) {
    const byEmail = contacts.find((contact) => normalizeContactEmail(contact.email) === email);
    if (byEmail) return byEmail;
  }
  if (phone) return contacts.find((contact) => normalizeBrazilPhone(contact.phone) === phone);
  return undefined;
}

export async function resolveContactIdentity<T extends ContactIdentityCandidate>(
  input: ContactIdentityInput,
  dependencies: {
    findContact(accountId: string, identity: { email?: string | null; phone?: string | null }): Promise<T | undefined>;
    createContact(contact: ContactIdentityInput): Promise<T>;
  },
): Promise<T> {
  const email = normalizeContactEmail(input.email) || null;
  const phone = normalizeBrazilPhone(input.phone) || null;
  const existing = await dependencies.findContact(input.accountId, { email, phone });
  if (existing) return existing;
  return dependencies.createContact({ ...input, name: input.name.trim(), email, phone });
}
