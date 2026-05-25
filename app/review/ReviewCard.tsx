"use client";

import { useState, useTransition } from "react";
import { gradeCard } from "./actions";

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
}

const BUTTONS: { grade: 0 | 1 | 2 | 3; label: string; hint: string; className: string }[] = [
  { grade: 0, label: "Again", hint: "<1d",  className: "bg-red-600 hover:bg-red-500 text-white" },
  { grade: 1, label: "Hard",  hint: "soon", className: "bg-amber-500 hover:bg-amber-400 text-white" },
  { grade: 2, label: "Good",  hint: "ok",   className: "bg-emerald-600 hover:bg-emerald-500 text-white" },
  { grade: 3, label: "Easy",  hint: "long", className: "bg-sky-600 hover:bg-sky-500 text-white" },
];

export default function ReviewCard({ card }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [pending, startTransition] = useTransition();

  const grade = (g: 0 | 1 | 2 | 3) => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    fd.set("grade", String(g));
    startTransition(async () => {
      await gradeCard(fd);
      setRevealed(false);
    });
  };

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
          Show approach
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
                className={`rounded-md px-3 py-3 text-sm font-medium disabled:opacity-60 ${b.className}`}
              >
                <div>{b.label}</div>
                <div className="text-[10px] opacity-80">{b.hint}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="text-center text-xs text-neutral-500">
        reps {card.reps} · interval {card.intervalDays.toFixed(1)}d
      </p>
    </div>
  );
}
