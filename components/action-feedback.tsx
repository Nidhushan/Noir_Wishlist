"use client";

interface ActionFeedbackProps {
  success: boolean;
  message: string;
  compact?: boolean;
}

export function ActionFeedback({
  success,
  message,
  compact = false,
}: ActionFeedbackProps) {
  return (
    <p className={compact ? `actionFeedback compact ${success ? "success" : "error"}` : `actionFeedback ${success ? "success" : "error"}`}>
      {message}
    </p>
  );
}
