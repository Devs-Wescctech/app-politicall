import { normalizeBrazilPhone } from "@shared/phone";
import { normalizeContactEmail } from "./contact-identity";

interface SignatureIdentity {
  accountId: string;
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
}

interface ExistingContact {
  id: string;
  email?: string | null;
  phone?: string | null;
}

interface ContactLinkDependencies {
  findContact(accountId: string, identity: { email?: string | null; phone?: string | null }): Promise<ExistingContact | undefined>;
  createContact(input: Record<string, unknown> & { accountId: string; userId: string; name: string }): Promise<{ id: string }>;
}

export async function resolvePetitionSignatureContact(
  signature: SignatureIdentity,
  dependencies: ContactLinkDependencies,
): Promise<string | null> {
  const email = normalizeContactEmail(signature.email);
  const phone = normalizeBrazilPhone(signature.phone);
  if (!email && !phone) return null;

  const existing = await dependencies.findContact(signature.accountId, { email, phone });
  if (existing) return existing.id;

  const contact = await dependencies.createContact({
    accountId: signature.accountId,
    userId: signature.userId,
    name: signature.name.trim(),
    email: email || null,
    phone: phone || null,
    city: signature.city?.trim() || null,
    state: signature.state?.trim() || null,
    source: "Peticao",
    interests: ["Signatario"],
  });
  return contact.id;
}
