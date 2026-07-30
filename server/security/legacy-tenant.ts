import jwt from "jsonwebtoken";

const LEGACY_TENANT_ROLES = ["admin", "coordenador", "assessor", "voluntario"] as const;
const LEGACY_TENANT_CLAIMS = new Set(["userId", "accountId", "role", "isAdmin", "iat", "exp"]);

export type LegacyTenantRole = typeof LEGACY_TENANT_ROLES[number];
export type PureLegacyTenantClaims = {
  userId: string;
  accountId: string;
  role: LegacyTenantRole;
  isAdmin: boolean;
  iat: number;
  exp: number;
};

function isTenantRole(value: unknown): value is LegacyTenantRole {
  return typeof value === "string" && (LEGACY_TENANT_ROLES as readonly string[]).includes(value);
}

export function isPureLegacyTenantClaims(claims: unknown): claims is PureLegacyTenantClaims {
  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) return false;
  const payload = claims as Record<string, unknown>;
  if (Object.keys(payload).some((claim) => !LEGACY_TENANT_CLAIMS.has(claim))) return false;
  if (!Object.hasOwn(payload, "userId") || !Object.hasOwn(payload, "accountId") || !Object.hasOwn(payload, "role") || !Object.hasOwn(payload, "isAdmin") || !Object.hasOwn(payload, "iat") || !Object.hasOwn(payload, "exp")) return false;
  if (typeof payload.userId !== "string" || payload.userId.length === 0 || typeof payload.accountId !== "string" || payload.accountId.length === 0) return false;
  if (!isTenantRole(payload.role) || typeof payload.isAdmin !== "boolean") return false;
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return false;
  return payload.isAdmin === (payload.role === "admin");
}

export function verifyPureLegacyTenantToken(token: string, secret: string): PureLegacyTenantClaims | undefined {
  try {
    const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (!isPureLegacyTenantClaims(claims) || claims.exp * 1000 <= Date.now()) return undefined;
    return claims;
  } catch {
    return undefined;
  }
}
