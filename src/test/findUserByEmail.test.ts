import { describe, it, expect, vi } from "vitest";
import { AdminUser, findUserByEmail } from "../../supabase/functions/_shared/findUserByEmail";

function fakeAdmin(total: number) {
  const users: AdminUser[] = Array.from({ length: total }, (_, i) => ({ id: `u${i + 1}`, email: `user${i + 1}@example.com` }));
  const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({
    data: { users: users.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }));
  return { listUsers };
}

describe("findUserByEmail (password reset beyond the first 50 users)", () => {
  it("finds a user on a later page", async () => {
    const admin = fakeAdmin(120);
    const user = await findUserByEmail(admin, "USER118@example.com ", 50);
    expect(user?.id).toBe("u118");
    expect(admin.listUsers).toHaveBeenCalledTimes(3);
  });

  it("stops at the last (short) page when the email does not exist", async () => {
    const admin = fakeAdmin(120);
    expect(await findUserByEmail(admin, "nobody@example.com", 50)).toBeNull();
    expect(admin.listUsers).toHaveBeenCalledTimes(3);
  });

  it("propagates admin API errors instead of reporting 'not found'", async () => {
    const admin = { listUsers: vi.fn(async () => ({ data: null, error: new Error("service unavailable") })) };
    await expect(findUserByEmail(admin, "user1@example.com")).rejects.toThrow("service unavailable");
  });
});
