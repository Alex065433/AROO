
# Arowin Trading: Security & Environment Checklist

## 1. High Priority: Service Key Protection
**Why:** The `VITE_SUPABASE_SERVICE_KEY` has full administrative access (bypasses RLS). If included in your Vite build, it is visible to any visitor via Browser DevTools (Network tab).

**Checklist:**
- [ ] **Remove from Client-side:** Delete `VITE_SUPABASE_SERVICE_KEY` from `.env` (development) and Cloud environment variables (production).
- [ ] **Use Anon Key + Auth:** Use the `VITE_SUPABASE_ANON_KEY`. Secure your data using **Row Level Security (RLS)** as implemented in `supabase_security_policies.sql`.
- [ ] **Backend-only Operations:** Any operation requiring "Admin" privileges (like processing payments or binary logic) MUST happen inside **Supabase Edge Functions** or a dedicated **Express Backend** where the Service Key is safely stored in a non-exposed environment variable.

## 2. API Hardening
- [ ] **Enforce RLS:** Ensure every new table created in Supabase has `ENABLE ROW LEVEL SECURITY` executed immediately.
- [ ] **JWT Validation:** Edge functions should validate the user's JWT from the `Authorization` header when providing sensitive tree data.
- [ ] **Email Verification:** Enable "Confirm Email" in Supabase Auth to prevent fake account flooding in the binary tree.

## 3. MLM Integrity
- [ ] **Idempotent Logic:** Ensure the `calculate_binary_commission` RPC can be run safely (using internal flags to prevent double-payout on the same volume).
- [ ] **Audit Trail:** Every financial movement must generate a row in `transactions` with a linked `user_id` and a detailed description.
