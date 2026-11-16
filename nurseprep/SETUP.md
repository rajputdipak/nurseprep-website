# NursePrep — Setup Guide

Phase 1 MVP: nursing exam practice platform.
Stack: Next.js 14 + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel.

---

## 1. Create your Supabase project (one-time)

1. Go to https://supabase.com and sign in (GitHub login is easiest).
2. Click **New Project**, pick your organization, give it a name (e.g. `nurseprep`), set a strong database password, choose the region closest to your users (Mumbai/Singapore), click **Create**.
3. Wait ~2 minutes for provisioning.
4. Open **Project Settings → API**. Copy two values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Create the database

1. In Supabase, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   This creates all 8 tables, RLS policies, the profile trigger, and the question engine.
3. Open another **New query**, paste [`supabase/seed.sql`](supabase/seed.sql), click **Run**.
   This adds 8 exams, 32 tests, 3 plans, and a 64-question shared bank.

## 3. Configure Auth

1. Supabase → **Authentication → Sign In / Providers** (or **Providers**): make sure **Email** is enabled.
2. Keep **Confirm email** ON (default).
3. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (change to your Vercel URL after deploy)
   - **Redirect URLs**: add `http://localhost:3000/auth/callback`
4. For faster local testing you can turn OFF "Confirm email" — registration then logs in immediately. Turn it back ON for production.

## 4. Run locally

```bash
cp .env.example .env.local
# edit .env.local and paste your Supabase URL + anon key
npm install
npm run dev
```

Open http://localhost:3000.

## 5. Make yourself admin

1. Register on the site with your Gmail and confirm the email.
2. Supabase → **SQL Editor**, run (replace the email):

```sql
update public.profiles set role = 'admin' where email = 'your-email@gmail.com';
```

3. Log out and log back in — you'll land on `/admin`.

## 6. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Go to https://vercel.com → **Add New → Project** → import the repo. Framework preset auto-detects Next.js.
3. Add **Environment Variables** (same values as `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` = your Vercel URL (e.g. `https://nurseprep.vercel.app`)
4. Click **Deploy**.
5. Back in Supabase → **Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel URL
   - Add `https://YOUR-APP.vercel.app/auth/callback` to **Redirect URLs**

## CSV upload format (Admin → Questions)

Header row required:

```
subject,question,option_a,option_b,option_c,option_d,correct_answer,explanation
```

- `correct_answer` must be `a`, `b`, `c` or `d`
- `explanation` is optional but recommended
- A downloadable sample is at `/sample-questions.csv`
- Questions uploaded to **Shared bank** are available to every exam; exam-specific uploads serve only that exam.

## How the question engine works

- `start_attempt(test_id)` picks questions randomly **with subject weightage** (`tests.subject_weights`).
- The user's **100 most recently answered questions are excluded**, so repeat attempts stay fresh.
- If the remaining pool is smaller than the test's question count, the API returns **HTTP 400** and the UI shows a friendly message.
- Grading happens **only on the server** (`submit_attempt`); the client never receives `correct_answer` until the attempt is submitted.
- Late submissions (past duration + 2 min grace) are graded from the last saved answers.

## Security model

- RLS enabled on all 8 tables.
- `questions` has **no select policy for regular users** — they read client-safe data only through security-definer functions that strip `correct_answer`.
- Users can only update the `answers` column of their own in-progress attempts; scores are written exclusively by the grading function.
- A trigger blocks self-promotion to admin.
- Middleware guards `/dashboard`, `/exam/*`, `/test/*`, `/result/*`, `/admin`; the admin layout re-checks the role server-side.

## Project structure

```
app/                  pages + API routes (App Router)
components/           UI + feature components (shadcn/ui in components/ui)
lib/supabase/         browser / server / middleware clients
lib/types.ts          shared types
supabase/schema.sql   tables, RLS, triggers, question engine
supabase/seed.sql     exams, tests, plans, 64 sample questions
public/sample-questions.csv
```

## Phase 2 (not built yet)

Payments/UTR flow (tables already exist), dark mode, PWA, email notifications, analytics.