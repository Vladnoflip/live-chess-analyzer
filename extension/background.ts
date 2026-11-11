// Service worker: routes messages between content scripts and the offscreen engine host,
// and caches final results so revisiting a position doesn't restart the engine.
import { loadSettings, onSettingsChanged, type ExtensionSettings } from './shared/settings';
import { isObject, type ContentMessage, type EngineUpdate, type OffscreenCommand, type OffscreenEvent, type TabMessage } from './shared/messages';

const OFFSCREEN_PATH = 'extension/offscreen.html';
const CACHE_LIMIT = 300;

/** key: `${depth}|${multiPv}|${fen}` → final update. Map keeps insertion order, so it doubles as an LRU. */
const cache = new Map<string, EngineUpdate>();
let creating: Promise<void> | null = null;

async function hasOffscreen(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

async function ensureOffscreen(settings: ExtensionSettings): Promise<void> {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Runs the Stockfish chess engine in a Web Worker so analysis continues when the tab is in the background.',
    })
    .then(() => sendToOffscreen({ target: 'offscreen', type: 'configure', threads: settings.threads, hashMb: settings.hashMb, multiPv: settings.multiPv }))
    .finally(() => {
      creating = null;
    });
  await creating;
}

async function sendToOffscreen(cmd: OffscreenCommand): Promise<void> {
  await chrome.runtime.sendMessage(cmd).catch(() => undefined);
}

function sendToTab(tabId: number, msg: TabMessage): void {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {
    // Tab closed or navigated away.
  });
}

function remember(key: string, update: EngineUpdate): void {
  cache.delete(key);
  cache.set(key, update);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/** Search parameters ("depth|multiPv") of each in-flight (tab, fen), used as cache-key prefix. */
const requestedDepth = new Map<string, string>();

async function handleContent(msg: ContentMessage, tabId: number): Promise<void> {
  const settings = await loadSettings();
  if (msg.type === 'stop') {
    if (await hasOffscreen()) await sendToOffscreen({ target: 'offscreen', type: 'stop' });
    return;
  }
  if (!settings.enabled) return;

  const key = `${settings.depth}|${settings.multiPv}|${msg.fen}`;
  const cached = cache.get(key);
  if (cached) {
    remember(key, cached);
    sendToTab(tabId, { type: 'engine-update', update: cached });
    return;
  }
  await ensureOffscreen(settings);
  requestedDepth.set(`${tabId}|${msg.fen}`, `${settings.depth}|${settings.multiPv}`);
  // Cancelled searches never report a final result; drop their stale entries.
  if (requestedDepth.size > CACHE_LIMIT) requestedDepth.delete(requestedDepth.keys().next().value as string);
  await sendToOffscreen({ target: 'offscreen', type: 'analyze', tabId, fen: msg.fen, depth: settings.depth });
}

function handleOffscreen(msg: OffscreenEvent): void {
  if (msg.type === 'engine-error') {
    if (msg.tabId !== null) sendToTab(msg.tabId, { type: 'engine-error', message: msg.message });
    return;
  }
  const { tabId, update } = msg;
  if (update.final) {
    const depth = requestedDepth.get(`${tabId}|${update.fen}`);
    requestedDepth.delete(`${tabId}|${update.fen}`);
    if (depth !== undefined) remember(`${depth}|${update.fen}`, update);
  }
  sendToTab(tabId, { type: 'engine-update', update });
}

chrome.runtime.onMessage.addListener((raw: unknown, sender) => {
  if (!isObject(raw)) return;
  if (raw.target === 'background') {
    handleOffscreen(raw as OffscreenEvent);
  } else if (raw.target === undefined && sender.tab?.id !== undefined) {
    void handleContent(raw as ContentMessage, sender.tab.id);
  }
});

onSettingsChanged((settings) => {
  void hasOffscreen().then((exists) => {
    if (!exists) return;
    void sendToOffscreen({ target: 'offscreen', type: 'configure', threads: settings.threads, hashMb: settings.hashMb, multiPv: settings.multiPv });
    if (!settings.enabled) void sendToOffscreen({ target: 'offscreen', type: 'stop' });
  });
});
