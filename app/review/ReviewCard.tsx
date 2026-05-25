"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { gradeCard, skipAction } from "./actions";

interface Props {
  card: {
    id: string;
    intervalDays: number;
    reps: number;
    problem: {
      title: string;
      source: string;
      url: string | null;
      prompt: string;
      approach: string;
      tags: string[];
    };
  };
  force?: boolean;
  ahead?: number;
}

// Grade buttons: numeral-first identity, quiet cool→warm temperature gradient.
const BUTTONS = [
  { grade: 0, key: "1", label: "Again", hint: "lapse",  v: "1" },
  { grade: 1, key: "2", label: "Hard",  hint: "soon",   v: "2" },
  { grade: 2, key: "3", label: "Good",  hint: "steady", v: "3" },
  { grade: 3, key: "4", label: "Easy",  hint: "longer", v: "4" },
] as const;

const HINTS_KEY = "shortcut-hints-seen";
const HINT_SESSIONS = 3;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function ReviewCard({ card }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [showHints, setShowHints] = useState(false);
  const hintsBumped = useRef(false);

  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(HINTS_KEY) ?? "0");
      setShowHints(n < HINT_SESSIONS);
      if (!hintsBumped.current) {
        localStorage.setItem(HINTS_KEY, String(n + 1));
        hintsBumped.current = true;
      }
    } catch {
      setShowHints(true);
    }
  }, []);

  const grade = (g: 0 | 1 | 2 | 3) => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    fd.set("grade", String(g));
    startTransition(async () => {
      await gradeCard(fd);
      setRevealed(false);
    });
  };

  const skip = () => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    startTransition(async () => {
      await skipAction(fd);
      setRevealed(false);
    });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const k = e.key;

      if (k === " " || k === "Spacebar") {
        if (!revealed) {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (k === "s" || k === "S") {
        e.preventDefault();
        if (!pending) skip();
        return;
      }
      if (revealed && (k === "1" || k === "2" || k === "3" || k === "4")) {
        e.preventDefault();
        const g = (Number(k) - 1) as 0 | 1 | 2 | 3;
        if (!pending) grade(g);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, pending]);

  return (
    <article className="space-y-6 sm:space-y-8">
      {/* Card panel */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-border space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="label">{card.problem.source}</span>
            {card.problem.tags.length > 0 && (
              <>
                <span className="label text-fg-4">·</span>
                <span className="text-xs text-fg-3 truncate">
                  {card.problem.tags.join(", ")}
                </span>
              </>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
            {card.problem.title}
          </h1>
        </div>

        {/* Prompt */}
        <div className="px-4 sm:px-6 py-5 sm:py-6 space-y-4">
          <p className="text-base sm:text-[17px] leading-[1.65] text-fg whitespace-pre-wrap">
            {card.problem.prompt}
          </p>
          {card.problem.url && (
            <a
              href={card.problem.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-accent transition-colors"
            >
              <span>Open on source</span>
              <span aria-hidden>↗</span>
            </a>
          )}
        </div>

        {/* Approach (revealed) */}
        {revealed && (
          <div className="lift-in px-4 sm:px-6 py-5 sm:py-6 border-t border-border bg-surface-2 space-y-3">
            <p className="label text-accent">Approach</p>
            <p className="text-base sm:text-[17px] leading-[1.65] text-fg whitespace-pre-wrap">
              {card.problem.approach}
            </p>
          </div>
        )}
      </div>

      {/* Reveal CTA or Grade row */}
      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors"
        >
          <span>Show approach</span>
          {showHints && (
            <span className="mono text-xs px-1.5 py-0.5 rounded bg-accent-fg/10 text-accent-fg/70">
              space
            </span>
          )}
        </button>
      ) : (
        <div className="lift-in grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {BUTTONS.map((b) => (
            <button
              key={b.grade}
              disabled={pending}
              onClick={() => grade(b.grade)}
              style={{
                background: `var(--grade-${b.v})`,
                ["--hover-bg" as string]: `var(--grade-${b.v}-hi)`,
              }}
              className="group flex flex-col items-start gap-1.5 rounded-lg border border-border min-h-[88px] px-4 py-3 text-left transition-colors disabled:opacity-60 hover:border-accent hover:[background:var(--hover-bg)] active:scale-[0.98]"
            >
              <span className="mono text-2xl font-semibold tabular text-fg">{b.key}</span>
              <span>
                <span className="block text-sm font-medium text-fg leading-tight">{b.label}</span>
                <span className="block text-[11px] text-fg-3 mt-0.5">{b.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="mono text-xs text-fg-4 tabular">
          reps {card.reps} · {card.intervalDays.toFixed(1)}d
        </span>
        <button
          onClick={skip}
          disabled={pending}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-xs text-fg-2 hover:border-border-hi hover:text-fg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <span>Skip</span>
          {showHints && (
            <span className="mono px-1 py-0.5 rounded bg-surface-2 text-fg-3 text-[10px]">s</span>
          )}
        </button>
      </div>
    </article>
  );
}
