import { describe, expect, it } from "vitest";
import {
  allowFixedWindowAttempt,
  filterPublishedPetitions,
  isPublicPetitionOpenForSignature,
  isPublicPetitionVisible,
  normalizePetitionCollectionConfig,
  normalizePetitionCampaignLogStatus,
  sanitizePetitionCampaign,
  sanitizePublicPetition,
  validatePublicSignatureRequirements,
} from "./petitions";

describe("public petition visibility", () => {
  it("hides drafts from public endpoints and keeps closed petitions visible", () => {
    expect(isPublicPetitionVisible({ status: "rascunho" })).toBe(false);
    expect(isPublicPetitionVisible({ status: "publicada" })).toBe(true);
    expect(isPublicPetitionVisible({ status: "pausada" })).toBe(true);
    expect(isPublicPetitionVisible({ status: "concluida" })).toBe(true);
  });

  it("only lets published petitions receive signatures", () => {
    expect(isPublicPetitionOpenForSignature({ status: "publicada" })).toBe(true);
    expect(isPublicPetitionOpenForSignature({ status: "pausada" })).toBe(false);
    expect(isPublicPetitionOpenForSignature({ status: "concluida" })).toBe(false);
    expect(isPublicPetitionOpenForSignature({ status: "rascunho" })).toBe(false);
  });

  it("filters Link Bio petitions to published petitions only", () => {
    const petitions = [
      { id: "draft", status: "rascunho" },
      { id: "published", status: "publicada" },
      { id: "paused", status: "pausada" },
    ];

    expect(filterPublishedPetitions(petitions).map((p) => p.id)).toEqual(["published"]);
  });
});

describe("validatePublicSignatureRequirements", () => {
  it("enforces server-side required fields and public consent flags", () => {
    const issues = validatePublicSignatureRequirements(
      {
        requireEmail: true,
        requirePhone: true,
        requireLocation: true,
        requireCpf: true,
        requireComment: true,
        lgpdText: "Política de privacidade",
      },
      { acceptedTerms: false, acceptedLgpd: false },
    );

    expect(issues.map((issue) => issue.field)).toEqual([
      "email",
      "phone",
      "location",
      "cpf",
      "comment",
      "acceptedTerms",
      "acceptedLgpd",
    ]);
  });

  it("accepts city or state for required location", () => {
    expect(validatePublicSignatureRequirements(
      { requireLocation: true },
      { city: "São Paulo", acceptedTerms: true },
    )).toEqual([]);
    expect(validatePublicSignatureRequirements(
      { requireLocation: true },
      { state: "SP", acceptedTerms: true },
    )).toEqual([]);
  });
});

describe("public response sanitizers", () => {
  it("exposes required fields as collected fields so public forms cannot hide mandatory inputs", () => {
    const result = sanitizePublicPetition({
      id: "petition-1",
      title: "Petição",
      description: "Descrição",
      goal: 100,
      status: "publicada",
      slug: "peticao",
      collectEmail: false,
      collectPhone: false,
      collectCity: false,
      collectState: false,
      collectCpf: false,
      collectComment: false,
      requireEmail: true,
      requirePhone: true,
      requireLocation: true,
      requireCpf: true,
      requireComment: true,
    });

    expect(result).toMatchObject({
      collectEmail: true,
      collectPhone: true,
      collectCity: true,
      collectCpf: true,
      collectComment: true,
    });
  });

  it("returns only public petition fields", () => {
    const result = sanitizePublicPetition({
      id: "petition-1",
      accountId: "account-1",
      userId: "user-1",
      title: "Petição",
      description: "Descrição",
      bannerUrl: null,
      logoUrl: null,
      videoUrl: null,
      primaryColor: "#000000",
      shareText: null,
      goal: 100,
      status: "publicada",
      slug: "peticao",
      collectPhone: true,
      collectCity: true,
      collectState: false,
      collectCpf: false,
      collectEmail: true,
      collectComment: true,
      requireEmail: true,
      requirePhone: false,
      requireLocation: false,
      requireCpf: false,
      requireComment: false,
      lgpdText: "LGPD",
      viewsCount: 10,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      internalOnly: "secret",
    });

    expect(result).not.toHaveProperty("accountId");
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("internalOnly");
    expect(result).toMatchObject({
      id: "petition-1",
      title: "Petição",
      slug: "peticao",
      status: "publicada",
    });
  });

  it("never exposes petition campaign api tokens", () => {
    const result = sanitizePetitionCampaign({
      id: "campaign-1",
      name: "Campanha",
      apiToken: "plain-secret",
      status: "rascunho",
    });

    expect(result).toEqual({
      id: "campaign-1",
      name: "Campanha",
      status: "rascunho",
    });
  });
});

describe("normalizePetitionCollectionConfig", () => {
  it("collects every field that is marked as required", () => {
    expect(normalizePetitionCollectionConfig({
      collectEmail: false,
      collectPhone: false,
      collectCity: false,
      collectState: false,
      collectCpf: false,
      collectComment: false,
      requireEmail: true,
      requirePhone: true,
      requireLocation: true,
      requireCpf: true,
      requireComment: true,
    })).toMatchObject({
      collectEmail: true,
      collectPhone: true,
      collectCity: true,
      collectState: false,
      collectCpf: true,
      collectComment: true,
    });
  });

  it("keeps existing city or state collection when location is required", () => {
    expect(normalizePetitionCollectionConfig({
      collectCity: false,
      collectState: true,
      requireLocation: true,
    })).toMatchObject({
      collectCity: false,
      collectState: true,
    });
  });
});

describe("petition campaign logs", () => {
  it("normalizes send results to the canonical log statuses used by the UI", () => {
    expect(normalizePetitionCampaignLogStatus(true)).toBe("success");
    expect(normalizePetitionCampaignLogStatus(false)).toBe("error");
  });
});

describe("public signature rate limit", () => {
  it("blocks requests after the fixed window budget is exhausted", () => {
    const store = new Map<string, { count: number; resetAt: number }>();

    expect(allowFixedWindowAttempt(store, "ip:petition", 2, 1000, 100)).toMatchObject({ allowed: true, remaining: 1 });
    expect(allowFixedWindowAttempt(store, "ip:petition", 2, 1000, 200)).toMatchObject({ allowed: true, remaining: 0 });
    expect(allowFixedWindowAttempt(store, "ip:petition", 2, 1000, 300)).toMatchObject({ allowed: false, remaining: 0 });
    expect(allowFixedWindowAttempt(store, "ip:petition", 2, 1000, 1200)).toMatchObject({ allowed: true, remaining: 1 });
  });
});
