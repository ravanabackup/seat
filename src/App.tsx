import {
  BadgeCheck,
  Clock,
  FlaskConical,
  CodeXml,
  Link2,
  Plug,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BridgeStatusBadge, ConnectionPanel } from "@/components/ConnectionPanel";
import { ResultsView, errorMessage } from "@/components/ResultsView";
import { SearchForm } from "@/components/SearchForm";
import { Alert, Button, Card } from "@/components/ui";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { cachedTrainList, getSchedule, getTrainComposition, getTrainList } from "@/lib/api";
import { OFFICIAL_CHART_URL } from "@/lib/constants";
import { DEMO_TRAIN, DEMO_TRAIN_LIST } from "@/lib/demo";
import { isValidIso, todayIso } from "@/lib/format";
import { ConnectionError, bridge, loadSettings, saveSettings } from "@/lib/transport";
import type { RecentSearch, SearchParams, Settings, TrainComposition, TrainListItem, TrainSchedule } from "@/lib/types";
import { cn } from "@/utils/cn";

const RECENTS_KEY = "irctc-chart-viewer:recents";

function loadRecents(): RecentSearch[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function readUrlParams(): Partial<SearchParams> {
  const q = new URLSearchParams(location.search);
  const trainNo = (q.get("train") ?? q.get("trainNo") ?? "").trim();
  const jDate = (q.get("date") ?? q.get("jDate") ?? q.get("journeyDate") ?? "").trim();
  const from = (q.get("from") ?? q.get("boardingStation") ?? "").trim().toUpperCase();
  return {
    trainNo: /^\d{5}$/.test(trainNo) ? trainNo : undefined,
    jDate: isValidIso(jDate) ? jDate : undefined,
    boardingStation: /^[A-Z0-9]{1,6}$/.test(from) ? from : undefined,
  };
}

interface Result {
  params: SearchParams;
  composition: TrainComposition;
  demo: boolean;
  at: number;
}

const MODE_LABEL: Record<Settings["mode"], string> = {
  auto: "Auto",
  bridge: "Bridge",
  direct: "Direct",
  proxy: "Proxy",
  demo: "Sample data",
};

export default function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);
  const bridgeStatus = useBridgeStatus();
  const [connOpen, setConnOpen] = useState(false);

  useEffect(() => {
    bridge.start();
  }, []);

  const initial = useMemo(readUrlParams, []);
  const [form, setForm] = useState<SearchParams>({
    trainNo: initial.trainNo ?? "",
    jDate: initial.jDate ?? todayIso(),
    boardingStation: initial.boardingStation ?? "",
  });

  const [trainList, setTrainList] = useState<TrainListItem[]>(() => cachedTrainList() ?? []);
  const trainListBusy = useRef(false);
  const [schedule, setSchedule] = useState<TrainSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; connection: boolean } | null>(null);
  const [recents, setRecents] = useState<RecentSearch[]>(loadRecents);
  const pending = useRef<SearchParams | null>(initial.trainNo && initial.boardingStation ? (form as SearchParams) : null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const transportLikely = settings.mode !== "auto" || bridgeStatus === "connected" || settings.proxyTemplate.trim().length > 0;

  /* ---------------- train list (autocomplete) ---------------- */
  const tryLoadTrainList = useCallback(() => {
    if (settings.mode === "demo") {
      setTrainList(DEMO_TRAIN_LIST);
      return;
    }
    if (trainList.length > 1 || trainListBusy.current || !transportLikely) return;
    trainListBusy.current = true;
    getTrainList(settings)
      .then(setTrainList)
      .catch(() => undefined)
      .finally(() => {
        trainListBusy.current = false;
      });
  }, [settings, trainList.length, transportLikely]);

  useEffect(() => {
    if (bridgeStatus === "connected") tryLoadTrainList();
  }, [bridgeStatus, tryLoadTrainList]);

  /* ---------------- schedule (boarding stations) ---------------- */
  const scheduleKey = useRef("");
  useEffect(() => {
    const trainNo = form.trainNo;
    if (!/^\d{5}$/.test(trainNo)) {
      setScheduleError(null);
      return;
    }
    const key = `${trainNo}|${settings.mode}`;
    if (schedule?.trainNumber === trainNo && scheduleKey.current === key) return;
    if (!transportLikely) {
      setScheduleError("Not connected to IRCTC");
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError(null);
    getSchedule(trainNo, settings)
      .then((s) => {
        if (cancelled) return;
        scheduleKey.current = key;
        setSchedule(s);
        setForm((f) =>
          f.trainNo === trainNo && !s.stations.slice(0, -1).some((st) => st.code === f.boardingStation)
            ? { ...f, boardingStation: s.stations[0]?.code ?? "" }
            : f,
        );
      })
      .catch((e) => {
        if (!cancelled) setScheduleError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.trainNo, settings.mode, settings.proxyTemplate, transportLikely]);

  /* ---------------- search ---------------- */
  const runSearch = useCallback(
    async (p: SearchParams, s: Settings = settings, opts: { refresh?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const composition = await getTrainComposition(p, s);
        setResult({ params: p, composition, demo: s.mode === "demo", at: Date.now() });
        pending.current = null;
        const entry: RecentSearch = { ...p, trainName: composition.trainName, at: Date.now() };
        setRecents((prev) => {
          const next = [entry, ...prev.filter((r) => !(r.trainNo === p.trainNo && r.jDate === p.jDate && r.boardingStation === p.boardingStation))].slice(0, 8);
          try {
            localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
        if (s.mode !== "demo") {
          history.replaceState(null, "", `${location.pathname}?train=${p.trainNo}&date=${p.jDate}&from=${p.boardingStation}`);
        }
        if (!opts.refresh) setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      } catch (e) {
        const connection = e instanceof ConnectionError && e.needsSetup;
        setError({ message: errorMessage(e), connection });
        if (!opts.refresh) setResult(null);
        if (connection) pending.current = p; // retry automatically once connected
      } finally {
        setLoading(false);
      }
    },
    [settings],
  );

  // Run a pending search (from the URL, or one that failed for lack of a connection) once a transport is available.
  useEffect(() => {
    if (!pending.current || !transportLikely || loading) return;
    const p = pending.current;
    pending.current = null;
    void runSearch(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportLikely, bridgeStatus]);

  const startDemo = () => {
    const demoSettings: Settings = { ...settings, mode: "demo" };
    setSettings(demoSettings);
    const p = { trainNo: DEMO_TRAIN, jDate: todayIso(), boardingStation: "MMCT" };
    setForm(p);
    setTrainList(DEMO_TRAIN_LIST);
    setConnOpen(false);
    void runSearch(p, demoSettings);
  };

  const leaveDemo = () => {
    setSettings({ ...settings, mode: "auto" });
    setResult(null);
    setError(null);
    setTrainList(cachedTrainList() ?? []);
  };

  const onConnectionProblem = useCallback(() => setConnOpen(true), []);
  const matchingSchedule = result && schedule?.trainNumber === result.params.trainNo ? schedule : null;
  const isDemoMode = settings.mode === "demo";

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#121b4a]/95 text-white backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href={location.pathname} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 shadow-md shadow-orange-600/30">
              <TrainFront className="h-4.5 w-4.5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight sm:text-base">Chart &amp; Vacancy</span>
              <span className="hidden text-[10px] font-medium text-indigo-200 sm:block">IRCTC online reservation chart viewer</span>
            </span>
          </a>
          <button
            onClick={() => setConnOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15 transition hover:bg-white/15"
          >
            <Plug className="h-3.5 w-3.5 text-orange-300" />
            <span className="hidden sm:inline">{MODE_LABEL[settings.mode]}</span>
            <span className="rounded-md bg-white px-1.5 py-0.5">
              {isDemoMode ? <span className="text-[10px] font-bold text-orange-600">DEMO</span> : <BridgeStatusBadge compact />}
            </span>
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#121b4a] via-[#1b2a6b] to-[#24398f] pb-28 pt-10 text-white sm:pt-14">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 46px)" }} />
        <div className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-orange-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-100 ring-1 ring-white/15">
            <Sparkles className="h-3.5 w-3.5 text-orange-300" /> Live data from irctc.co.in/online-charts
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Reservation chart &amp; <span className="text-orange-400">vacant berths</span>, berth by berth.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-indigo-100 sm:text-base">
            See coach composition, class-wise vacancies and a colour-coded layout of every coach after the chart is
            prepared — and find berths free for exactly your stretch of the journey.
          </p>
        </div>
      </section>

      <main className="relative mx-auto -mt-20 max-w-7xl space-y-5 px-4 pb-16 sm:px-6">
        <Card className="p-4 shadow-xl shadow-indigo-950/10 sm:p-6">
          <SearchForm
            form={form}
            setForm={setForm}
            schedule={schedule}
            scheduleLoading={scheduleLoading}
            scheduleError={scheduleError}
            trainList={trainList}
            onTrainFocus={tryLoadTrainList}
            loading={loading && !result}
            onSubmit={() => runSearch(form)}
            recents={recents}
            onPickRecent={(r) => {
              const p = { trainNo: r.trainNo, jDate: r.jDate, boardingStation: r.boardingStation };
              setForm(p);
              void runSearch(p);
            }}
            onClearRecents={() => {
              setRecents([]);
              localStorage.removeItem(RECENTS_KEY);
            }}
          />
        </Card>

        {isDemoMode && (
          <Alert
            tone="warning"
            title="You're viewing sample data"
            action={
              <Button size="sm" variant="secondary" onClick={leaveDemo}>
                Switch to live IRCTC data
              </Button>
            }
          >
            Demo mode shows generated, illustrative data for train {DEMO_TRAIN} only. It is not real booking information.
          </Alert>
        )}

        {!isDemoMode && !transportLikely && !result && (
          <ConnectPrompt onSetup={() => setConnOpen(true)} onDemo={startDemo} status={bridgeStatus} />
        )}

        {!isDemoMode && bridgeStatus === "connected" && !result && !error && (
          <Alert tone="success" title="Connected to IRCTC">
            The bridge tab is active — enter a train, date and boarding station, then press <b>Get Train Chart</b>.
          </Alert>
        )}

        {error && (
          <Alert
            tone={error.connection ? "warning" : "error"}
            title={error.connection ? "Can't reach IRCTC from this page yet" : "IRCTC couldn't return a chart"}
            action={
              error.connection ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setConnOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" /> Connect IRCTC bridge
                  </Button>
                  <Button size="sm" variant="secondary" onClick={startDemo}>
                    <FlaskConical className="h-3.5 w-3.5" /> Try sample data
                  </Button>
                </div>
              ) : undefined
            }
          >
            <p>{error.message}</p>
            {error.connection ? (
              <p className="mt-1 text-xs">Your search will run automatically as soon as the connection is ready.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                <li>Charts exist only after preparation — the first chart about 4 hours before departure, the second about 30 minutes before.</li>
                <li>Check that the train runs on the chosen date from your boarding station (for overnight trains the date is when you board).</li>
                <li>
                  You can cross-check on the{" "}
                  <a className="font-semibold underline" href={OFFICIAL_CHART_URL} target="_blank" rel="noreferrer">
                    official IRCTC chart page
                  </a>
                  .
                </li>
              </ul>
            )}
          </Alert>
        )}

        <div ref={resultsRef} className="scroll-mt-20">
          {result && (
            <ResultsView
              key={`${result.params.trainNo}|${result.params.jDate}|${result.params.boardingStation}|${result.demo}`}
              composition={result.composition}
              params={result.params}
              schedule={matchingSchedule}
              settings={result.demo ? { ...settings, mode: "demo" } : settings}
              isDemo={result.demo}
              onRefresh={() => runSearch(result.params, result.demo ? { ...settings, mode: "demo" } : settings, { refresh: true })}
              refreshing={loading && !!result}
              onConnectionProblem={onConnectionProblem}
            />
          )}
        </div>

        {!result && <HowItWorks />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="max-w-3xl leading-relaxed">
            Unofficial viewer — not affiliated with IRCTC, CRIS or Indian Railways. Data belongs to Indian Railways and is
            fetched from <a className="font-semibold text-[#1b2a6b] hover:underline" href={OFFICIAL_CHART_URL} target="_blank" rel="noreferrer">irctc.co.in/online-charts</a> directly by your browser.
            For personal use only; always verify before travel. Railway enquiry: 139.
          </p>
          <a
            href="https://github.com/mahi-v-v/indian-rail-mcp"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-slate-600 hover:text-[#1b2a6b]"
          >
            <CodeXml className="h-4 w-4" /> API research: indian-rail-mcp
          </a>
        </div>
      </footer>

      <ConnectionPanel open={connOpen} onClose={() => setConnOpen(false)} settings={settings} onChange={setSettings} />
    </div>
  );
}

function ConnectPrompt({ onSetup, onDemo, status }: { onSetup: () => void; onDemo: () => void; status: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[1.3fr_1fr]">
        <div className="p-5 sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
            <Plug className="h-3.5 w-3.5" /> One-time setup
          </div>
          <h2 className="mt-3 text-xl font-extrabold text-slate-900">Connect to IRCTC to fetch live charts</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            IRCTC's chart service only answers requests coming from <b>irctc.co.in</b>. A tiny bookmark (the “bridge”)
            lets this page ask an open IRCTC tab to fetch the chart for you — straight from your browser, no server in between.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onSetup}>
              <Link2 className="h-4 w-4" /> Set up the bridge (30 sec)
            </Button>
            <Button variant="secondary" onClick={onDemo}>
              <FlaskConical className="h-4 w-4" /> Explore with sample data
            </Button>
          </div>
          {status === "waiting" && <p className="mt-3 text-xs font-semibold text-amber-700">Waiting for you to click the bookmark on the IRCTC tab…</p>}
          {status === "lost" && <p className="mt-3 text-xs font-semibold text-rose-600">The IRCTC tab was closed or reloaded — click the bookmark there again.</p>}
        </div>
        <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-6 md:border-l md:border-t-0">
          <ol className="space-y-3 text-sm">
            {[
              "Drag the “IRCTC Chart Bridge” button to your bookmarks bar",
              "Open irctc.co.in from the setup panel",
              "Click the bookmark on that tab — you're connected",
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1b2a6b] text-[11px] font-bold text-white">{i + 1}</span>
                <span className="pt-0.5 text-slate-700">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}

function HowItWorks() {
  const items = [
    {
      icon: <Clock className="h-5 w-5" />,
      title: "When are charts available?",
      text: "The first reservation chart is prepared about 4 hours before departure from the charting station; the second chart about 30 minutes before departure.",
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Part-journey vacancies",
      text: "A berth can be free only between some stations. Set “my journey” to see berths free for exactly your stretch — useful for current booking or asking the TTE.",
    },
    {
      icon: <BadgeCheck className="h-5 w-5" />,
      title: "Same colours as IRCTC",
      text: "Green = vacant for full journey, yellow = occupied for part journey, blue = occupied for full journey — matching the official coach layout.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Private by design",
      text: "Requests go from your browser to IRCTC (via your own IRCTC tab or proxy). Nothing is stored on any server; recent searches stay in your browser.",
    },
  ];
  return (
    <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className={cn("rounded-2xl border border-slate-200 bg-white p-5")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">{it.icon}</div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">{it.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{it.text}</p>
        </div>
      ))}
    </div>
  );
}
