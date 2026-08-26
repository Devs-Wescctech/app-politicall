import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS } from "@shared/schema";
import { canAccessPermission, canAccessPermissionSet } from "./permission-access";

describe("permission access", () => {
  it("allows a coordinator to open settings when settings permission is granted", () => {
    expect(canAccessPermission({
      role: "coordenador",
      permissions: DEFAULT_PERMISSIONS.coordenador,
    }, "settings")).toBe(true);
  });

  it("denies settings when it was explicitly revoked", () => {
    expect(canAccessPermission({
      role: "coordenador",
      permissions: { ...DEFAULT_PERMISSIONS.coordenador, settings: false },
    }, "settings")).toBe(false);
  });

  it("allows grouped modules when at least one permission is granted", () => {
    expect(canAccessPermissionSet({
      role: "assessor",
      permissions: { ...DEFAULT_PERMISSIONS.assessor, whatsappAttendance: true },
    }, ["whatsappAttendance", "emailAttendance"])).toBe(true);
  });

  it("always allows tenant administrators", () => {
    expect(canAccessPermission({ role: "admin", permissions: DEFAULT_PERMISSIONS.voluntario }, "settings")).toBe(true);
  });
});
