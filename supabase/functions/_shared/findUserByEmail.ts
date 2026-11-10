// Pure helper (no Deno globals, no URL imports) so it can be unit-tested from src/test.
//
// supabase.auth.admin.listUsers() returns only ONE page (50 users by default).
// The old reset functions searched that single page, so every user after the
// 50th silently got no reset email / "User not found". This walks all pages.

export interface AdminUser {
  id: string;
  email?: string | null;
}

export interface AdminUserLister {
  listUsers(params: { page: number; perPage: number }): Promise<{
    data: { users: AdminUser[] } | null;
    error: unknown;
  }>;
}

export async function findUserByEmail(
  admin: AdminUserLister,
  email: string,
  perPage = 1000,
  maxPages = 1000,
): Promise<AdminUser | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) return null; // last page
  }
  return null;
}
