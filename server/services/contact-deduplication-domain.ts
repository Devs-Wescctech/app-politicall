import { normalizeBrazilPhone } from "@shared/phone";

export type DuplicateConfidence = "high" | "review";
export type DuplicateEvidenceKind = "email" | "phone" | "name_locality";

export interface ContactCandidate {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  mergedIntoContactId?: string | null;
}

export interface DuplicateEvidence {
  kind: DuplicateEvidenceKind;
  confidence: DuplicateConfidence;
  label: string;
}

export interface DuplicateGroup {
  id: string;
  confidence: DuplicateConfidence;
  contacts: ContactCandidate[];
  evidence: DuplicateEvidence[];
}

export interface InboundConnectionSnapshot {
  channel: string;
  inboundConnectionName?: string | null;
  inboundNumber?: string | null;
}

function normalizeText(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function uniqueEvidence(items: DuplicateEvidence[]): DuplicateEvidence[] {
  return items.filter((item, index) => items.findIndex((candidate) => candidate.kind === item.kind) === index);
}

export function buildDuplicateEvidence(left: ContactCandidate, right: ContactCandidate): DuplicateEvidence[] {
  const evidence: DuplicateEvidence[] = [];
  const leftEmail = normalizeText(left.email);
  const rightEmail = normalizeText(right.email);
  if (leftEmail && leftEmail === rightEmail) {
    evidence.push({ kind: "email", confidence: "high", label: "Mesmo e-mail" });
  }

  const leftPhone = normalizeBrazilPhone(left.phone);
  const rightPhone = normalizeBrazilPhone(right.phone);
  if (leftPhone && leftPhone === rightPhone) {
    evidence.push({ kind: "phone", confidence: "high", label: "Mesmo telefone" });
  }

  const sameName = normalizeText(left.name) !== "" && normalizeText(left.name) === normalizeText(right.name);
  const sameCity = normalizeText(left.city) !== "" && normalizeText(left.city) === normalizeText(right.city);
  const sameState = normalizeText(left.state) !== "" && normalizeText(left.state) === normalizeText(right.state);
  if (evidence.length === 0 && sameName && (sameCity || sameState)) {
    evidence.push({ kind: "name_locality", confidence: "review", label: "Mesmo nome e localidade" });
  }
  return evidence;
}

export function groupDuplicateContacts(contacts: ContactCandidate[]): DuplicateGroup[] {
  const active = contacts.filter((contact) => !contact.mergedIntoContactId);
  const parent = new Map(active.map((contact) => [contact.id, contact.id]));
  const pairEvidence = new Map<string, DuplicateEvidence[]>();
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (let leftIndex = 0; leftIndex < active.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex++) {
      const left = active[leftIndex];
      const right = active[rightIndex];
      const evidence = buildDuplicateEvidence(left, right);
      if (evidence.length === 0) continue;
      union(left.id, right.id);
      pairEvidence.set(`${left.id}:${right.id}`, evidence);
    }
  }

  const grouped = new Map<string, ContactCandidate[]>();
  for (const contact of active) {
    const root = find(contact.id);
    const group = grouped.get(root) ?? [];
    group.push(contact);
    grouped.set(root, group);
  }

  return [...grouped.values()].filter((items) => items.length > 1).map((items) => {
    const ids = new Set(items.map((item) => item.id));
    const evidence = uniqueEvidence([...pairEvidence.entries()]
      .filter(([key]) => key.split(":").every((id) => ids.has(id)))
      .flatMap(([, values]) => values));
    return {
      id: items.map((item) => item.id).sort().join(":"),
      confidence: evidence.some((item) => item.confidence === "high") ? "high" : "review",
      contacts: items,
      evidence,
    };
  });
}

export function formatInboundConnection(input: InboundConnectionSnapshot): string {
  const channel = input.channel.toLowerCase() === "whatsapp" ? "WhatsApp" : input.channel;
  const name = String(input.inboundConnectionName ?? "").trim();
  const number = String(input.inboundNumber ?? "").trim();
  if (name && number) return `${channel} recebido em ${name} - ${number}`;
  if (name) return `${channel} recebido em ${name}`;
  if (number) return `${channel} recebido em ${number}`;
  return channel;
}
