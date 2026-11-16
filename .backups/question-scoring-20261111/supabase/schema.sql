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
  score int not null default 0,
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

create index questions_exam_idx on public.questions(exam_id);
create index questions_subject_idx on public.questions(subject);
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

-- Users must not be able to promote themselves to admin.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and not public.is_admin() then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger profile_role_guard
before update on public.profiles
for each row execute function public.protect_profile_role();

-- ---------- QUESTION ENGINE ----------

-- Starts an attempt: random selection with subject weightage,
-- excluding the user's 100 most recently answered questions.
-- Raises INSUFFICIENT_POOL (mapped to HTTP 400) when not enough questions.
create or replace function public.start_attempt(p_test_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_test public.tests%rowtype;
  v_recent uuid[];
  v_selected uuid[] := '{}'::uuid[];
  v_ids uuid[];
  v_take int;
  v_remaining int;
  v_total_weight numeric;
  v_attempt_id uuid;
  v_pool_count int;
  r record;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_test from public.tests where id = p_test_id and is_active;
  if not found then
    raise exception 'TEST_NOT_FOUND';
  end if;

  if not exists (select 1 from public.exams where id = v_test.exam_id and is_active) then
    raise exception 'TEST_NOT_FOUND';
  end if;

  -- 100 most recently answered question ids for this user
  select coalesce(array_agg(qid), '{}'::uuid[]) into v_recent
  from (
    select (k.qid)::uuid as qid, max(a.started_at) as last_seen
    from public.user_attempts a
    cross join lateral jsonb_object_keys(a.answers) as k(qid)
    where a.user_id = v_user
    group by k.qid
    order by last_seen desc
    limit 100
  ) t;

  create temp table if not exists _pool (id uuid, subject text) on commit drop;
  delete from _pool where true;
  insert into _pool
  select q.id, q.subject
  from public.questions q
  where (q.exam_id = v_test.exam_id or q.exam_id is null)
    and q.id <> all (v_recent)
    and (v_test.subject is null or q.subject = v_test.subject);

  select count(*) into v_pool_count from _pool;
  if v_pool_count < v_test.question_count then
    raise exception 'INSUFFICIENT_POOL';
  end if;

  if v_test.subject_weights is not null
     and jsonb_typeof(v_test.subject_weights) = 'object'
     and (select count(*) from jsonb_object_keys(v_test.subject_weights)) > 0 then

    select sum(value::numeric) into v_total_weight
    from jsonb_each_text(v_test.subject_weights);

    for r in select key as subject, value::numeric as weight
             from jsonb_each_text(v_test.subject_weights)
             order by key
    loop
      v_remaining := v_test.question_count - coalesce(array_length(v_selected, 1), 0);
      exit when v_remaining <= 0;
      v_take := least(v_remaining, greatest(1, round(v_test.question_count * r.weight / v_total_weight)::int));
      select array_agg(id) into v_ids
      from (
        select id from _pool
        where subject = r.subject and id <> all (v_selected)
        order by random() limit v_take
      ) s;
      if v_ids is not null then
        v_selected := v_selected || v_ids;
      end if;
    end loop;
  end if;

  -- top up randomly if weightage left slots empty
  v_remaining := v_test.question_count - coalesce(array_length(v_selected, 1), 0);
  if v_remaining > 0 then
    select array_agg(id) into v_ids
    from (
      select id from _pool where id <> all (v_selected)
      order by random() limit v_remaining
    ) s;
    if v_ids is not null then
      v_selected := v_selected || v_ids;
    end if;
  end if;

  if coalesce(array_length(v_selected, 1), 0) < v_test.question_count then
    raise exception 'INSUFFICIENT_POOL';
  end if;

  insert into public.user_attempts (user_id, test_id, question_ids, total)
  values (v_user, p_test_id, v_selected, v_test.question_count)
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
  k text;
  v text;
begin
  select * into v_attempt from public.user_attempts where id = p_attempt_id for update;
  if not found or v_attempt.user_id <> auth.uid() then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  -- idempotent: a second submit (e.g. timer race) returns the same attempt
  if v_attempt.status = 'submitted' then
    return v_attempt.id;
  end if;

  select * into v_test from public.tests where id = v_attempt.test_id;

  -- keep only valid keys/values
  if p_answers is not null and jsonb_typeof(p_answers) = 'object' then
    for k, v in select * from jsonb_each_text(p_answers)
    loop
      if v in ('a', 'b', 'c', 'd') and k::uuid = any (v_attempt.question_ids) then
        v_answers := v_answers || jsonb_build_object(k, v);
      end if;
    end loop;
  end if;

  -- late submissions (past duration + 2 min grace) grade the saved answers
  if now() > v_attempt.started_at + make_interval(mins => v_test.duration_minutes + 2) then
    v_answers := v_attempt.answers;
  end if;

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
      score = v_correct_count,
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
create policy user_plans_admin_all on public.user_plans for all
  using (public.is_admin()) with check (public.is_admin());

create policy payments_select on public.payments for select
  using (user_id = auth.uid() or public.is_admin());
create policy payments_admin_all on public.payments for all
  using (public.is_admin()) with check (public.is_admin());

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