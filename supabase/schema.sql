-- today / supabase schema
-- Run this once in the Supabase SQL editor after creating the project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 180),
  task_date date not null,
  task_time time,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_date_idx
  on public.tasks (user_id, task_date, is_done, task_time);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- A profile is created automatically after Supabase Auth creates auth.users.
-- The client sends username and username_key in user metadata during sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  supplied_username text;
  supplied_username_key text;
begin
  supplied_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  supplied_username_key := nullif(trim(new.raw_user_meta_data ->> 'username_key'), '');

  if supplied_username is null or supplied_username_key is null then
    raise exception 'username metadata is required';
  end if;

  insert into public.profiles (id, username, username_key)
  values (new.id, supplied_username, lower(supplied_username_key));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

-- A user can read only their own profile.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

-- Usernames stay immutable in the first production version.
-- A controlled rename can be added later through a security-definer RPC.

-- A user can read only their own tasks.
drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
on public.tasks
for select
to authenticated
using ((select auth.uid()) = user_id);

-- A user can insert tasks only for themselves.
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
on public.tasks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- A user can update only their own tasks and cannot move them to another user.
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own
on public.tasks
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- A user can delete only their own tasks.
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own
on public.tasks
for delete
to authenticated
using ((select auth.uid()) = user_id);
