"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTICE, askAssistant, type AssistantAnswer } from "@/lib/api";
import { btnGhost } from "@/lib/ui";
import { Panel, Skeleton } from "@/components/term-panel";

export type AssistantState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "error"; question: string; message: string }
  | { status: "done"; question: string; result: AssistantAnswer; notice: string };

// One question at a time: asking again cancels the one in flight.
export function useAssistant() {
  const [state, setState] = useState<AssistantState>({ status: "idle" });
  const controller = useRef<AbortController>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const ask = useCallback(async (question: string) => {
    controller.current?.abort();
    const mine = (controller.current = new AbortController());
    setState({ status: "loading", question });
    try {
      const { notice, data } = await askAssistant(question, mine.signal);
      if (!mine.signal.aborted) setState({ status: "done", question, result: data, notice });
    } catch (error) {
      if (!mine.signal.aborted) setState({ status: "error", question, message: error instanceof Error ? error.message : "The assistant failed." });
    }
  }, []);
  return { state, ask };
}

const EXAMPLES = ["ASK Is GME being pumped?", "ASK Why did AMC move today?", "ASK What is a P/E ratio?"];

export function AssistantPanel({ state, onAsk, active }: { state: AssistantState; onAsk: (question: string) => void; active?: boolean }) {
  const tag = state.status === "loading" ? "THINKING" : state.status === "done" ? (state.result.dataMode === "mock" || state.result.llm === "mock" ? "MOCK" : "LIVE") : undefined;
  return (
    <Panel id="assistant" number={7} title="Assistant" tag={tag} active={active} className="lg:col-start-3 lg:row-span-2 lg:row-start-2">
      {state.status === "idle" ? (
        <div className="p-3 text-xs" role="status">
          <p className="font-semibold text-accent">Ask about a stock</p>
          <p className="mt-1 max-w-[52ch] text-mute">Answers come from tools and cite their sources. For pump questions it reads the same risk scores as the panels here.</p>
          <ul className="mt-2 space-y-0.5">
            {EXAMPLES.map((e) => <li key={e} className="text-yellow">{e} &lt;GO&gt;</li>)}
          </ul>
          <p className="mt-2 text-mute">{NOTICE}</p>
        </div>
      ) : state.status === "loading" ? (
        <div>
          <p className="border-b border-line px-2 py-1 text-xs text-white"><span className="text-accent">Q</span> {state.question}</p>
          <Skeleton rows={4} />
          <p className="px-2 pb-2 text-xs text-mute" role="status">Asking. This can take up to 45 seconds.</p>
        </div>
      ) : state.status === "error" ? (
        <div className="p-3 text-xs" role="alert">
          <p className="text-white"><span className="text-accent">Q</span> {state.question}</p>
          <p className="mt-2 font-semibold text-accent">The assistant did not answer.</p>
          <p className="mt-1 max-w-[52ch] text-mute">{state.message}</p>
          <button type="button" onClick={() => onAsk(state.question)} className={`${btnGhost} mt-2`}>Retry</button>
        </div>
      ) : (
        <div className="text-xs">
          <p className="border-b border-line px-2 py-1 text-white"><span className="text-accent">Q</span> {state.question}</p>
          {state.result.answer.trim() ? (
            <p className="whitespace-pre-wrap break-words px-2 py-2 leading-snug text-white">{state.result.answer}</p>
          ) : (
            <p className="px-2 py-2 text-mute">The assistant returned an empty answer. Try rephrasing the question.</p>
          )}
          <dl className="space-y-1 border-t border-line px-2 py-1.5">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-accent">TOOLS</dt>
              <dd className="text-yellow">{state.result.toolsUsed.length ? state.result.toolsUsed.join(", ") : "none used"}</dd>
            </div>
            <div>
              <dt className="text-accent">SOURCES</dt>
              <dd>
                {state.result.sources.length === 0 ? <span className="text-mute">None cited.</span> : (
                  <ul>
                    {state.result.sources.map((s) => (
                      <li key={`${s.kind}:${s.title}`} className="break-words">
                        <span className="text-mute">[{s.kind}]</span>{" "}
                        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-cyan underline">{s.title}</a> : <span className="text-white">{s.title}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
          <p className="border-t border-line px-2 py-1.5 text-mute">{state.notice}</p>
        </div>
      )}
    </Panel>
  );
}
