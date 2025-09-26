create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references budgets(id) on delete cascade,
  tier text not null default 'free',
  model text not null,
  prompt jsonb not null,
  insights jsonb not null,
  raw_response text not null,
  usage jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_insights_user_id_idx on ai_insights(user_id);
create index if not exists ai_insights_budget_id_idx on ai_insights(budget_id);
create index if not exists ai_insights_created_at_idx on ai_insights(created_at desc);

alter table ai_insights enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where polname = 'Users can view own AI insights'
  ) then
    create policy "Users can view own AI insights" on ai_insights
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where polname = 'Users can insert AI insights'
  ) then
    create policy "Users can insert AI insights" on ai_insights
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where polname = 'Users can delete own AI insights'
  ) then
    create policy "Users can delete own AI insights" on ai_insights
      for delete
      using (auth.uid() = user_id);
  end if;
end;
$$;
