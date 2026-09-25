"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Captions, Download, FileUp, Languages, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";
import { SectionHeader } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseSrt } from "@/lib/subtitles/srt";

type TranslateResult = Awaited<ReturnType<typeof api.translateSubtitles>>;

const FALLBACK_LANGS = ["en-US", "ja-JP", "ko-KR", "zh-TW", "es-ES", "fr-FR", "pt-BR", "de-DE"];

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SubtitlesView({ project }: { project: import("@/lib/api-client").StudioProject }) {
  const [sourceKind, setSourceKind] = useState<"episode" | "srt">("srt");
  const [episodeId, setEpisodeId] = useState("");
  const [srtText, setSrtText] = useState("");
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [targetLang, setTargetLang] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const termsQ = useQuery({
    queryKey: ["terminology", project.id],
    queryFn: () => api.fetchTerminology(project.id),
    refetchInterval: 15000,
  });

  const episodes = useMemo(
    () =>
      (project.seasons ?? [])
        .flatMap((s) => s.episodes.map((e) => ({ id: e.id, label: `S${s.number} · EP${String(e.number).padStart(2, "0")} ${e.title}` }))),
    [project.seasons],
  );

  const langs = useMemo(() => {
    const configured = Array.isArray(project.subtitleLanguages) ? project.subtitleLanguages.filter(Boolean) : [];
    return Array.from(new Set([...configured, ...FALLBACK_LANGS]));
  }, [project.subtitleLanguages]);

  const effectiveLang = targetLang || langs[0] || "en-US";
  const glossaryKnown = new Set((termsQ.data ?? []).map((t) => t.term));

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setSrtText(text);
    setSourceKind("srt");
    const { cues, skipped } = parseSrt(text);
    setParsedCount(cues.length);
    toast({
      title: `Parsed ${cues.length} cue${cues.length === 1 ? "" : "s"}`,
      description: skipped > 0 ? `${skipped} block(s) skipped as unparseable` : file.name,
    });
  }

  async function translate() {
    setBusy(true);
    setResult(null);
    try {
      const body =
        sourceKind === "episode"
          ? { projectId: project.id, targetLang: effectiveLang, episodeId }
          : { projectId: project.id, targetLang: effectiveLang, srt: srtText };
      const res = await api.translateSubtitles(body);
      setResult(res);
      toast({
        title: `Translated ${res.stats.cues} cue${res.stats.cues === 1 ? "" : "s"} to ${res.targetLang}`,
        description: `Glossary ${res.stats.glossarySize} · ${res.stats.termHits} enforcement pass(es) · ${res.stats.providerNote}`,
      });
    } catch (err) {
      toast({ title: "Translation failed", description: err instanceof Error ? err.message.slice(0, 160) : "unknown error" });
    } finally {
      setBusy(false);
    }
  }

  function downloadSrt() {
    if (!result) return;
    const blob = new Blob([result.srt], { type: "application/x-subrip;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "subtitles"}-${result.targetLang}.srt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function adoptSuggestion(term: string, translation: string) {
    setAdopting(`${term}=>${translation}`);
    try {
      await api.addTerminology({
        projectId: project.id,
        term,
        category: null,
        translations: { [result?.targetLang ?? effectiveLang]: translation },
      });
      toast({ title: "Term adopted into memory", description: `"${term}" -> "${translation}" - the next translation carries it.` });
      await termsQ.refetch();
      if (result) {
        setResult({
          ...result,
          suggestions: result.suggestions.filter((s) => !(s.term === term && s.translation === translation)),
        });
      }
    } catch (err) {
      toast({ title: "Could not adopt term", description: err instanceof Error ? err.message.slice(0, 160) : "unknown error" });
    } finally {
      setAdopting(null);
    }
  }

  const canTranslate =
    !busy &&
    (sourceKind === "episode" ? Boolean(episodeId) : srtText.trim().length > 0);

  return (
    <div>
      <SectionHeader
        title="Subtitles"
        sub="Translate SRT documents with the production's Terminology memory enforced: canonical renderings ride every cue, and a deterministic post-pass rewrites any drift. New consistent renderings come back as suggestions worth adopting."
      />

      <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
        {/* Source + language */}
        <div className="studio-panel p-4 space-y-4">
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Source</div>
            <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as "episode" | "srt")}>
              <SelectTrigger className="h-9 bg-white/5 border-white/10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="srt" className="text-xs">Pasted / uploaded SRT</SelectItem>
                <SelectItem value="episode" className="text-xs">Episode dialogue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sourceKind === "srt" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">SRT document</div>
                <div className="flex items-center gap-2">
                  {parsedCount !== null && <span className="text-[10px] text-muted-foreground">{parsedCount} cue(s) parsed</span>}
                  <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" onClick={() => fileInput.current?.click()}>
                    <FileUp className="h-3 w-3 mr-1" /> Upload .srt
                  </Button>
                </div>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".srt,text/plain"
                className="hidden"
                onChange={(e) => void onFilePicked(e.target.files?.[0])}
              />
              <textarea
                value={srtText}
                onChange={(e) => {
                  setSrtText(e.target.value);
                  setParsedCount(null);
                }}
                placeholder={"1\n00:00:01,000 --> 00:00:03,500\nA line of dialogue"}
                className="w-full h-48 text-[12px] font-mono bg-black/30 border border-white/10 rounded-md p-3 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 studio-scroll"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Episode</div>
              <Select value={episodeId || undefined} onValueChange={setEpisodeId}>
                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-xs">
                  <SelectValue placeholder="Pick an episode" />
                </SelectTrigger>
                <SelectContent>
                  {episodes.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Dialogue is timed by cumulative shot durations; the cut manifest refines it at publish.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Target language</div>
            <Select value={effectiveLang} onValueChange={setTargetLang}>
              <SelectTrigger className="h-9 bg-white/5 border-white/10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {langs.map((l) => (
                  <SelectItem key={l} value={l} className="text-xs">
                    {l}
                    {(termsQ.data ?? []).some((t) => {
                      try {
                        return Boolean(JSON.parse(t.translations)?.[l]);
                      } catch {
                        return false;
                      }
                    }) && " · memory ready"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full h-9" onClick={() => void translate()} disabled={!canTranslate}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {busy ? "Translating…" : `Translate to ${effectiveLang}`}
          </Button>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {(termsQ.data ?? []).length} term(s) in memory. DSH does the same work in conversation with <span className="text-foreground/80">translate_subtitles</span>.
          </p>
        </div>

        {/* Results */}
        <div className="space-y-4 min-w-0">
          {result && (
            <>
              <div className="studio-panel p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Captions className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{result.stats.cues} cues</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">{result.stats.batches} batches</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/25 text-primary">glossary {result.stats.glossarySize}</span>
                  {result.stats.termHits > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300">
                      {result.stats.termHits} enforcement pass(es)
                    </span>
                  )}
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">longest line {result.stats.longestTargetLine} ch</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-primary/30 bg-primary/10 text-primary hover:bg-primary/20" onClick={downloadSrt}>
                      <Download className="h-3 w-3 mr-1" /> Download .srt
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{result.sourceNote} · {result.stats.providerNote}</p>
              </div>

              {result.suggestions.length > 0 && (
                <div className="studio-panel p-4 space-y-2 border-primary/25 bg-primary/[0.04]">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-primary flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Suggested for the Terminology memory
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.suggestions.map((s) => {
                      const key = `${s.term}=>${s.translation}`;
                      return (
                        <button
                          key={key}
                          onClick={() => void adoptSuggestion(s.term, s.translation)}
                          disabled={adopting === key}
                          className="text-[11px] px-2 py-1 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                          title={`Adopt into memory: ${s.term} -> ${s.translation}`}
                        >
                          {adopting === key ? <Loader2 className="h-3 w-3 mr-1 inline animate-spin" /> : <Plus className="h-3 w-3 mr-1 inline" />}
                          {s.term} → {s.translation} ×{s.hits}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="studio-panel overflow-x-auto studio-scroll">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="px-3 py-2.5 font-medium text-muted-foreground w-10">#</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Timing</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground">Source</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground">{result.targetLang}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.cues.map((c, i) => {
                      const src = result.sourceCues[i];
                      const hit = src && result.glossary.some((g) => g.translation && src.text.includes(g.term) && c.text.includes(g.translation));
                      return (
                        <tr key={c.index} className="border-b border-white/5 hover:bg-white/[0.02] align-top">
                          <td className="px-3 py-2 text-muted-foreground">{c.index}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-mono text-[10px]">{formatMs(c.startMs)}→{formatMs(c.endMs)}</td>
                          <td className="px-3 py-2 whitespace-pre-line">{src?.text ?? "-"}</td>
                          <td className={`px-3 py-2 whitespace-pre-line ${hit ? "text-primary" : ""}`}>
                            {c.text}
                            {hit && <Languages className="h-3 w-3 inline ml-1.5 opacity-60" aria-label="glossary-enforced" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!result && (
            <div className="studio-panel p-8 text-center text-xs text-muted-foreground space-y-1.5">
              <Captions className="h-5 w-5 mx-auto opacity-40" />
              <p>Paste an SRT (or pick an episode) and translate: every glossary rendering rides the prompt, and the enforcement pass keeps the memory's decisions literal in the output.</p>
              <p className="text-[10px]">Cues where a canonical term was carried land <span className="text-primary">highlighted</span>; drifted cues are rewritten silently and counted as enforcement passes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
