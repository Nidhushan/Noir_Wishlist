alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username)
  where username is not null;

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (username is null or username ~ '^[a-z0-9_]{3,10}$');
