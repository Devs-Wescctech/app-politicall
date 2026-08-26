import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  USER_PERMISSION_GROUPS,
  resolveUserPermissions,
  type UserPermissions,
} from "./schema";

describe("user permissions", () => {
  it("fills missing coordinator permissions from the role defaults", () => {
    const resolved = resolveUserPermissions("coordenador", { contacts: true });

    expect(resolved.settings).toBe(true);
    expect(resolved.attendanceSettings).toBe(true);
    expect(resolved.attendanceManageQueues).toBe(true);
  });

  it("preserves permissions explicitly revoked from a coordinator", () => {
    const resolved = resolveUserPermissions("coordenador", { settings: false });

    expect(resolved.settings).toBe(false);
  });

  it("lists every permission in the permission management catalog exactly once", () => {
    const catalogKeys = USER_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));
    const expectedKeys = Object.keys(DEFAULT_PERMISSIONS.admin) as (keyof UserPermissions)[];

    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
    expect([...catalogKeys].sort()).toEqual([...expectedKeys].sort());
  });
});
