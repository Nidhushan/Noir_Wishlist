interface SetupNoticeProps {
  title?: string;
  message?: string;
}

export function SetupNotice({
  title = "Supabase setup required",
  message = "Add your Supabase URL, anon key, and service role key to start auth, persistence, and profile features.",
}: SetupNoticeProps) {
  return (
    <section className="statusPanel">
      <p className="eyebrow">Setup</p>
      <h2>{title}</h2>
      <p>{message}</p>
      <code className="inlineCodeBlock">
        NEXT_PUBLIC_SUPABASE_URL
        <br />
        NEXT_PUBLIC_SUPABASE_ANON_KEY
        <br />
        SUPABASE_SERVICE_ROLE_KEY
      </code>
    </section>
  );
}
