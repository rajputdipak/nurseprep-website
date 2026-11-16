-- ============================================================
-- Nursing Test Platform — Phase 1 schema
-- Run this in Supabase SQL Editor (fresh project).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- TABLES ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  course text not null default 'BSc' check (course in ('BSc', 'ANM', 'GNM')),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('central', 'state')),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade, -- null = shared bank
  subject text not null,
  question_text text not null,
  question_key text generated always as (md5(lower(btrim(regexp_replace(question_text, '\s+', ' ', 'g'))))) stored,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer text not null check (correct_answer in ('a', 'b', 'c', 'd')),
  explanation text not null default '',
  created_at timestamptz not null default now()
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  category text not null check (category in ('full_mock', 'subject_test', 'daily_quiz', 'pyq')),
  name text not null,
  subject text, -- set for subject tests
  question_count int not null check (question_count > 0),
  duration_minutes int not null check (duration_minutes > 0),
  marks_per_correct numeric(8,4) not null default 1 check (marks_per_correct > 0 and marks_per_correct <= 100),
  negative_marks numeric(8,4) not null default 0.25 check (negative_marks >= 0 and negative_marks <= 100),
  subject_weights jsonb, -- e.g. {"Pharmacology": 10, "Pediatrics": 5}
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete cascade,
  question_ids uuid[] not null,
  answers jsonb not null default '{}'::jsonb, -- {question_id: 'a'|'b'|'c'|'d'}
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  score numeric(14,4) not null default 0,
  marks_per_correct numeric(8,4) not null default 1 check (marks_per_correct > 0 and marks_per_correct <= 100),
  negative_marks numeric(8,4) not null default 0 check (negative_marks >= 0 and negative_marks <= 100),
  total int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  skipped_count int not null default 0,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null default 0,
  duration_days int not null,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  amount numeric(10,2) not null,
  method text not null default 'upi',
  utr text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

-- ---------- PAYMENT TABLE ADDITIONS ----------
create table if not exists public.payment_settings (
  id integer primary key default 1 check (id = 1),
  upi_id text not null default '',
  payee_name text not null default '',
  is_enabled boolean not null default false,
  check (char_length(upi_id) <= 165 and (upi_id = '' or upi_id ~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9]{2,64}$')),
  check (char_length(payee_name) <= 100 and payee_name = btrim(payee_name)),
  check (not is_enabled or (upi_id <> '' and payee_name <> ''))
);
insert into public.payment_settings (id, upi_id, payee_name, is_enabled)
values (1, '8866170407@ybl', 'Rajput Dipak V', true)
on conflict (id) do nothing;

-- Fill the recipient only when nothing is configured yet; admin edits are never overwritten.
update public.payment_settings
   set upi_id = '8866170407@ybl', payee_name = 'Rajput Dipak V', is_enabled = true
 where id = 1 and btrim(upi_id) = '' and btrim(payee_name) = '';

-- Legacy installs seeded a 30-day Free Trial row; access itself follows the 7-day trial from profiles.created_at.
update public.plans set duration_days = 7 where name = 'Free Trial' and price = 0 and duration_days = 30;

alter table public.payments
  add column if not exists plan_name text,
  add column if not exists duration_days integer,
  add column if not exists upi_id text,
  add column if not exists payee_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists admin_note text not null default '';

-- One entitlement per newly verified payment; legacy entitlements remain unmodified.
alter table public.user_plans
  add column if not exists payment_id uuid references public.payments(id) on delete restrict;
create unique index if not exists user_plans_payment_unique
  on public.user_plans(payment_id) where payment_id is not null;
create index if not exists user_plans_access_idx on public.user_plans(user_id, ends_at) where status = 'active';
create index if not exists payments_open_intent_idx
  on public.payments(user_id, plan_id, created_at) where status = 'pending' and utr is null;

create unique index if not exists payments_utr_unique on public.payments(utr) where utr is not null;

create index questions_exam_idx on public.questions(exam_id);
create index questions_subject_idx on public.questions(subject);
create index questions_key_idx on public.questions(question_key);
create index tests_exam_idx on public.tests(exam_id);
create index attempts_user_idx on public.user_attempts(user_id, started_at desc);

-- ---------- HELPERS / TRIGGERS ----------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, course)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'course', 'BSc')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- PROFILE ROLE / TRIAL GUARD ----------
create or replace function public.protect_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role'
    or (auth.uid() is not null and public.is_admin())
    or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
begin
  -- current_user is the function owner in a SECURITY DEFINER function, not the caller.
  if not v_privileged then
    if new.role is distinct from old.role then
      raise exception 'ROLE_CHANGE_FORBIDDEN';
    end if;
    -- The same self-update policy must not let a student restart the free trial.
    if new.created_at is distinct from old.created_at or new.id is distinct from old.id then
      raise exception 'PROFILE_IDENTITY_CHANGE_FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profile_role_guard on public.profiles;
create trigger profile_role_guard before update on public.profiles
for each row execute function public.protect_profile_role();

-- ---------- MANUAL PAYMENT FUNCTIONS ----------
create or replace function public.create_payment_request(p_plan_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_settings public.payment_settings%rowtype;
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not (v_plan.price > 0 and v_plan.price <= 100000 and v_plan.duration_days between 1 and 3650)
     or char_length(btrim(v_plan.name)) not between 1 and 100 then
    raise exception 'INVALID_PAID_PLAN';
  end if;
  select * into v_settings from public.payment_settings where id = 1;
  if not found then raise exception 'PAYMENTS_UNAVAILABLE'; end if;
  if not v_settings.is_enabled
     or v_settings.upi_id !~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9]{2,64}$'
     or char_length(btrim(v_settings.payee_name)) not between 1 and 100 then
    raise exception 'PAYMENTS_UNAVAILABLE';
  end if;

  -- Immutable quotes survive later price/destination edits. Do not reuse incomplete legacy rows.
  select id into v_id from public.payments
  where user_id = v_user and plan_id = p_plan_id and status = 'pending' and utr is null
    and amount > 0 and duration_days > 0 and plan_name is not null
    and upi_id ~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9]{2,64}$'
    and char_length(btrim(payee_name)) between 1 and 100
  order by created_at, id limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.payments(user_id, plan_id, amount, method, status, plan_name, duration_days, upi_id, payee_name)
  values (v_user, v_plan.id, v_plan.price, 'upi', 'pending', v_plan.name, v_plan.duration_days,
    v_settings.upi_id, v_settings.payee_name)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.submit_payment_utr(p_payment_id uuid, p_utr text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_payment public.payments%rowtype;
  v_utr text := btrim(p_utr, E' \t\n\r\f\v');
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_utr is null or v_utr !~ '^[0-9]{12}$' then raise exception 'INVALID_UTR'; end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.user_id <> v_user then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;
  if v_payment.utr is not null then
    if v_payment.utr = v_utr then return v_payment.id; end if;
    raise exception 'UTR_ALREADY_SUBMITTED';
  end if;
  -- Include all statuses and owners; also recognize trimmed legacy references without changing them.
  if exists (select 1 from public.payments where id <> p_payment_id and btrim(utr, E' \t\n\r\f\v') = v_utr) then
    raise exception 'UTR_ALREADY_USED';
  end if;
  begin
    update public.payments set utr = v_utr where id = p_payment_id;
  exception when unique_violation then
    raise exception 'UTR_ALREADY_USED';
  end;
  -- A UTR is a claim, never evidence of receipt. Only manual admin review grants access.
  return p_payment_id;
end;
$$;

create or replace function public.review_payment(p_payment_id uuid, p_decision text, p_note text default '')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_user uuid;
  v_payment public.payments%rowtype;
  v_trial_end timestamptz;
  v_latest_end timestamptz;
  v_start timestamptz;
begin
  if v_admin is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_decision is null or p_decision not in ('verified', 'rejected') then raise exception 'INVALID_DECISION'; end if;
  if p_note is null or char_length(p_note) > 500 then raise exception 'INVALID_NOTE'; end if;

  select user_id into v_user from public.payments where id = p_payment_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  -- Always acquire the user lock before the row lock, including approvals of different payments.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.user_id <> v_user then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status = p_decision then return p_payment_id; end if;
  if v_payment.status <> 'pending' then raise exception 'REVIEW_CONFLICT'; end if;
  if v_payment.utr is null or btrim(v_payment.utr) = '' then raise exception 'UTR_REQUIRED'; end if;

  if p_decision = 'verified' then
    -- Legacy quotes without a duration cannot safely be approved from an editable current plan.
    if v_payment.duration_days is null or v_payment.duration_days not between 1 and 3650
       or v_payment.plan_id is null or v_payment.plan_name is null
       or char_length(btrim(v_payment.plan_name)) not between 1 and 100
       or v_payment.upi_id is null or v_payment.upi_id !~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9]{2,64}$'
       or v_payment.payee_name is null or char_length(btrim(v_payment.payee_name)) not between 1 and 100
       or not (v_payment.amount > 0 and v_payment.amount <= 100000) then
      raise exception 'PAYMENT_SNAPSHOT_MISSING';
    end if;
    select created_at + interval '7 days' into v_trial_end from public.profiles where id = v_user for update;
    if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
    select max(ends_at) into v_latest_end from public.user_plans
      where user_id = v_user and status = 'active' and ends_at > now();
    v_start := greatest(now(), v_trial_end, v_latest_end);
    insert into public.user_plans(user_id, plan_id, payment_id, starts_at, ends_at, status)
    values (v_user, v_payment.plan_id, p_payment_id, v_start,
      v_start + make_interval(days => v_payment.duration_days), 'active');
  end if;

  update public.payments set status = p_decision, reviewed_at = now(), reviewed_by = v_admin, admin_note = btrim(p_note)
    where id = p_payment_id;
  return p_payment_id;
end;
$$;

-- Self-scoped: no user-id argument that could be used to query another student's access.
create or replace function public.has_test_access()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid()
      and p.created_at <= now() and now() < p.created_at + interval '7 days')
    or exists (
      select 1 from public.user_plans up
      left join public.payments payment on payment.id = up.payment_id
      left join public.plans plan on plan.id = up.plan_id
      where up.user_id = auth.uid() and up.status = 'active'
        and up.starts_at <= now() and now() < up.ends_at
        and ((up.payment_id is not null and payment.status = 'verified' and payment.amount > 0)
          or (up.payment_id is null and plan.price > 0))
    )
  );
$$;

-- ---------- QUESTION ENGINE ----------

create or replace function public.start_attempt(p_test_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_test public.tests%rowtype;
  v_pool_ids uuid[];
  v_pool_subjects text[];
  v_selected uuid[] := '{}'::uuid[];
  v_ids uuid[];
  v_take int;
  v_remaining int;
  v_total_weight numeric;
  v_attempt_id uuid;
  r record;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.has_test_access() then
    raise exception 'ACCESS_EXPIRED';
  end if;

  -- Serialize starts across tabs so both cannot reserve the same unseen questions.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select * into v_test from public.tests where id = p_test_id and is_active;
  if not found then
    raise exception 'TEST_NOT_FOUND';
  end if;
  if not exists (select 1 from public.exams where id = v_test.exam_id and is_active) then
    raise exception 'TEST_NOT_FOUND';
  end if;

  with seen as materialized (
    select distinct q.question_key
    from public.user_attempts a
    cross join lateral unnest(a.question_ids) as used(qid)
    join public.questions q on q.id = used.qid
    where a.user_id = v_user
  ), pool as (
    select distinct on (q.question_key) q.id, q.subject
    from public.questions q
    where (q.exam_id = v_test.exam_id or q.exam_id is null)
      and (v_test.subject is null or lower(btrim(q.subject)) = lower(btrim(v_test.subject)))
      and not exists (select 1 from seen where seen.question_key = q.question_key)
    order by q.question_key, (q.exam_id is not null) desc, q.id
  )
  select array_agg(id order by id), array_agg(subject order by id)
  into v_pool_ids, v_pool_subjects from pool;

  if coalesce(cardinality(v_pool_ids), 0) < v_test.question_count then
    raise exception 'INSUFFICIENT_POOL' using detail = format(
      '%s unique unseen questions available; %s required for this exam/subject.',
      coalesce(cardinality(v_pool_ids), 0), v_test.question_count);
  end if;

  if jsonb_typeof(v_test.subject_weights) = 'object' then
    if exists (
      select 1 from jsonb_each_text(v_test.subject_weights)
      where value !~ '^[0-9]+([.][0-9]+)?$'
    ) then
      raise exception 'INVALID_TEST_WEIGHTS';
    end if;
    select sum(value::numeric) into v_total_weight
    from jsonb_each_text(v_test.subject_weights);

    if v_total_weight > 0 then
      for r in select key as subject, value::numeric as weight
               from jsonb_each_text(v_test.subject_weights)
               where value::numeric > 0 order by key
      loop
        v_remaining := v_test.question_count - cardinality(v_selected);
        exit when v_remaining <= 0;
        v_take := least(v_remaining, greatest(1, round(v_test.question_count * r.weight / v_total_weight)::int));
        select array_agg(id) into v_ids from (
          select id from unnest(v_pool_ids, v_pool_subjects) as pool(id, subject)
          where lower(btrim(subject)) = lower(btrim(r.subject)) and id <> all (v_selected)
          order by random() limit v_take
        ) s;
        v_selected := v_selected || coalesce(v_ids, '{}'::uuid[]);
      end loop;
    end if;
  end if;

  v_remaining := v_test.question_count - cardinality(v_selected);
  if v_remaining > 0 then
    select array_agg(id) into v_ids from (
      select id from unnest(v_pool_ids) as pool(id)
      where id <> all (v_selected)
      order by random() limit v_remaining
    ) s;
    v_selected := v_selected || coalesce(v_ids, '{}'::uuid[]);
  end if;

  select array_agg(id order by random()) into v_selected from unnest(v_selected) as selected(id);

  insert into public.user_attempts (user_id, test_id, question_ids, total, marks_per_correct, negative_marks)
  values (v_user, p_test_id, v_selected, v_test.question_count, v_test.marks_per_correct, v_test.negative_marks)
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

-- Questions for an attempt WITHOUT correct answers (client-safe).
create or replace function public.get_attempt_questions(p_attempt_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_attempt public.user_attempts%rowtype;
  v_result jsonb;
begin
  select * into v_attempt from public.user_attempts where id = p_attempt_id;
  if not found or (v_attempt.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'subject', q.subject,
      'question_text', q.question_text,
      'option_a', q.option_a,
      'option_b', q.option_b,
      'option_c', q.option_c,
      'option_d', q.option_d
    ) order by ord.idx
  ) into v_result
  from unnest(v_attempt.question_ids) with ordinality as ord(qid, idx)
  join public.questions q on q.id = ord.qid;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- Server-side grading. Never trusts client-supplied scores.
create or replace function public.submit_attempt(p_attempt_id uuid, p_answers jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_attempt public.user_attempts%rowtype;
  v_test public.tests%rowtype;
  v_answers jsonb := '{}'::jsonb;
  v_qid uuid;
  v_correct text;
  v_given text;
  v_correct_count int := 0;
  v_wrong_count int := 0;
  v_skipped_count int := 0;
begin
  select * into v_attempt from public.user_attempts where id = p_attempt_id for update;
  if auth.uid() is null or not found or v_attempt.user_id <> auth.uid() then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  -- idempotent: a second submit (e.g. timer race) returns the same attempt
  if v_attempt.status = 'submitted' then
    return v_attempt.id;
  end if;

  select * into v_test from public.tests where id = v_attempt.test_id;

  v_answers := coalesce(p_answers, '{}'::jsonb);
  -- Late submissions grade saved answers, using the same validation as a normal submit.
  if now() > v_attempt.started_at + make_interval(mins => v_test.duration_minutes + 2) then
    v_answers := v_attempt.answers;
  end if;
  if jsonb_typeof(v_answers) <> 'object' then
    v_answers := '{}'::jsonb;
  end if;
  select coalesce(jsonb_object_agg(qid::text, v_answers ->> qid::text), '{}'::jsonb)
  into v_answers
  from unnest(v_attempt.question_ids) as assigned(qid)
  where v_answers ->> qid::text in ('a', 'b', 'c', 'd');

  foreach v_qid in array v_attempt.question_ids
  loop
    select correct_answer into v_correct from public.questions where id = v_qid;
    v_given := v_answers ->> v_qid::text;
    if v_given is null then
      v_skipped_count := v_skipped_count + 1;
    elsif v_given = v_correct then
      v_correct_count := v_correct_count + 1;
    else
      v_wrong_count := v_wrong_count + 1;
    end if;
  end loop;

  update public.user_attempts
  set answers = v_answers,
      status = 'submitted',
      score = round(v_correct_count * v_attempt.marks_per_correct - v_wrong_count * v_attempt.negative_marks, 4),
      correct_count = v_correct_count,
      wrong_count = v_wrong_count,
      skipped_count = v_skipped_count,
      submitted_at = now()
  where id = p_attempt_id;

  return p_attempt_id;
end;
$$;

-- Full review incl. correct answers — only after submission.
create or replace function public.get_attempt_review(p_attempt_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_attempt public.user_attempts%rowtype;
  v_result jsonb;
begin
  select * into v_attempt from public.user_attempts where id = p_attempt_id;
  if not found or (v_attempt.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'ATTEMPT_NOT_SUBMITTED';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'subject', q.subject,
      'question_text', q.question_text,
      'option_a', q.option_a,
      'option_b', q.option_b,
      'option_c', q.option_c,
      'option_d', q.option_d,
      'correct_answer', q.correct_answer,
      'explanation', q.explanation,
      'user_answer', v_attempt.answers ->> q.id::text
    ) order by ord.idx
  ) into v_result
  from unnest(v_attempt.question_ids) with ordinality as ord(qid, idx)
  join public.questions q on q.id = ord.qid;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.import_questions(p_exam_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_inserted int;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_QUESTION_ROWS';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'INVALID_QUESTION_ROWS';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) as item(row)
    where jsonb_typeof(row) <> 'object'
      or exists (
        select 1 from unnest(array['subject','question_text','option_a','option_b','option_c','option_d','correct_answer']) as required(field)
        where jsonb_typeof(row -> field) is distinct from 'string' or btrim(row ->> field) = ''
      )
      or row ->> 'correct_answer' not in ('a','b','c','d')
  ) then
    raise exception 'INVALID_QUESTION_ROWS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_exam_id::text, 'shared-question-bank'), 1));
  with incoming as (
    select row, ord,
      md5(lower(btrim(regexp_replace(row ->> 'question_text', '\s+', ' ', 'g')))) as question_key
    from jsonb_array_elements(p_rows) with ordinality as item(row, ord)
  ), distinct_rows as (
    select distinct on (question_key) * from incoming order by question_key, ord
  )
  insert into public.questions (exam_id, subject, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation)
  select p_exam_id, btrim(row ->> 'subject'), btrim(row ->> 'question_text'),
    btrim(row ->> 'option_a'), btrim(row ->> 'option_b'), btrim(row ->> 'option_c'), btrim(row ->> 'option_d'),
    row ->> 'correct_answer', coalesce(row ->> 'explanation', '')
  from distinct_rows incoming
  where not exists (
    select 1 from public.questions q
    where q.exam_id is not distinct from p_exam_id and q.question_key = incoming.question_key
  );
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('inserted', v_inserted, 'duplicates', jsonb_array_length(p_rows) - v_inserted);
end;
$$;

create or replace function public.get_question_bank_stats()
returns table (exam_id uuid, total_count bigint, unique_count bigint)
language plpgsql security invoker set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  return query
    select q.exam_id, count(*), count(distinct q.question_key)
    from public.questions q group by q.exam_id;
end;
$$;

-- ---------- ROW LEVEL SECURITY ----------

alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.tests enable row level security;
alter table public.user_attempts enable row level security;
alter table public.plans enable row level security;
alter table public.user_plans enable row level security;
alter table public.payments enable row level security;

create policy profiles_select on public.profiles for select
  using (auth.uid() = id or public.is_admin());
create policy profiles_update on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create policy exams_select on public.exams for select
  using (is_active or public.is_admin());
create policy exams_admin_write on public.exams for insert
  with check (public.is_admin());
create policy exams_admin_update on public.exams for update
  using (public.is_admin());
create policy exams_admin_delete on public.exams for delete
  using (public.is_admin());

-- Regular users NEVER read questions directly (correct_answer lives here).
-- They only see client-safe data through the security-definer functions.
create policy questions_admin_all on public.questions for all
  using (public.is_admin()) with check (public.is_admin());

create policy tests_select on public.tests for select
  using (is_active or public.is_admin());
create policy tests_admin_insert on public.tests for insert
  with check (public.is_admin());
create policy tests_admin_update on public.tests for update
  using (public.is_admin());
create policy tests_admin_delete on public.tests for delete
  using (public.is_admin());

create policy attempts_select on public.user_attempts for select
  using (user_id = auth.uid() or public.is_admin());
create policy attempts_update_answers on public.user_attempts for update
  using (user_id = auth.uid() and status = 'in_progress')
  with check (user_id = auth.uid() and status = 'in_progress');

-- Attempts are created/graded only via RPC; users may only save answers in-flight.
revoke insert, update, delete on public.user_attempts from anon, authenticated;
grant update (answers) on public.user_attempts to authenticated;

create policy plans_select on public.plans for select
  using (is_active or public.is_admin());
create policy plans_admin_all on public.plans for all
  using (public.is_admin()) with check (public.is_admin());

create policy user_plans_select on public.user_plans for select
  using (user_id = auth.uid() or public.is_admin());

create policy payments_select on public.payments for select
  using (user_id = auth.uid() or public.is_admin());

-- ---------- FUNCTION GRANTS ----------

revoke execute on function public.start_attempt(uuid) from public, anon;
revoke execute on function public.get_attempt_questions(uuid) from public, anon;
revoke execute on function public.submit_attempt(uuid, jsonb) from public, anon;
revoke execute on function public.get_attempt_review(uuid) from public, anon;

grant execute on function public.start_attempt(uuid) to authenticated;
grant execute on function public.get_attempt_questions(uuid) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_attempt_review(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.import_questions(uuid, jsonb) from public, anon;
revoke execute on function public.get_question_bank_stats() from public, anon;
grant execute on function public.import_questions(uuid, jsonb) to authenticated;
grant execute on function public.get_question_bank_stats() to authenticated;

-- ---------- PAYMENT SECURITY ----------
alter table public.payment_settings enable row level security;
alter table public.payments enable row level security;
alter table public.user_plans enable row level security;
drop policy if exists payment_settings_select on public.payment_settings;
drop policy if exists payment_settings_admin_insert on public.payment_settings;
drop policy if exists payment_settings_admin_update on public.payment_settings;
create policy payment_settings_select on public.payment_settings for select to authenticated using (true);
create policy payment_settings_admin_insert on public.payment_settings for insert to authenticated
  with check (auth.uid() is not null and public.is_admin());
create policy payment_settings_admin_update on public.payment_settings for update to authenticated
  using (auth.uid() is not null and public.is_admin()) with check (auth.uid() is not null and public.is_admin());
revoke all on public.payment_settings from public, anon, authenticated;
grant select, insert, update on public.payment_settings to authenticated;

-- RLS determines reads, but nobody with a client JWT (including admins) can bypass review RPCs.
drop policy if exists payments_admin_all on public.payments;
drop policy if exists user_plans_admin_all on public.user_plans;
drop policy if exists payments_select on public.payments;
drop policy if exists user_plans_select on public.user_plans;
create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_plans_select on public.user_plans for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.payments, public.user_plans from public, anon, authenticated;
-- Table-level REVOKE does not remove pre-existing column grants.
do $$
declare r record;
begin
  for r in select table_name, string_agg(quote_ident(column_name), ', ') as columns
    from information_schema.columns where table_schema = 'public' and table_name in ('payments', 'user_plans')
    group by table_name
  loop
    execute format('revoke insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',
      r.columns, r.columns, r.columns, r.table_name);
  end loop;
end;
$$;
grant select on public.payments, public.user_plans to authenticated;
-- Existing plan RLS permits only admin mutations; these grants also support fresh projects.
grant select on public.plans to authenticated;
grant update (price, duration_days, is_active) on public.plans to authenticated;

revoke execute on function public.create_payment_request(uuid) from public, anon;
revoke execute on function public.submit_payment_utr(uuid, text) from public, anon;
revoke execute on function public.review_payment(uuid, text, text) from public, anon;
revoke execute on function public.has_test_access() from public, anon;
grant execute on function public.create_payment_request(uuid) to authenticated;
grant execute on function public.submit_payment_utr(uuid, text) to authenticated;
grant execute on function public.review_payment(uuid, text, text) to authenticated;
grant execute on function public.has_test_access() to authenticated;



-- ============================================================
-- Seed data: exams, tests, plans, shared question bank
-- Run AFTER schema.sql. Safe to run once on a fresh project.
-- ============================================================

-- ---------- EXAMS ----------
insert into public.exams (name, category, description) values
  ('NORCET (AIIMS)', 'central', 'Nursing Officer Recruitment Common Eligibility Test for AIIMS and central institutes.'),
  ('ESIC Staff Nurse', 'central', 'Employees State Insurance Corporation nursing recruitment exam.'),
  ('RRB Staff Nurse', 'central', 'Railway Recruitment Board staff nurse and health worker exam.'),
  ('MNS (Military Nursing)', 'central', 'Military Nursing Service entrance exam for armed forces hospitals.'),
  ('UP PSC Staff Nurse', 'state', 'Uttar Pradesh Public Service Commission staff nurse recruitment.'),
  ('Maharashtra Staff Nurse', 'state', 'Maharashtra state government staff nurse recruitment exam.'),
  ('Bihar Staff Nurse', 'state', 'Bihar BTSC staff nurse recruitment exam.'),
  ('Rajasthan Staff Nurse', 'state', 'Rajasthan state nursing officer recruitment exam.');

-- ---------- TESTS (4 categories per exam) ----------
do $$
declare
  e record;
begin
  for e in select id, name from public.exams loop
    insert into public.tests (exam_id, category, name, question_count, duration_minutes, subject_weights)
    values (e.id, 'full_mock', e.name || ' — Full Mock Test', 50, 60,
      '{"Fundamentals of Nursing":1,"Medical-Surgical Nursing":1,"Pharmacology":1,"Obstetrics & Gynaecology":1,"Child Health Nursing":1,"Community Health Nursing":1,"Mental Health Nursing":1,"Anatomy & Physiology":1}');
    insert into public.tests (exam_id, category, name, subject, question_count, duration_minutes)
    values (e.id, 'subject_test', 'Medical-Surgical Nursing — Subject Test', 'Medical-Surgical Nursing', 8, 12);
    insert into public.tests (exam_id, category, name, question_count, duration_minutes)
    values (e.id, 'daily_quiz', 'Daily Quiz — 10 Questions', 10, 15);
    insert into public.tests (exam_id, category, name, question_count, duration_minutes)
    values (e.id, 'pyq', 'Previous Year Questions Practice', 25, 30);
  end loop;
end $$;

-- ---------- PLANS ----------
insert into public.plans (name, price, duration_days, features) values
  ('Free Trial', 0, 7, '["All exams", "All test categories", "Answer review with explanations"]'),
  ('Monthly', 299, 30, '["All exams", "Unlimited attempts", "Answer review with explanations"]'),
  ('Quarterly', 699, 90, '["All exams", "Unlimited attempts", "Answer review with explanations", "Best value"]');

-- ---------- SHARED QUESTION BANK (exam_id null = available to all exams) ----------

insert into public.questions (subject, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation) values
-- Fundamentals of Nursing
('Fundamentals of Nursing', 'What is the normal respiratory rate for a healthy adult?', '8–12 breaths/min', '12–20 breaths/min', '20–30 breaths/min', '30–40 breaths/min', 'b', 'A healthy adult at rest breathes 12–20 times per minute. Rates above 20 (tachypnea) or below 12 (bradypnea) need assessment.'),
('Fundamentals of Nursing', 'The single most effective method to prevent transmission of infection is:', 'Hand hygiene', 'Wearing gloves at all times', 'Using antibiotics prophylactically', 'Isolating every patient', 'a', 'Hand hygiene (soap and water or alcohol-based rub) breaks the chain of infection and is the cornerstone of infection control.'),
('Fundamentals of Nursing', 'Normal oral body temperature in an adult is approximately:', '35°C', '36°C', '37°C', '38°C', 'c', 'Average normal oral temperature is about 37°C (98.6°F); axillary is ~0.5°C lower and rectal ~0.5°C higher.'),
('Fundamentals of Nursing', 'The best position for an unconscious patient to prevent aspiration is:', 'Supine', 'Lateral (recovery) position', 'Trendelenburg', 'Lithotomy', 'b', 'The lateral recovery position allows secretions and vomitus to drain from the mouth, protecting the airway.'),
('Fundamentals of Nursing', 'A bed cradle is used mainly to:', 'Support the patient''s back', 'Keep the bed warm', 'Prevent pressure of bedclothes on the feet', 'Restrict patient movement', 'c', 'A bed cradle holds bedclothes off the feet/legs, preventing pressure injuries and foot drop in bedridden patients.'),
('Fundamentals of Nursing', 'Assessment in the nursing process should be done:', 'Only at admission', 'Only when the doctor orders', 'Only at discharge', 'Continuously throughout patient care', 'd', 'Assessment is ongoing and continuous — every interaction with the patient is an opportunity to collect data.'),
('Fundamentals of Nursing', 'Standard autoclave sterilization temperature and pressure is:', '100°C at 10 psi', '121°C at 15 psi', '150°C at 20 psi', '200°C at 25 psi', 'b', 'Steam under pressure at 121°C, 15 psi for 15–20 minutes destroys all microorganisms including spores.'),
('Fundamentals of Nursing', 'In nursing documentation, "not documented" means:', 'Not done', 'Done but forgotten', 'Done partially', 'Not important', 'a', 'Legal principle: care not recorded is considered care not given. Documentation is the legal record of nursing care.'),

-- Medical-Surgical Nursing
('Medical-Surgical Nursing', 'The classic triad of symptoms in diabetes mellitus is:', 'Polyuria, polydipsia, polyphagia', 'Fever, chills, sweats', 'Cough, cold, coryza', 'Pain, pallor, pulselessness', 'a', 'Hyperglycemia causes osmotic diuresis (polyuria), thirst (polydipsia) and hunger with weight loss (polyphagia).'),
('Medical-Surgical Nursing', 'The most common type of stroke is:', 'Hemorrhagic', 'Ischemic', 'Subarachnoid', 'Transient ischemic attack', 'b', 'About 85% of strokes are ischemic, caused by thrombotic or embolic occlusion of a cerebral artery.'),
('Medical-Surgical Nursing', 'COPD primarily includes:', 'Asthma and pneumonia', 'TB and bronchiectasis', 'Chronic bronchitis and emphysema', 'Lung cancer and fibrosis', 'c', 'Chronic obstructive pulmonary disease is characterized by chronic bronchitis (airway inflammation) and emphysema (alveolar destruction).'),
('Medical-Surgical Nursing', 'The most comfortable position for a patient with severe dyspnea is:', 'Fowler''s position', 'Supine', 'Prone', 'Trendelenburg', 'a', 'Sitting upright (Fowler''s 45–90°) allows maximum chest expansion and diaphragmatic descent, easing breathing.'),
('Medical-Surgical Nursing', 'The hallmark feature of nephrotic syndrome is:', 'Hematuria', 'Hypertension', 'Oliguria', 'Massive proteinuria (>3.5 g/day)', 'd', 'Nephrotic syndrome = massive proteinuria, hypoalbuminemia, edema and hyperlipidemia due to glomerular damage.'),
('Medical-Surgical Nursing', 'The most common cause of peptic ulcer disease is:', 'Stress', 'Helicobacter pylori infection', 'Spicy food', 'Excess exercise', 'b', 'H. pylori infection and NSAID use account for the vast majority of peptic ulcers.'),
('Medical-Surgical Nursing', 'The characteristic ECG change in hyperkalemia is:', 'ST depression', 'Prolonged QT', 'Tall, peaked T waves', 'U waves', 'c', 'Rising potassium shortens repolarization producing tall tented T waves; severe cases widen QRS and can cause cardiac arrest.'),
('Medical-Surgical Nursing', 'The priority intervention in hypovolemic shock is:', 'IV fluid resuscitation', 'Administering antibiotics', 'Giving oxygen only', 'Elevating the head', 'a', 'Restoring circulating volume with crystalloids (and blood when indicated) is the first priority to maintain tissue perfusion.'),

-- Pharmacology
('Pharmacology', 'The antidote for paracetamol (acetaminophen) overdose is:', 'Atropine', 'N-acetylcysteine', 'Naloxone', 'Flumazenil', 'b', 'N-acetylcysteine replenishes glutathione and prevents hepatotoxicity; most effective within 8 hours of ingestion.'),
('Pharmacology', 'The first-line drug for anaphylactic shock is:', 'Adrenaline (epinephrine)', 'Dexamethasone', 'Diphenhydramine', 'Salbutamol', 'a', 'IM adrenaline 0.5 mg (1:1000) is the immediate life-saving treatment — it reverses vasodilation and bronchospasm.'),
('Pharmacology', 'Warfarin therapy is monitored using:', 'aPTT', 'Bleeding time', 'PT/INR', 'Platelet count', 'c', 'Warfarin affects the extrinsic pathway; PT expressed as INR (target usually 2–3) guides dosing.'),
('Pharmacology', 'The antidote for heparin overdose is:', 'Vitamin K', 'Tranexamic acid', 'Fresh frozen plasma', 'Protamine sulfate', 'd', 'Protamine sulfate binds and neutralizes heparin; 1 mg protamine neutralizes ~100 units of heparin.'),
('Pharmacology', 'A common side effect of ACE inhibitors (e.g., enalapril) is:', 'Diarrhea', 'Dry persistent cough', 'Hair loss', 'Hypoglycemia', 'b', 'ACE inhibitors increase bradykinin in the lungs, causing a dry cough in up to 20% of patients.'),
('Pharmacology', 'Unopened insulin vials should be stored:', 'Refrigerated at 2–8°C', 'In direct sunlight', 'Frozen at −20°C', 'At room temperature for months', 'a', 'Insulin is a protein; unopened vials stay potent refrigerated (2–8°C). Never freeze insulin.'),
('Pharmacology', 'Which antibiotic is well known for ototoxicity and nephrotoxicity?', 'Penicillin', 'Amoxicillin', 'Gentamicin', 'Azithromycin', 'c', 'Aminoglycosides like gentamicin can damage the 8th cranial nerve and kidneys; monitor levels, renal function and hearing.'),
('Pharmacology', 'Before administering digoxin, the nurse must check:', 'Blood pressure', 'Apical pulse for one full minute', 'Respiratory rate', 'Temperature', 'b', 'Hold digoxin and inform the physician if apical pulse is below 60/min in adults — risk of bradycardia and toxicity.'),

-- Obstetrics & Gynaecology
('Obstetrics & Gynaecology', 'The normal fetal heart rate range is:', '60–100 bpm', '80–120 bpm', '110–160 bpm', '160–200 bpm', 'c', 'Normal baseline FHR is 110–160 bpm. Below 110 = bradycardia, above 160 = tachycardia; both need evaluation.'),
('Obstetrics & Gynaecology', 'Pregnancy tests detect which hormone?', 'hCG', 'Progesterone', 'Estrogen', 'FSH', 'a', 'Home pregnancy tests detect human chorionic gonadotropin produced by the placenta after implantation.'),
('Obstetrics & Gynaecology', 'The average duration of pregnancy from LMP is:', '240 days', '280 days', '320 days', '360 days', 'b', 'Naegele''s rule: 280 days (40 weeks) from the first day of the last menstrual period.'),
('Obstetrics & Gynaecology', 'The drug of choice for controlling eclamptic seizures is:', 'Diazepam', 'Phenytoin', 'Phenobarbitone', 'Magnesium sulfate', 'd', 'MgSO4 (Pritchard/Zuspan regimen) is superior to other anticonvulsants for preventing and controlling eclamptic fits.'),
('Obstetrics & Gynaecology', 'Normal implantation of the fertilized ovum occurs in the:', 'Endometrium of the uterus', 'Fallopian tube', 'Ovary', 'Cervix', 'a', 'Implantation normally occurs in the upper uterine endometrium (usually posterior fundal wall) 6–7 days after fertilization.'),
('Obstetrics & Gynaecology', 'The first perception of fetal movement by the mother is called:', 'Lightening', 'Quickening', 'Engagement', 'Braxton Hicks', 'b', 'Quickening is felt around 18–20 weeks in primigravida and 16–18 weeks in multigravida.'),
('Obstetrics & Gynaecology', 'Lochia rubra (red discharge) normally lasts for:', '24 hours', '1 week', '3–4 days', '2 weeks', 'c', 'Lochia rubra lasts 3–4 days, followed by lochia serosa (up to ~10 days) and lochia alba (up to 2–3 weeks).'),
('Obstetrics & Gynaecology', 'The antidote for magnesium sulfate toxicity is:', 'Calcium gluconate', 'Sodium bicarbonate', 'Potassium chloride', 'Atropine', 'a', '10 mL of 10% calcium gluconate IV antagonizes magnesium. Monitor reflexes, respiration (>16/min) and urine output during MgSO4 therapy.'),

-- Child Health Nursing
('Child Health Nursing', 'Vaccines given at birth under the Indian Universal Immunization Programme include:', 'BCG only', 'OPV only', 'Hepatitis B only', 'BCG, OPV-0 and Hepatitis B birth dose', 'd', 'At birth: BCG (TB), OPV zero dose (polio) and Hepatitis B birth dose are given.'),
('Child Health Nursing', 'Complementary feeding should be introduced at the age of:', '4 months', '6 months', '9 months', '12 months', 'b', 'WHO recommends exclusive breastfeeding for 6 months, then adequate complementary feeding with continued breastfeeding.'),
('Child Health Nursing', 'The anterior fontanelle normally closes by:', '2–3 months', '6–8 months', '12–18 months', '3 years', 'c', 'Anterior fontanelle closes at 12–18 months; posterior fontanelle closes by 2–3 months.'),
('Child Health Nursing', 'A sign of severe dehydration in an infant is:', 'Sunken anterior fontanelle', 'Bulging fontanelle', 'Excess tears', 'Weight gain', 'a', 'Sunken fontanelle, sunken eyes, poor skin turgor and lethargy indicate significant dehydration.'),
('Child Health Nursing', 'ORS (Oral Rehydration Solution) is mainly used to treat:', 'Fever', 'Dehydration due to diarrhea', 'Cough', 'Malnutrition only', 'b', 'Low-osmolarity ORS replaces water and electrolytes lost in diarrhea; it is the cornerstone of diarrheal management.'),
('Child Health Nursing', 'The average normal birth weight of a full-term newborn is:', '1.0–1.5 kg', '1.5–2.0 kg', '2.5–3.5 kg', '4.5–5.0 kg', 'c', 'Normal birth weight is 2.5–3.5 kg; below 2.5 kg is low birth weight.'),
('Child Health Nursing', 'Vitamin K is given to newborns to prevent:', 'Rickets', 'Scurvy', 'Night blindness', 'Hemorrhagic disease of the newborn', 'd', 'Newborns have sterile guts and low vitamin K stores; a single IM dose (1 mg) prevents vitamin K deficiency bleeding.'),
('Child Health Nursing', 'Koplik''s spots are a characteristic sign of:', 'Measles', 'Chickenpox', 'Mumps', 'Rubella', 'a', 'Koplik''s spots — small white spots on the buccal mucosa — appear 1–2 days before the measles rash.'),

-- Community Health Nursing
('Community Health Nursing', 'Health promotion and specific protection belong to which level of prevention?', 'Primary prevention', 'Secondary prevention', 'Tertiary prevention', 'Primordial prevention', 'a', 'Primary prevention acts before disease occurs: health promotion (nutrition, sanitation) and specific protection (immunization).'),
('Community Health Nursing', 'Malaria is transmitted by:', 'Male Anopheles mosquito', 'Female Anopheles mosquito', 'Aedes mosquito', 'Culex mosquito', 'b', 'Only the female Anopheles mosquito transmits Plasmodium; Aedes spreads dengue/chikungunya, Culex spreads filariasis.'),
('Community Health Nursing', 'ASHA stands for:', 'Allied Social Health Assistant', 'Accredited Society for Health Aid', 'Accredited Social Health Activist', 'Association of State Health Agencies', 'c', 'ASHA is a community health worker under NHM, one per ~1000 population, linking the community with the health system.'),
('Community Health Nursing', 'Incidence refers to:', 'Total existing cases at a point in time', 'Total deaths in a population', 'Existing cases over a year', 'Number of NEW cases in a defined period', 'd', 'Incidence counts new cases in a population over a time period; prevalence counts all existing cases.'),
('Community Health Nursing', 'Vaccines in the cold chain at the health facility are stored at:', '+2°C to +8°C', '−20°C', '0°C exactly', 'Room temperature', 'a', 'Most vaccines (OPV, DPT, HepB, measles after reconstitution) are kept at +2 to +8°C; OPV long-term storage is at −20°C.'),
('Community Health Nursing', 'India''s national programme for tuberculosis control is now called:', 'NVBDCP', 'NTEP', 'NACP', 'RMNCH+A', 'b', 'The National TB Elimination Programme (NTEP), formerly RNTCP, targets TB elimination with free diagnosis and DOTS treatment.'),
('Community Health Nursing', 'Herd immunity is achieved mainly through:', 'Isolation of cases', 'Vector control', 'High vaccination coverage', 'Antibiotic prophylaxis', 'c', 'When a large proportion of the population is immune (usually via vaccination), disease spread is interrupted, protecting the vulnerable.'),
('Community Health Nursing', 'Human anatomical biomedical waste is discarded in which color bag?', 'Red', 'Blue', 'Black', 'Yellow', 'd', 'Yellow bag: anatomical waste, soiled waste, expired medicines — sent for incineration/deep burial. Red: recyclable plastics; Blue: glass/metallic implants.'),

-- Mental Health Nursing
('Mental Health Nursing', 'Perception without any external stimulus is called:', 'Hallucination', 'Illusion', 'Delusion', 'Obsession', 'a', 'Hallucination is a false perception (e.g., hearing voices) without an external stimulus; illusion is misinterpretation of a real stimulus.'),
('Mental Health Nursing', 'The main class of drugs used to treat schizophrenia is:', 'Antidepressants', 'Antipsychotics', 'Anxiolytics', 'Mood stabilizers', 'b', 'Antipsychotics (e.g., haloperidol, risperidone, olanzapine) reduce positive symptoms like delusions and hallucinations.'),
('Mental Health Nursing', 'Attributing one''s own unacceptable feelings to another person is the defense mechanism called:', 'Denial', 'Regression', 'Projection', 'Sublimation', 'c', 'Projection: "I''m not angry, YOU are angry" — the person attributes their own impulses to someone else.'),
('Mental Health Nursing', 'Lithium carbonate is the classic mood stabilizer used for:', 'Schizophrenia', 'Anxiety disorder', 'Depression only', 'Bipolar disorder (mania)', 'd', 'Lithium controls manic episodes and prevents relapse in bipolar disorder; monitor serum levels (0.6–1.2 mEq/L).'),
('Mental Health Nursing', 'The most important nursing intervention for a suicidal patient is:', 'Constant observation and a safe environment', 'Giving sedatives', 'Encouraging solitude', 'Ignoring the statements', 'a', 'Safety first: one-to-one observation, removal of harmful objects and a therapeutic relationship reduce suicide risk.'),
('Mental Health Nursing', 'A fixed false belief not amenable to reasoning is called:', 'Hallucination', 'Delusion', 'Phobia', 'Compulsion', 'b', 'Delusions are fixed false beliefs held despite evidence — e.g., delusion of persecution or grandeur.'),
('Mental Health Nursing', 'ECT (electroconvulsive therapy) is most commonly indicated in:', 'Mild anxiety', 'Personality disorder', 'Severe depression with suicide risk', 'Common cold', 'c', 'ECT gives rapid response in severe depression, catatonia and high suicide risk when drugs are too slow or ineffective.'),
('Mental Health Nursing', 'Repeating the patient''s main idea in the nurse''s own words is the therapeutic technique of:', 'Giving advice', 'Challenging', 'Agreeing', 'Restating/reflecting', 'd', 'Restating and reflecting encourage the patient to continue and show the nurse is listening; advice-giving and challenging are non-therapeutic.'),

-- Anatomy & Physiology
('Anatomy & Physiology', 'The "powerhouse of the cell" is:', 'Mitochondria', 'Nucleus', 'Ribosome', 'Golgi body', 'a', 'Mitochondria produce ATP through oxidative phosphorylation — the cell''s main energy currency.'),
('Anatomy & Physiology', 'Normal hemoglobin in an adult male is approximately:', '8–10 g/dL', '13–17 g/dL', '18–22 g/dL', '5–7 g/dL', 'b', 'Adult males: 13–17 g/dL; adult females: 12–15 g/dL. Lower values indicate anemia.'),
('Anatomy & Physiology', 'The largest organ of the human body is:', 'Liver', 'Brain', 'Skin', 'Lungs', 'c', 'Skin is the largest organ (~16% of body weight); liver is the largest internal organ.'),
('Anatomy & Physiology', 'The human heart has how many chambers?', '2', '3', '5', '4', 'd', 'Two atria receive blood; two ventricles pump it out — right side to lungs, left side to the body.'),
('Anatomy & Physiology', 'The structural and functional unit of the kidney is:', 'Nephron', 'Neuron', 'Alveolus', 'Hepatocyte', 'a', 'Each kidney has ~1 million nephrons that filter blood and form urine.'),
('Anatomy & Physiology', 'The universal donor blood group is:', 'AB positive', 'O negative', 'A positive', 'B negative', 'b', 'O negative red cells have no A, B or Rh antigens, so they can be given to any recipient in emergencies.'),
('Anatomy & Physiology', 'The longest bone in the human body is:', 'Humerus', 'Tibia', 'Femur', 'Fibula', 'c', 'The femur (thigh bone) is the longest and strongest bone, about 26% of body height.'),
('Anatomy & Physiology', 'The "master gland" of the endocrine system is:', 'Thyroid', 'Adrenal', 'Pancreas', 'Pituitary', 'd', 'The pituitary secretes hormones (TSH, ACTH, GH, FSH/LH) that control most other endocrine glands.');

-- ---------- BACKFILL PROFILES FOR USERS REGISTERED BEFORE SCHEMA ----------
insert into public.profiles (id, full_name, email, course)
select id,
       coalesce(raw_user_meta_data ->> 'full_name', ''),
       coalesce(email, ''),
       coalesce(raw_user_meta_data ->> 'course', 'BSc')
from auth.users
on conflict (id) do nothing;

-- ---------- MAKE YOURSELF ADMIN ----------
update public.profiles set role = 'admin' where email = 'rajputdipakvinodbhai@gmail.com';