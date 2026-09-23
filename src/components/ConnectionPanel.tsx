import {
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  FlaskConical,
  Globe,
  Laptop,
  Link2,
  Plug,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { copyText, useBridgeStatus } from "@/hooks/useBridgeStatus";
import {
  LOCAL_PROXY_SCRIPT,
  LOCAL_PROXY_TEMPLATE,
  bookmarkletCode,
  bookmarkletHref,
  bridge,
} from "@/lib/transport";
import type { ConnectionMode, Settings } from "@/lib/types";
import { cn } from "@/utils/cn";
import { Alert, Button, Modal } from "./ui";

const MODES: Array<{ id: ConnectionMode; title: string; desc: string; icon: React.ReactNode }> = [
  { id: "auto", title: "Auto", desc: "Bridge → proxy → direct, whichever works", icon: <Sparkles className="h-4 w-4" /> },
  { id: "bridge", title: "IRCTC bridge", desc: "Bookmarklet on an irctc.co.in tab", icon: <Link2 className="h-4 w-4" /> },
  { id: "proxy", title: "Proxy", desc: "Your own proxy (e.g. local script)", icon: <Laptop className="h-4 w-4" /> },
  { id: "direct", title: "Direct", desc: "Needs a CORS-unblock extension", icon: <Globe className="h-4 w-4" /> },
  { id: "demo", title: "Sample data", desc: "Explore the UI offline", icon: <FlaskConical className="h-4 w-4" /> },
];

export function BridgeStatusBadge({ compact }: { compact?: boolean }) {
  const status = useBridgeStatus();
  const meta = {
    idle: { dot: "bg-slate-300", text: "Bridge not connected" },
    waiting: { dot: "bg-amber-400 animate-pulse", text: "Waiting for bookmarklet…" },
    connected: { dot: "bg-emerald-500", text: "Bridge connected" },
    lost: { dot: "bg-rose-500", text: "Bridge lost — re-click bookmarklet" },
  }[status];
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
      <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
      {!compact && meta.text}
    </span>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1b2a6b] text-xs font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        {children}
      </div>
    </li>
  );
}

export function ConnectionPanel({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const status = useBridgeStatus();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [pingResult, setPingResult] = useState<null | boolean>(null);
  const [showCode, setShowCode] = useState(false);

  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const appUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const code = useMemo(() => bookmarkletCode(appOrigin, appUrl), [appOrigin, appUrl]);

  // React blocks javascript: URLs in JSX, so set the bookmarklet href manually.
  useEffect(() => {
    if (open && linkRef.current) linkRef.current.setAttribute("href", bookmarkletHref(appOrigin, appUrl));
  }, [open, appOrigin, appUrl, settings.mode]);

  const downloadScript = () => {
    const blob = new Blob([LOCAL_PROXY_SCRIPT], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "irctc-proxy.mjs";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const showBridge = settings.mode === "auto" || settings.mode === "bridge";
  const showProxy = settings.mode === "auto" || settings.mode === "proxy";

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Plug className="h-5 w-5 text-orange-500" /> Connect to IRCTC</span>} wide>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-slate-600">
          IRCTC's chart service only accepts requests made from <b>irctc.co.in</b> itself and blocks cloud servers, so this
          page cannot call it directly. Choose how requests should reach IRCTC — the <b>bridge</b> works in any desktop
          browser with no installation.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => onChange({ ...settings, mode: m.id })}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                settings.mode === m.id
                  ? "border-[#1b2a6b] bg-indigo-50/70 ring-2 ring-[#1b2a6b]/20"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <div className={cn("mb-1 flex items-center gap-1.5 text-sm font-bold", settings.mode === m.id ? "text-[#1b2a6b]" : "text-slate-800")}>
                {m.icon}
                {m.title}
              </div>
              <div className="text-[11px] leading-snug text-slate-500">{m.desc}</div>
            </button>
          ))}
        </div>

        {showBridge && (
          <section className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <Link2 className="h-4 w-4 text-orange-500" /> One-click IRCTC bridge
              </h3>
              <BridgeStatusBadge />
            </div>
            <ol className="space-y-4">
              <Step n={1} title="Drag this button to your bookmarks bar (one time)">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    ref={linkRef}
                    onClick={(e) => {
                      e.preventDefault();
                      alert("Drag this button to your bookmarks bar, then click it while you are on an irctc.co.in tab.");
                    }}
                    className="inline-flex cursor-grab items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-orange-500/30 active:cursor-grabbing"
                    title="Drag me to your bookmarks bar"
                  >
                    <Bookmark className="h-4 w-4" /> IRCTC Chart Bridge
                  </a>
                  <span className="text-xs text-slate-500">Bookmarks bar hidden? Press Ctrl/⌘ + Shift + B.</span>
                </div>
              </Step>
              <Step n={2} title="Open IRCTC in a new tab from here">
                <Button variant="primary" size="sm" onClick={() => bridge.openIrctcTab()}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open irctc.co.in/online-charts
                </Button>
              </Step>
              <Step n={3} title="On the IRCTC tab, click the bookmark — then come back here">
                <p className="text-xs text-slate-500">
                  A green banner appears on the IRCTC tab and the status above turns <b className="text-emerald-600">connected</b>.
                  Keep that tab open while you use this page. Requests run from your own browser; nothing passes through any server.
                </p>
              </Step>
            </ol>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={status !== "connected"}
                onClick={async () => setPingResult(await bridge.ping())}
              >
                Test bridge
              </Button>
              {pingResult !== null && (
                <span className={cn("text-xs font-semibold", pingResult ? "text-emerald-600" : "text-rose-600")}>
                  {pingResult ? "IRCTC tab responded ✓" : "No response — click the bookmark again"}
                </span>
              )}
              <button onClick={() => setShowCode((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#1b2a6b] hover:underline">
                <Terminal className="h-3.5 w-3.5" /> {showCode ? "Hide" : "Can't use bookmarks? Use the console"}
              </button>
            </div>
            {showCode && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-600">
                  Open the IRCTC tab (step 2), press <b>F12</b> → <b>Console</b>, paste this code and press Enter:
                </p>
                <pre className="max-h-32 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-300">{code}</pre>
                <CopyButton text={code} label="Copy code" />
              </div>
            )}
          </section>
        )}

        {showProxy && (
          <section className="space-y-3 rounded-2xl border border-slate-200 p-4 sm:p-5">
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              <Laptop className="h-4 w-4 text-orange-500" /> Proxy {settings.mode === "auto" && <span className="text-xs font-medium text-slate-400">(optional)</span>}
            </h3>
            <p className="text-sm text-slate-600">
              Run the tiny Node.js script below on your own computer (<code className="rounded bg-slate-100 px-1">node irctc-proxy.mjs</code>) and
              use <code className="rounded bg-slate-100 px-1">{LOCAL_PROXY_TEMPLATE}</code>. Public cloud CORS proxies usually get blocked by IRCTC.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={settings.proxyTemplate}
                onChange={(e) => onChange({ ...settings, proxyTemplate: e.target.value })}
                placeholder="e.g. http://localhost:8787/?url={url}"
                className="h-10 flex-1 rounded-xl border border-slate-200 px-3 font-mono text-sm outline-none focus:border-[#1b2a6b] focus:ring-2 focus:ring-[#1b2a6b]/15"
              />
              <Button variant="secondary" onClick={() => onChange({ ...settings, proxyTemplate: LOCAL_PROXY_TEMPLATE })}>
                Use local proxy
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              <code>{"{url}"}</code> = URL-encoded target, <code>{"{raw}"}</code> = raw target; without a placeholder the target is appended.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={downloadScript}>
                <Download className="h-3.5 w-3.5" /> Download irctc-proxy.mjs
              </Button>
              <CopyButton text={LOCAL_PROXY_SCRIPT} label="Copy script" />
            </div>
          </section>
        )}

        {settings.mode === "direct" && (
          <Alert tone="warning" title="Direct mode">
            The browser will call www.irctc.co.in directly. This only works if you have a CORS-unblocking browser extension
            enabled for this page — otherwise requests fail immediately.
          </Alert>
        )}

        {settings.mode === "demo" && (
          <Alert tone="info" title="Sample data mode">
            Uses illustrative, generated data for train <b>12951</b> (Mumbai Central → New Delhi) so you can explore every
            feature. It is <b>not</b> real booking data.
          </Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
