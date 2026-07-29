type ShutdownSignal = "SIGTERM" | "SIGINT";

type ShutdownServer = {
  close: (callback?: (error?: Error) => void) => unknown;
  listening?: boolean;
};

type SignalProcess = {
  on: (signal: ShutdownSignal, listener: () => void) => unknown;
  off?: (signal: ShutdownSignal, listener: () => void) => unknown;
  removeListener?: (signal: ShutdownSignal, listener: () => void) => unknown;
};

type Timeout = ReturnType<typeof setTimeout>;

export interface GracefulShutdownOptions {
  server: ShutdownServer;
  closeRealtime: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  timeoutMs: number;
  process?: SignalProcess;
  setTimeout?: (handler: () => void, delay: number) => Timeout;
  clearTimeout?: (timeout: Timeout) => void;
  exit?: (code: number) => void;
}

export interface GracefulShutdownHandle {
  readonly isShuttingDown: boolean;
  readonly shutdownPromise: Promise<void> | undefined;
  dispose: () => void;
}

function closeServer(server: ShutdownServer): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    try {
      server.close(finish);
      if (server.listening === false) finish();
    } catch {
      finish();
    }
  });
}

export function installGracefulShutdown({
  server,
  closeRealtime,
  closeDatabase,
  timeoutMs,
  process: signalProcess = process,
  setTimeout: scheduleTimeout = setTimeout,
  clearTimeout: cancelTimeout = clearTimeout,
  exit = (code) => process.exit(code),
}: GracefulShutdownOptions): GracefulShutdownHandle {
  let isShuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;
  let timeout: Timeout | undefined;

  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;

    isShuttingDown = true;
    timeout = scheduleTimeout(() => {
      if (timeout !== undefined) exit(1);
    }, timeoutMs);

    const closeHttp = closeServer(server);
    const closeRealtimePromise = Promise.resolve().then(closeRealtime);
    const closeDatabasePromise = Promise.resolve().then(closeDatabase);

    shutdownPromise = Promise.allSettled([closeHttp, closeRealtimePromise, closeDatabasePromise])
      .then(() => undefined)
      .finally(() => {
        if (timeout !== undefined) {
          cancelTimeout(timeout);
          timeout = undefined;
        }
      });

    return shutdownPromise;
  };

  const onSignal = () => {
    void shutdown();
  };

  signalProcess.on("SIGTERM", onSignal);
  signalProcess.on("SIGINT", onSignal);

  return {
    get isShuttingDown() {
      return isShuttingDown;
    },
    get shutdownPromise() {
      return shutdownPromise;
    },
    dispose() {
      if (signalProcess.off) {
        signalProcess.off("SIGTERM", onSignal);
        signalProcess.off("SIGINT", onSignal);
        return;
      }

      signalProcess.removeListener?.("SIGTERM", onSignal);
      signalProcess.removeListener?.("SIGINT", onSignal);
    },
  };
}
