"use client";

import { cloneElement, isValidElement, useId, type ReactNode } from "react";

/**
 * Table primitives for the admin console. Plain wrappers over real table
 * elements — the semantics (caption, scope, th) are what make these usable with
 * a screen reader, so nothing here replaces them with divs.
 */

export function TableCard({
  caption,
  head,
  children,
}: {
  caption: string;
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-600"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">{children}</tbody>
      </table>
    </div>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    good: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-900",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  onClick,
  tone = "neutral",
  disabled,
  type = "button",
  children,
}: {
  onClick?: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  const tones = {
    neutral:
      "border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40",
    primary:
      "bg-accent text-white hover:bg-accent/90 disabled:opacity-40",
    danger:
      "border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-500">
        {text}
      </td>
    </tr>
  );
}

/**
 * Labelled field wrapper used by the console's forms.
 *
 * The hint is wired to the control with aria-describedby, not just placed near
 * it — "At least 8 characters" is useless to a screen-reader user if they only
 * hear it after the form has already rejected them.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const hintId = useId();
  const control =
    hint && isValidElement(children)
      ? cloneElement(
          children as React.ReactElement<{ "aria-describedby"?: string }>,
          { "aria-describedby": hintId },
        )
      : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
