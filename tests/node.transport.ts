import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { UciTransport } from '../src/services/engine.transport';

const require = createRequire(import.meta.url);

/** Path to the same WASM build the browser uses; it doubles as a stdin/stdout UCI CLI under Node. */
export function enginePath(): string {
  const pkg = require.resolve('stockfish/package.json');
  return join(dirname(pkg), 'bin', 'stockfish-18-lite-single.js');
}

/** Runs Stockfish.js as a Node child process — lets tests exercise the real EngineService. */
export class NodeTransport implements UciTransport {
  private readonly proc: ChildProcessWithoutNullStreams;
  readonly sent: string[] = [];

  constructor(path = enginePath()) {
    this.proc = spawn(process.execPath, [path], { stdio: 'pipe' });
  }

  send(command: string): void {
    this.sent.push(command);
    this.proc.stdin.write(`${command}\n`);
  }

  onLine(listener: (line: string) => void): void {
    createInterface({ input: this.proc.stdout }).on('line', listener);
  }

  onError(listener: (error: Error) => void): void {
    this.proc.on('error', listener);
  }

  terminate(): void {
    this.proc.kill();
  }
}
