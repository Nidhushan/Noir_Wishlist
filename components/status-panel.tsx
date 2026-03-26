interface StatusPanelProps {
  title: string;
  message: string;
  tone?: "default" | "error";
}

export function StatusPanel({
  title,
  message,
  tone = "default",
}: StatusPanelProps) {
  return (
    <section className={tone === "error" ? "statusPanel error" : "statusPanel"}>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}
