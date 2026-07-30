import jwt from "jsonwebtoken";

export type LegacyGlobalAdminClaims = {
  isAdmin?: unknown;
  userId?: unknown;
  accountId?: unknown;
  sid?: unknown;
  kind?: unknown;
  principalId?: unknown;
  principalType?: unknown;
  globalAdminPrincipalId?: unknown;
  globalAdminId?: unknown;
  tenantId?: unknown;
  id?: unknown;
  user?: unknown;
  account?: unknown;
  sub?: unknown;
};

export function isPureLegacyGlobalAdminClaims(claims: LegacyGlobalAdminClaims): boolean {
  return claims.isAdmin === true
    && claims.userId === undefined
    && claims.accountId === undefined
    && claims.sid === undefined
    && claims.kind === undefined
    && claims.principalId === undefined
    && claims.principalType === undefined
    && claims.globalAdminPrincipalId === undefined
    && claims.globalAdminId === undefined
    && claims.tenantId === undefined
    && claims.id === undefined
    && claims.user === undefined
    && claims.account === undefined
    && claims.sub === undefined;
}

export function verifyPureLegacyGlobalAdminToken(token: string, secret: string): boolean {
  try {
    const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
    return typeof claims === "object" && claims !== null && isPureLegacyGlobalAdminClaims(claims as LegacyGlobalAdminClaims);
  } catch {
    return false;
  }
}
