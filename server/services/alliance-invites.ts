import crypto from "crypto";

export function generateAllianceInviteToken(randomBytes = crypto.randomBytes): string {
  return randomBytes(3).toString("hex").toUpperCase();
}
