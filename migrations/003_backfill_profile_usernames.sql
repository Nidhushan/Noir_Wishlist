do $$
declare
  profile_row record;
  base_username text;
  candidate text;
  suffix integer;
  suffix_text text;
begin
  for profile_row in
    select id, email, display_name, username
    from public.profiles
    order by created_at, id
  loop
    if profile_row.username is null then
      base_username := lower(
        coalesce(
          nullif(profile_row.display_name, ''),
          nullif(split_part(coalesce(profile_row.email, ''), '@', 1), ''),
          'user'
        )
      );

      base_username := regexp_replace(base_username, '[^a-z0-9_]+', '_', 'g');
      base_username := regexp_replace(base_username, '_{2,}', '_', 'g');
      base_username := regexp_replace(base_username, '^_+|_+$', '', 'g');

      if base_username = '' then
        base_username := 'user';
      end if;

      if length(base_username) < 3 then
        base_username := base_username || substring(replace(profile_row.id::text, '-', '') from 1 for 3 - length(base_username));
      end if;

      base_username := left(base_username, 10);
      candidate := base_username;
      suffix := 1;

      while exists (
        select 1
        from public.profiles p
        where p.username = candidate
          and p.id <> profile_row.id
      ) loop
        suffix := suffix + 1;
        suffix_text := suffix::text;
        candidate := left(base_username, greatest(1, 10 - length(suffix_text))) || suffix_text;
      end loop;

      update public.profiles
      set username = candidate
      where id = profile_row.id;
    end if;
  end loop;
end $$;

update public.profiles
set display_name = username
where (display_name is null or display_name = email)
  and username is not null;
