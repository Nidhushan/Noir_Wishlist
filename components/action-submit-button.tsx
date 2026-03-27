"use client";

import { useFormStatus } from "react-dom";

interface ActionSubmitButtonProps {
  idleLabel: string;
  pendingLabel: string;
  className: string;
}

export function ActionSubmitButton({
  idleLabel,
  pendingLabel,
  className,
}: ActionSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
