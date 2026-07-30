export type LegacyGlobalAdminClaims = {
  isAdmin?: unknown;
  userId?: unknown;
  accountId?: unknown;
};

export function isPureLegacyGlobalAdminClaims(claims: LegacyGlobalAdminClaims): boolean {
  return claims.isAdmin === true && claims.userId === undefined && claims.accountId === undefined;
}

export function verifyPureLegacyGlobalAdminToken(token: string, secret: string): boolean {
  try {
    const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
    return typeof claims === "object" && claims !== null && isPureLegacyGlobalAdminClaims(claims as LegacyGlobalAdminClaims);
  } catch {
    return false;
  }
}
import jwt from "jsonwebtoken";
