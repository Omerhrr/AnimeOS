"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send, Loader2, Brain, ListChecks, Wrench, CircleCheck, CircleX, User,
  Sparkles, ChevronDown, ChevronUp, Volume2, Play, Square,
} from "lucide-react";
import { api, parseTrace, type DshMessageRow } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EnsembleAuditionPreview, TraceStep } from "@/lib/types";

const SUGGESTIONS = [
  "Create a new donghua production called 'Azure Sky' about a cloud-riding swordswoman",
  "Break Scene 12 into shots with full cinematography",
  "Check Scene 12 for missing capabilities and fix them",
  "Render a preview of shot 5 in scene 12 and inspect it",
];

/**
 * Same-turn ENSEMBLE audition block: an ensemble apply renders ONE
 * proposed read per engaged speaker (A/B against the stored take when
 * one exists) and attaches it to the trace, so the creator hears the
 * whole beat right where the arc landed. The sequence player walks the
 * proposed reads in speaker order; any stop/new play/close cancels it.
 */
function EnsembleAuditionBlock({ preview }: { preview: EnsembleAuditionPreview }) {
  const seqRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(
    () => () => {
      seqRef.current += 1;
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  function stop() {
    seqRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }

  async function playSequence() {
    stop();
    const token = seqRef.current;
    setPlaying(true);
    for (const row of preview.speakers) {
      if (seqRef.current !== token) return;
      await new Promise<void>((resolve) => {
        const audio = new Audio(row.url);
        audioRef.current = audio;
        const done = () => resolve();
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = done; // stop() pauses: resolve instead of hanging
        void audio.play().catch(done);
      });
    }
    if (seqRef.current === token) setPlaying(false);
  }

  return (
    <div className="rounded-md border border-teal-400/25 bg-teal-400/[0.06] p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-teal-300">
          <Volume2 className="h-3 w-3" />
          Ensemble audition - {preview.speakers.length} speaker{preview.speakers.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={playing ? stop : () => void playSequence()}
          disabled={preview.speakers.length === 0}
          title={playing
            ? "Stop the sequence"
            : `Play every speaker's proposed read in order (${preview.speakers.length} row${preview.speakers.length === 1 ? "" : "s"})`}
          className={cn(
            "ml-auto h-6 rounded-md border px-2 text-[9px] font-bold flex items-center gap-1 transition-colors",
            preview.speakers.length === 0
              ? "border-white/8 text-muted-foreground/40"
              : "border-teal-400/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20",
          )}
        >
          {playing ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
          {playing ? "stop" : "play sequence"}
        </button>
      </div>
      {preview.speakers.map((row, i) => (
        <div key={i} className="space-y-1 rounded border border-white/8 bg-black/25 p-1.5">
          <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.14em] text-teal-200/90">
            <span className="truncate normal-case tracking-normal font-semibold">{row.characterName}</span>
            <span className="font-mono tracking-normal normal-case shrink-0">
              &quot;{row.stateLabel}&quot;
              {row.speed !== 1 && ` · x${row.speed} pace`}
              {row.pitch !== 1 && ` · pitch x${row.pitch}`}
              {row.durationMs ? ` · ${(row.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
          </div>
          {row.current && (
            <div className="space-y-0.5">
              <div className="text-[9px] uppercase tracking-[0.14em] text-slate-300/70">current take</div>
              <audio controls preload="none" src={row.current.url} className="w-full h-8 opacity-90" />
            </div>
          )}
          <div className="space-y-0.5">
            <div className="text-[9px] uppercase tracking-[0.14em] text-teal-300/90">{row.current ? "proposed" : "audition"}</div>
            <audio controls preload="none" src={row.url} className="w-full h-8" />
          </div>
          <div className="text-[10px] leading-relaxed text-muted-foreground">
            {row.current && <span className="text-amber-300/90">A/B: current first, then proposed. </span>}
            <span className="italic">&quot;{row.text}&quot;</span>
            {` · ${row.source}`}
          </div>
        </div>
      ))}
      {preview.skipped.length > 0 && (
        <div className="text-[10px] leading-relaxed text-muted-foreground">Skipped: {preview.skipped.join(" ")}</div>
      )}
    </div>
  );
}

function TraceBlock({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(true);
  if (!steps.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-violet-200/90 hover:bg-violet-400/5"
      >
        <Brain className="h-3.5 w-3.5" />
        DSH execution trace - {steps.length} round{steps.length > 1 ? "s" : ""},{" "}
        {steps.reduce((n, s) => n + s.actions.length, 0)} tool call{steps.reduce((n, s) => n + s.actions.length, 0) > 1 ? "s" : ""}
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {steps.map((step) => (
            <div key={step.step} className="border-l-2 border-violet-400/30 pl-3 space-y-2">
              <div className="text-[11px] leading-relaxed text-violet-100/80">
                <span className="font-semibold text-violet-300">Thought · </span>
                {step.thought || "-"}
              </div>
              {step.plan.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground/70 mb-1">
                    <ListChecks className="h-3 w-3" /> Plan
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 ml-1">
                    {step.plan.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                </div>
              )}
              {step.actions.map((a, i) => (
                <div key={i} className="rounded-md bg-black/30 border border-white/8 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    {a.status === "OK" ? (
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <CircleX className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    )}
                    <Wrench className="h-3 w-3 text-muted-foreground" />
                    <span className="text-primary font-semibold">{a.tool}</span>
                  </div>
                  {Object.keys(a.args).length > 0 && (
                    <pre className="text-[10px] text-muted-foreground overflow-x-auto studio-scroll whitespace-pre-wrap break-words">
                      {JSON.stringify(a.args, null, 1)}
                    </pre>
                  )}
                  <div className="text-[11px] text-foreground/70 whitespace-pre-wrap leading-relaxed">{a.result}</div>
                  {/* same-turn audition proposal: a variant bind renders a preview of the new performance,
                      paired with the current stored take of the same line when one exists (A/B);
                      an ensemble apply renders ONE row per engaged speaker plus a sequence player */}
                  {a.audition && (
                    <div className="rounded-md border border-emerald-400/25 bg-emerald-400/[0.06] p-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                        <Volume2 className="h-3 w-3" />
                        Audition - {a.audition.characterName} &quot;{a.audition.stateLabel}&quot;
                      </div>
                      {a.audition.current && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-slate-300/70">
                            <span>current take</span>
                            <span className="font-mono tracking-normal normal-case">
                              {a.audition.current.voiceId ?? "unknown voice"}
                              {a.audition.current.durationMs ? ` · ${(a.audition.current.durationMs / 1000).toFixed(1)}s` : ""}
                              {a.audition.current.stateLabel ? ` · ${a.audition.current.stateLabel}` : ""}
                            </span>
                          </div>
                          <audio controls preload="none" src={a.audition.current.url} className="w-full h-8 opacity-90" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-emerald-300/90">
                          <span>{a.audition.current ? "proposed" : "audition"}</span>
                          <span className="font-mono tracking-normal normal-case">
                            {a.audition.voiceId}
                            {a.audition.speed !== 1 && ` · x${a.audition.speed} pace`}
                            {a.audition.pitch !== 1 && ` · pitch x${a.audition.pitch}`}
                            {a.audition.durationMs ? ` · ${(a.audition.durationMs / 1000).toFixed(1)}s` : ""}
                          </span>
                        </div>
                        <audio controls preload="none" src={a.audition.url} className="w-full h-8" />
                      </div>
                      <div className="text-[10px] leading-relaxed text-muted-foreground">
                        {a.audition.current && <span className="text-amber-300/90">A/B: current first, then proposed. </span>}
                        <span className="italic">&quot;{a.audition.text}&quot;</span>
                        {` · ${a.audition.source}`}
                      </div>
                    </div>
                  )}
                  {a.ensembleAudition && <EnsembleAuditionBlock preview={a.ensembleAudition} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DshConsole() {
  const { projectId, setProject } = useStudio();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<DshMessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQ = useQuery({
    queryKey: ["dsh", projectId],
    queryFn: () => api.dshMessages(projectId!),
    enabled: Boolean(projectId),
  });

  const messages = [...(messagesQ.data ?? []), ...local];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || busy || !projectId) return;
    setInput("");
    setBusy(true);
    setError(null);
    const optimistic: DshMessageRow = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: msg,
      trace: null,
      createdAt: new Date().toISOString(),
    };
    setLocal((prev) => [...prev, optimistic]);
    try {
      const result = await api.dshTurn(projectId, msg);
      setLocal((prev) => [
        ...prev,
        {
          id: `local-dsh-${Date.now()}`,
          role: "dsh",
          content: result.reply,
          trace: JSON.stringify(result.trace),
          createdAt: new Date().toISOString(),
        },
      ]);
      // DSH may have created/switched to another production mid-turn
      if (result.activeProjectId && result.activeProjectId !== projectId) {
        setProject(result.activeProjectId);
      }
      const target = result.activeProjectId ?? projectId;
      // Production state may have changed massively
      qc.invalidateQueries({ queryKey: ["project", target] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["renderJobs", target] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "DSH could not complete the turn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-4.5 w-4.5 text-primary" />
          DSH - AI Director
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Speak in natural language. DSH plans, calls production tools, observes results, and reports back - every decision is traceable.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto studio-scroll space-y-4 pr-1">
        {messages.length === 0 && !busy && (
          <div className="studio-panel p-5">
            <p className="text-sm font-medium mb-1">The set is quiet, director.</p>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Describe what should happen - DSH understands the production state: characters, continuity, environments, scenes and shots.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-[11px] leading-relaxed rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-colors p-3"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "dsh" && (
              <div className="h-7 w-7 shrink-0 rounded-lg bg-violet-400/15 border border-violet-400/30 flex items-center justify-center mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              </div>
            )}
            <div className={cn("max-w-[85%] md:max-w-[75%]", m.role === "user" && "order-first")}>
              <div
                className={cn(
                  "rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary/15 border border-primary/25 text-foreground"
                    : "studio-panel"
                )}
              >
                {m.content}
              </div>
              {m.role === "dsh" && <TraceBlock steps={parseTrace(m.trace)} />}
            </div>
            {m.role === "user" && (
              <div className="h-7 w-7 shrink-0 rounded-lg bg-white/8 border border-white/15 flex items-center justify-center mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex gap-3 items-center text-muted-foreground">
            <div className="h-7 w-7 rounded-lg bg-violet-400/15 border border-violet-400/30 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-violet-300 dsh-pulse" />
            </div>
            <span className="text-xs flex items-center gap-2">
              DSH is directing - planning, calling tools, observing results
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          </div>
        )}
        {error && (
          <div className="text-xs text-rose-300 bg-rose-400/10 border border-rose-400/25 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Direct the production…  (e.g. 'Continue Episode 7 - create the confrontation scene and break it into shots')"
          className="min-h-[52px] max-h-40 bg-white/[0.04] border-white/12 text-[13px] resize-none"
          disabled={busy}
        />
        <Button size="icon" className="h-[52px] w-[52px] shrink-0" onClick={() => send()} disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
