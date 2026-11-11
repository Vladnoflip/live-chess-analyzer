/** Line-oriented UCI channel. Lets EngineService run on a Web Worker or a Node child process. */
export interface UciTransport {
  send(command: string): void;
  onLine(listener: (line: string) => void): void;
  onError(listener: (error: Error) => void): void;
  terminate(): void;
}

/** Stockfish.js running inside a dedicated Web Worker. */
export class WorkerTransport implements UciTransport {
  private readonly worker: Worker;

  constructor(scriptUrl: string) {
    this.worker = new Worker(scriptUrl);
  }

  send(command: string): void {
    this.worker.postMessage(command);
  }

  onLine(listener: (line: string) => void): void {
    this.worker.addEventListener('message', (e: MessageEvent<unknown>) => {
      if (typeof e.data !== 'string') return;
      for (const line of e.data.split('\n')) if (line.trim()) listener(line);
    });
  }

  onError(listener: (error: Error) => void): void {
    this.worker.addEventListener('error', (e: ErrorEvent) => listener(new Error(e.message || 'Engine worker error')));
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export type EngineFlavor = 'lite-single' | 'lite-multi';

/** Multi-threaded WASM needs SharedArrayBuffer, which browsers expose only to cross-origin-isolated pages. */
export function pickEngineFlavor(): EngineFlavor {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'
    ? 'lite-multi'
    : 'lite-single';
}

export function engineScriptUrl(flavor: EngineFlavor, baseUrl: string): string {
  const file = flavor === 'lite-multi' ? 'stockfish-18-lite.js' : 'stockfish-18-lite-single.js';
  return `${baseUrl.replace(/\/?$/, '/')}engine/${file}`;
}
