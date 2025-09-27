set check_function_bodies = off;

create or replace function public.get_cash_burn(p_user_id uuid)
returns table (
  burn_per_day numeric,
  burn_per_week numeric,
  burn_per_month numeric,
  days_left integer,
  projection_date date,
  status text,
  badge_label text,
  sample_start date,
  sample_end date,
  total_expense numeric,
  safe_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_start date;
  recent_end date;
  recent_total numeric;
  fallback_start date;
  fallback_end date;
  fallback_total numeric;
  span_days integer;
  total_income numeric;
  total_expense_all numeric;
begin
  select
    min(t.date)::date as start_date,
    max(t.date)::date as end_date,
    coalesce(sum(t.amount), 0) as total_amount
  into recent_start, recent_end, recent_total
  from transactions t
    join budgets b on b.id = t.budget_id
  where b.user_id = p_user_id
    and t.type = 'expense'
    and t.date >= (current_date - interval '30 days');

  if recent_end is null then
    select
      min(t.date)::date as start_date,
      max(t.date)::date as end_date,
      coalesce(sum(t.amount), 0) as total_amount
    into fallback_start, fallback_end, fallback_total
    from transactions t
      join budgets b on b.id = t.budget_id
    where b.user_id = p_user_id
      and t.type = 'expense';

    if fallback_end is null then
      burn_per_day := 0;
      burn_per_week := 0;
      burn_per_month := 0;
      days_left := null;
      projection_date := null;
      status := 'safe';
      badge_label := 'Safe Zone';
      sample_start := null;
      sample_end := null;
      total_expense := 0;
      safe_balance := 0;
      return next;
      return;
    end if;

    recent_start := fallback_start;
    recent_end := fallback_end;
    recent_total := fallback_total;
  end if;

  span_days := greatest(1, (recent_end - recent_start) + 1);
  burn_per_day := recent_total / span_days;
  burn_per_week := burn_per_day * 7;
  burn_per_month := burn_per_day * 30;
  sample_start := recent_start;
  sample_end := recent_end;
  total_expense := recent_total;

  select
    coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0),
    coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0)
  into total_income, total_expense_all
  from transactions t
    join budgets b on b.id = t.budget_id
  where b.user_id = p_user_id;

  safe_balance := greatest(0, total_income - total_expense_all);

  if burn_per_day > 0 then
    days_left := floor(safe_balance / burn_per_day);
    projection_date := current_date + days_left;
  else
    days_left := null;
    projection_date := null;
  end if;

  if days_left is not null and days_left < 15 then
    status := 'critical';
    badge_label := 'Critical Burn';
  else
    status := 'safe';
    badge_label := 'Safe Zone';
  end if;

  return next;
end;
$$;

do $$
begin
  begin
    execute 'grant execute on function public.get_cash_burn(uuid) to authenticated';
    execute 'grant execute on function public.get_cash_burn(uuid) to service_role';
    execute 'grant execute on function public.get_cash_burn(uuid) to anon';
  exception
    when others then
      null;
  end;
end;
$$;
