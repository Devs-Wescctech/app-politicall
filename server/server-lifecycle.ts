type ShutdownSignal = "SIGTERM" | "SIGINT";

type ShutdownServer = {
  close: (callback?: (error?: Error) => void) => unknown;
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

function isServerNotRunningError(error: unknown): boolean {
  return error instanceof Error
    && (error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING";
}

function closeServer(server: ShutdownServer): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      server.close((error) => {
        if (!error || isServerNotRunningError(error)) {
          resolve();
          return;
        }
        reject(error);
      });
    } catch (error) {
      if (isServerNotRunningError(error)) {
        resolve();
        return;
      }
      reject(error);
    }
  });
}

function runCleanup(cleanup: () => Promise<void>): Promise<void> {
  try {
    return Promise.resolve(cleanup());
  } catch (error) {
    return Promise.reject(error);
  }
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
    const closeRealtimePromise = runCleanup(closeRealtime);

    shutdownPromise = Promise.allSettled([closeHttp, closeRealtimePromise])
      .then(() => Promise.allSettled([runCleanup(closeDatabase)]))
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
