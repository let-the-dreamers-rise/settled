"use client";

import { useState } from "react";

/** Truncated in the middle visually; full value in `title`, on focus, and copied by the button. */
export function Hash({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="hash">
      <code className="mono" title={value} tabIndex={0} aria-label={`${label}: ${value}`}>{value}</code>
      <button
        className="copy"
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => setCopied(true), () => setCopied(false));
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
