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

const BUTTONS: { grade: 0 | 1 | 2 | 3; key: string; label: string; hint: string; className: string }[] = [
  { grade: 0, key: "1", label: "Again", hint: "1·<1d", className: "bg-red-600 hover:bg-red-500 text-white focus:ring-red-300" },
  { grade: 1, key: "2", label: "Hard", hint: "2·soon", className: "bg-amber-500 hover:bg-amber-400 text-white focus:ring-amber-300" },
  { grade: 2, key: "3", label: "Good", hint: "3·ok", className: "bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-300" },
  { grade: 3, key: "4", label: "Easy", hint: "4·long", className: "bg-sky-600 hover:bg-sky-500 text-white focus:ring-sky-300" },
];

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
      /* localStorage unavailable; show hints anyway */
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

  // Keyboard handler — scoped preventDefault only on handled keys.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const k = e.key;

      // Space → reveal
      if (k === " " || k === "Spacebar") {
        if (!revealed) {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }

      // Skip (works before or after reveal)
      if (k === "s" || k === "S") {
        e.preventDefault();
        if (!pending) skip();
        return;
      }

      // Grades — only post-reveal
      if (revealed && (k === "1" || k === "2" || k === "3" || k === "4")) {
        e.preventDefault();
        const g = (Number(k) - 1) as 0 | 1 | 2 | 3;
        if (!pending) grade(g);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, pending]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{card.problem.title}</h2>
          <span className="text-xs text-neutral-500">{card.problem.source}</span>
        </div>
        {card.problem.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.problem.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="mt-4 whitespace-pre-wrap text-[0.95rem] leading-relaxed">
          {card.problem.prompt}
        </p>
        {card.problem.url && (
          <a
            href={card.problem.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-xs text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            Open on source site ↗
          </a>
        )}
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          Show approach{showHints && <span className="ml-2 text-xs text-neutral-500">Space</span>}
        </button>
      ) : (
        <>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900/60">
            <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              Approach
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed">
              {card.problem.approach}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {BUTTONS.map((b) => (
              <button
                key={b.grade}
                disabled={pending}
                onClick={() => grade(b.grade)}
                className={`rounded-md px-3 py-3 text-sm font-medium disabled:opacity-60 focus:outline-none focus:ring-2 ${b.className}`}
              >
                <div>{b.label}</div>
                {showHints && <div className="text-[10px] opacity-80">{b.hint}</div>}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          reps {card.reps} · interval {card.intervalDays.toFixed(1)}d
        </span>
        <button
          onClick={skip}
          disabled={pending}
          className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Skip{showHints && <span className="ml-1 opacity-70">s</span>}
        </button>
      </div>
    </div>
  );
}
