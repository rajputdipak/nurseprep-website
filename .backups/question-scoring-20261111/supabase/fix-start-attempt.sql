-- ============================================================
-- HOTFIX: start_attempt — "DELETE requires a WHERE clause"
-- Run this ONCE in Supabase SQL Editor (safe to re-run).
-- It replaces only public.start_attempt; no data is touched.
-- ============================================================

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