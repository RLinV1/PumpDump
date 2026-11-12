"use client";

import { useEffect, useRef, useState } from "react";
import { NOTICE } from "@/lib/api";
import { MAX_QUESTION } from "@/lib/commands";
import { AssistantBody, assistantTag, type AssistantState } from "@/components/assistant-panel";

// A small floating chat at the bottom right. Open state lives in the parent so the command line can open it too.
export function AssistantWidget({ open, onOpenChange, state, onAsk, ticker }: {
  open: boolean; onOpenChange: (open: boolean) => void; state: AssistantState; onAsk: (question: string) => void; ticker?: string;
}) {
  const launcher = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const restore = useRef(false); // only a close from inside the window hands focus back to the launcher
  const [draft, setDraft] = useState("");
  const tag = assistantTag(state);

  useEffect(() => {
    if (open) field.current?.focus();
    else if (restore.current) { restore.current = false; launcher.current?.focus(); }
  }, [open]);

  const close = () => { restore.current = true; onOpenChange(false); };

  return (
    <>
      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls="assistant-window"
        onClick={() => (open ? close() : onOpenChange(true))}
        className={`fixed bottom-3 right-3 z-40 inline-flex h-11 items-center gap-2 border border-accent bg-bg px-3 font-mono text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent hover:text-bg lg:bottom-1 lg:h-8 ${open ? "max-sm:hidden" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 3h12v8H7l-3 3v-3H2z" /></svg>
        Ask
      </button>
      {open && (
        <div
          id="assistant-window"
          role="dialog"
          aria-label="Research assistant"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}
          className="widget-in fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] min-h-64 flex-col border border-line-strong bg-bg sm:inset-x-auto sm:bottom-14 sm:right-3 sm:w-[360px] sm:max-h-[60vh]"
        >
          <header className="bar flex h-8 shrink-0 items-center justify-between gap-2 px-2 text-xs">
            <h2 className="flex min-w-0 items-baseline gap-2 font-semibold uppercase"><span className="text-yellow">ASK</span><span className="truncate">Assistant</span></h2>
            <span className="flex shrink-0 items-center gap-2">
              {tag && <span className="font-semibold uppercase" role="status">{tag}</span>}
              <button type="button" onClick={close} aria-label="Close assistant" className="-mr-2 inline-flex h-11 w-11 items-center justify-center hover:bg-accent hover:text-bg sm:h-8 sm:w-8">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
              </button>
            </span>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            <AssistantBody state={state} onAsk={onAsk} ticker={ticker} />
          </div>
          {(state.status === "loading" || state.status === "error") && <p className="border-t border-line px-2 py-1 text-xs text-mute">{NOTICE}</p>}
          <form
            className="flex shrink-0 gap-2 border-t border-line-strong p-2"
            onSubmit={(event) => {
              event.preventDefault();
              const question = draft.replace(/\s+/g, " ").trim();
              if (!question) return;
              setDraft("");
              onAsk(question);
            }}
          >
            <label htmlFor="assistant-question" className="sr-only">Ask the assistant a question</label>
            <input
              ref={field}
              id="assistant-question"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={ticker ? `Ask about ${ticker}...` : "Ask about a stock..."}
              maxLength={MAX_QUESTION}
              autoComplete="off"
              spellCheck={false}
              className="h-11 min-w-0 flex-1 border border-line-strong bg-bg px-2 text-base text-white placeholder:text-mute sm:h-9 sm:text-xs"
            />
            <button type="submit" disabled={!draft.trim()} className="inline-flex h-11 shrink-0 items-center bg-accent px-3 text-xs font-bold uppercase text-bg hover:bg-yellow disabled:bg-line disabled:text-mute sm:h-9">Send</button>
          </form>
        </div>
      )}
    </>
  );
}
