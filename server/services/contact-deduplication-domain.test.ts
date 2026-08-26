import { describe, expect, it } from "vitest";
import {
  buildDuplicateEvidence,
  formatInboundConnection,
  groupDuplicateContacts,
} from "./contact-deduplication-domain";

const contact = (overrides: Record<string, unknown> = {}) => ({
  id: "contact-1",
  name: "Maria Silva",
  email: null,
  phone: null,
  city: null,
  state: null,
  mergedIntoContactId: null,
  ...overrides,
});

describe("contact deduplication domain", () => {
  it("classifies normalized email and phone as strong evidence", () => {
    const evidence = buildDuplicateEvidence(
      contact({ email: " MARIA@EXAMPLE.COM ", phone: "(51) 99999-0000" }),
      contact({ id: "contact-2", email: "maria@example.com", phone: "+55 51 99999-0000" }),
    );

    expect(evidence.map((item) => item.kind)).toEqual(["email", "phone"]);
    expect(evidence.every((item) => item.confidence === "high")).toBe(true);
  });

  it("classifies name with locality as review evidence", () => {
    expect(buildDuplicateEvidence(
      contact({ city: "Porto Alegre", state: "RS" }),
      contact({ id: "contact-2", name: " maria  silva ", city: "PORTO ALEGRE", state: "RS" }),
    )).toEqual([{ kind: "name_locality", confidence: "review", label: "Mesmo nome e localidade" }]);
  });

  it("does not group isolated homonyms or archived contacts", () => {
    const groups = groupDuplicateContacts([
      contact(),
      contact({ id: "contact-2" }),
      contact({ id: "contact-3", email: "same@example.com", mergedIntoContactId: "contact-1" }),
      contact({ id: "contact-4", email: "same@example.com" }),
    ]);

    expect(groups).toEqual([]);
  });

  it("groups transitive strong matches without duplicating contacts", () => {
    const groups = groupDuplicateContacts([
      contact({ id: "a", email: "one@example.com" }),
      contact({ id: "b", email: "one@example.com", phone: "51999990000" }),
      contact({ id: "c", phone: "+5551999990000" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].contacts.map((item) => item.id).sort()).toEqual(["a", "b", "c"]);
    expect(groups[0].confidence).toBe("high");
  });

  it("formats the immutable WhatsApp receiver snapshot", () => {
    expect(formatInboundConnection({ channel: "whatsapp", inboundConnectionName: "Gabinete Centro", inboundNumber: "+55 51 3333-0000" }))
      .toBe("WhatsApp recebido em Gabinete Centro - +55 51 3333-0000");
    expect(formatInboundConnection({ channel: "whatsapp", inboundConnectionName: "Gabinete Centro", inboundNumber: null }))
      .toBe("WhatsApp recebido em Gabinete Centro");
    expect(formatInboundConnection({ channel: "whatsapp", inboundConnectionName: null, inboundNumber: null }))
      .toBe("WhatsApp");
  });
});
