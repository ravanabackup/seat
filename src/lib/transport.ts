/**
 * Transport layer for talking to www.irctc.co.in.
 *
 * IRCTC's chart API has no CORS headers and its Akamai edge rejects
 * datacenter traffic (public CORS proxies get HTTP 403). The reliable way to
 * reach it is from the user's own browser *on* irctc.co.in, so we provide a
 * tiny bookmarklet "bridge": it runs on the IRCTC tab, performs same-origin
 * fetches there and relays the results to this page with postMessage.
 *
 * Other options: direct fetch (works only with a CORS-unblocking extension)
 * and a user-configured proxy (e.g. a local one on the user's machine).
 */
import { IRCTC_ORIGIN, OFFICIAL_CHART_URL } from "./constants";
import type { Settings } from "./types";

export interface ApiRequest {
  path: string;
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
}

export type Via = "bridge" | "direct" | "proxy" | "demo";

export interface RawResponse {
  status: number;
  text: string;
  via?: Via;
}

export class ConnectionError extends Error {
  needsSetup: boolean;
  constructor(message: string, needsSetup = true) {
    super(message);
    this.name = "ConnectionError";
    this.needsSetup = needsSetup;
  }
}

export class IrctcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IrctcError";
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const SETTINGS_KEY = "irctc-chart-viewer:settings";

export const DEFAULT_SETTINGS: Settings = { mode: "auto", proxyTemplate: "" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / private mode */
  }
}

/* ------------------------------------------------------------------ */
/* Bridge (postMessage RPC to an IRCTC tab running the bookmarklet)    */
/* ------------------------------------------------------------------ */

export type BridgeStatus = "idle" | "waiting" | "connected" | "lost";

const IRCTC_ORIGIN_RE = /^https:\/\/(www\.)?irctc\.co\.in$/;

interface Pending {
  resolve: (r: RawResponse) => void;
  reject: (e: Error) => void;
  timer: number;
}

class BridgeManager {
  status: BridgeStatus = "idle";
  private target: Window | null = null;
  private targetOrigin: string = IRCTC_ORIGIN;
  private seq = 0;
  private lastSeen = 0;
  private pending = new Map<string, Pending>();
  private pongWaiters = new Set<() => void>();
  private subs = new Set<() => void>();
  private started = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("message", this.onMessage);

    // This page may have been opened *by* the bookmarklet from an IRCTC tab.
    if (window.opener && location.hash.includes("bridge")) {
      const opener = window.opener as Window;
      let tries = 0;
      this.setStatus("waiting");
      const ping = () => {
        if (this.status === "connected" || tries++ > 25) {
          if (this.status !== "connected") this.setStatus("idle");
          return;
        }
        try {
          opener.postMessage({ __icb: 1, type: "ping" }, "*");
        } catch {
          /* opener gone */
        }
        window.setTimeout(ping, 400);
      };
      ping();
    }
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  private setStatus(s: BridgeStatus) {
    if (this.status === s) return;
    this.status = s;
    this.subs.forEach((fn) => fn());
  }

  isConnected() {
    if (this.status !== "connected" || !this.target) return false;
    try {
      if (this.target.closed) {
        this.setStatus("lost");
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  }

  /** Opens the IRCTC site in a named tab so the bookmarklet can call back. */
  openIrctcTab() {
    const w = window.open(OFFICIAL_CHART_URL, "irctc_chart_bridge");
    if (w && this.status !== "connected") this.setStatus("waiting");
    return w;
  }

  disconnect() {
    this.target = null;
    this.setStatus("idle");
  }

  private onMessage = (ev: MessageEvent) => {
    if (!IRCTC_ORIGIN_RE.test(ev.origin)) return;
    const m = ev.data as
      | { __icb?: number; type?: string; id?: string; status?: number; text?: string; error?: string }
      | null;
    if (!m || m.__icb !== 1) return;
    this.lastSeen = Date.now();

    if (m.type === "ready" || m.type === "pong") {
      if (ev.source) this.target = ev.source as Window;
      this.targetOrigin = ev.origin;
      this.pongWaiters.forEach((fn) => fn());
      this.pongWaiters.clear();
      this.setStatus("connected");
      if (location.hash.includes("bridge")) {
        history.replaceState(null, "", location.pathname + location.search);
      }
      return;
    }

    if (m.type === "res" && m.id) {
      const p = this.pending.get(m.id);
      if (!p) return;
      window.clearTimeout(p.timer);
      this.pending.delete(m.id);
      if (m.error) p.reject(new ConnectionError(`IRCTC tab could not complete the request: ${m.error}`, false));
      else p.resolve({ status: m.status ?? 0, text: m.text ?? "", via: "bridge" });
    }
  };

  /** Resolves true if the IRCTC tab answers a ping within the timeout. */
  ping(timeoutMs = 2500): Promise<boolean> {
    const target = this.target;
    if (!target) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const onPong = () => {
        if (done) return;
        done = true;
        resolve(true);
      };
      this.pongWaiters.add(onPong);
      window.setTimeout(() => {
        if (done) return;
        done = true;
        this.pongWaiters.delete(onPong);
        resolve(false);
      }, timeoutMs);
      try {
        target.postMessage({ __icb: 1, type: "ping" }, this.targetOrigin);
      } catch {
        /* ignore */
      }
    });
  }

  async request(req: ApiRequest): Promise<RawResponse> {
    if (!this.isConnected()) {
      throw new ConnectionError("The IRCTC bridge is not connected.");
    }
    // If we haven't heard from the tab recently, make sure it is still alive
    // (a reload/navigation on the IRCTC tab removes the bridge listener).
    if (Date.now() - this.lastSeen > 15000) {
      const alive = await this.ping();
      if (!alive) {
        this.setStatus("lost");
        throw new ConnectionError(
          "The IRCTC tab stopped responding (it may have been reloaded). Click the bookmarklet on that tab again.",
        );
      }
    }
    const id = `r${Date.now()}_${++this.seq}`;
    const target = this.target!;
    return new Promise<RawResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        this.setStatus("lost");
        reject(new ConnectionError("The IRCTC tab did not respond in time. Click the bookmarklet on that tab again."));
      }, 40000);
      this.pending.set(id, { resolve, reject, timer });
      target.postMessage(
        { __icb: 1, type: "req", id, path: req.path, method: req.method, headers: req.headers ?? {}, body: req.body },
        this.targetOrigin,
      );
    });
  }
}

export const bridge = new BridgeManager();

/** JavaScript that runs on www.irctc.co.in and relays API calls to this app. */
export function bookmarkletCode(appOrigin: string, appUrl: string): string {
  const O = JSON.stringify(appOrigin && appOrigin !== "null" ? appOrigin : "*");
  const U = JSON.stringify(appUrl);
  return (
    `(function(){var O=${O},U=${U};` +
    `if(!/(^|\\.)irctc\\.co\\.in$/.test(location.hostname)){alert('Open www.irctc.co.in in this tab first, then click the bookmark again.');location.href='https://www.irctc.co.in/online-charts/';return;}` +
    `if(!window.__icbOn){window.__icbOn=1;window.addEventListener('message',function(e){` +
    `if(O!=='*'&&e.origin!==O)return;var m=e.data;if(!m||m.__icb!==1||!e.source)return;var s=e.source,t=O==='*'?'*':e.origin;` +
    `if(m.type==='ping'){s.postMessage({__icb:1,type:'pong'},t);return;}` +
    `if(m.type!=='req')return;` +
    `if(typeof m.path!=='string'||!/^\\/(online-charts\\/api\\/|eticketing\\/)/.test(m.path)){s.postMessage({__icb:1,type:'res',id:m.id,error:'Path not allowed'},t);return;}` +
    `fetch(m.path,{method:m.method||'GET',headers:m.headers||{},body:m.body||undefined}).then(function(r){return r.text().then(function(x){s.postMessage({__icb:1,type:'res',id:m.id,status:r.status,text:x},t);});}).catch(function(err){s.postMessage({__icb:1,type:'res',id:m.id,error:String(err)},t);});` +
    `});}` +
    `var b=document.getElementById('__icbB');if(!b){b=document.createElement('div');b.id='__icbB';` +
    `b.style.cssText='position:fixed;z-index:2147483647;left:50%;top:14px;transform:translateX(-50%);background:#0f766e;color:#fff;padding:12px 18px;border-radius:12px;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:90vw;text-align:center';` +
    `document.body.appendChild(b);}` +
    `if(window.opener&&!window.opener.closed){try{window.opener.postMessage({__icb:1,type:'ready'},O);}catch(x){}` +
    `b.textContent='\\u2713 Chart bridge active. Keep this tab open and switch back to the Chart Viewer tab.';}` +
    `else{b.textContent='\\u2713 Chart bridge active. Opening the Chart Viewer\\u2026 keep this tab open.';window.open(U+'#bridge','_blank');}` +
    `})();`
  );
}

export function bookmarkletHref(appOrigin: string, appUrl: string): string {
  return "javascript:" + encodeURIComponent(bookmarkletCode(appOrigin, appUrl));
}

/** A dependency-free Node.js proxy that users can run on their own machine. */
export const LOCAL_PROXY_SCRIPT = `// irctc-proxy.mjs  —  run with:  node irctc-proxy.mjs   (Node 18+)
// Forwards chart requests to www.irctc.co.in from YOUR machine and adds CORS headers.
import http from "node:http";

const PORT = 8787;
const ALLOWED = /^https:\\/\\/www\\.irctc\\.co\\.in\\/(online-charts\\/api|eticketing)\\//;

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept,greq,bmirak");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const target = new URL(req.url, "http://localhost").searchParams.get("url");
  if (!target || !ALLOWED.test(target)) { res.writeHead(400); return res.end("Bad url"); }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Referer: "https://www.irctc.co.in/online-charts/",
    Origin: "https://www.irctc.co.in",
  };
  for (const h of ["content-type", "greq", "bmirak"]) if (req.headers[h]) headers[h] = req.headers[h];

  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
    });
    res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "text/plain" });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502); res.end(String(e));
  }
}).listen(PORT, () => console.log("IRCTC chart proxy running on http://localhost:" + PORT));
`;

export const LOCAL_PROXY_TEMPLATE = "http://localhost:8787/?url={url}";

/* ------------------------------------------------------------------ */
/* Direct / proxy fetch                                                */
/* ------------------------------------------------------------------ */

export function buildProxyUrl(template: string, target: string): string {
  const t = template.trim();
  if (t.includes("{url}")) return t.replace("{url}", encodeURIComponent(target));
  if (t.includes("{raw}")) return t.replace("{raw}", target);
  return t + target;
}

async function fetchText(url: string, req: ApiRequest, via: Via): Promise<RawResponse> {
  let res: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    res = await fetch(url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    });
  } catch (e) {
    const reason = e instanceof DOMException && e.name === "AbortError" ? "timed out" : "was blocked (CORS / network)";
    throw new ConnectionError(`${via === "proxy" ? "Proxy request" : "Direct request to irctc.co.in"} ${reason}.`);
  } finally {
    window.clearTimeout(timer);
  }
  return { status: res.status, text: await res.text(), via };
}

export async function sendRequest(req: ApiRequest, settings: Settings): Promise<RawResponse> {
  const url = IRCTC_ORIGIN + req.path;
  const hasProxy = settings.proxyTemplate.trim().length > 0;

  switch (settings.mode) {
    case "bridge":
      return bridge.request(req);
    case "direct":
      return fetchText(url, req, "direct");
    case "proxy":
      if (!hasProxy) throw new ConnectionError("Proxy mode is selected but no proxy URL is configured.");
      return fetchText(buildProxyUrl(settings.proxyTemplate, url), req, "proxy");
    case "demo":
      throw new ConnectionError("Demo mode does not make network requests.", false);
    case "auto":
    default: {
      if (bridge.isConnected()) {
        try {
          return await bridge.request(req);
        } catch (e) {
          if (!(e instanceof ConnectionError)) throw e;
        }
      }
      if (hasProxy) {
        try {
          return await fetchText(buildProxyUrl(settings.proxyTemplate, url), req, "proxy");
        } catch (e) {
          if (!(e instanceof ConnectionError)) throw e;
        }
      }
      try {
        return await fetchText(url, req, "direct");
      } catch (e) {
        if (!(e instanceof ConnectionError)) throw e;
      }
      throw new ConnectionError(
        "Your browser can't call irctc.co.in directly from this page (IRCTC doesn't allow cross-site requests). Connect the one-click IRCTC bridge to fetch live charts.",
      );
    }
  }
}
