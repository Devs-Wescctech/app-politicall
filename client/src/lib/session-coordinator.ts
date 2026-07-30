export type RefreshCoordinationMessage =
  | { protocol: "politicall-session-v2"; type: "probe"; participantId: string; requestId: string }
  | { protocol: "politicall-session-v2"; type: "claim"; participantId: string; claimId: string; leaseUntil: number }
  | { protocol: "politicall-session-v2"; type: "owner"; participantId: string; claimId: string; leaseUntil: number }
  | { protocol: "politicall-session-v2"; type: "result"; participantId: string; claimId: string; success: boolean; validUntil: number };

export type RefreshCoordinationChannel = {
  postMessage(message: RefreshCoordinationMessage): void;
  subscribe(listener: (message: RefreshCoordinationMessage) => void): () => void;
};

export type RefreshCoordinator = (refresh: () => Promise<boolean>) => Promise<boolean>;

export type RefreshCoordinatorHandle = {
  run: RefreshCoordinator;
  reset(): void;
  dispose(): void;
};

type RefreshCoordinationPayload<
  Message extends RefreshCoordinationMessage = RefreshCoordinationMessage,
> = Message extends RefreshCoordinationMessage ? Omit<Message, "protocol"> : never;

type CoordinatorOptions = {
  channel: RefreshCoordinationChannel;
  participantId: string;
  claimWindowMs?: number;
  leaseMs?: number;
  now?: () => number;
};

const PROTOCOL = "politicall-session-v2";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createRefreshCoordinator(options: CoordinatorOptions): RefreshCoordinatorHandle {
  const claimWindowMs = options.claimWindowMs ?? 25;
  const leaseMs = options.leaseMs ?? 10_000;
  const now = options.now ?? Date.now;
  let sequence = 0;
  let disposed = false;
  let candidateClaimId: string | undefined;
  let localOwner: { claimId: string; leaseUntil: number; promise: Promise<boolean> } | undefined;
  let remoteOwner: { participantId: string; claimId: string; leaseUntil: number } | undefined;
  let recentResult: { success: boolean; validUntil: number } | undefined;
  let remoteWaiters = new Set<(result: boolean | undefined) => void>();

  const nextId = (kind: "probe" | "claim") => `${options.participantId}:${kind}:${++sequence}`;
  const post = (message: RefreshCoordinationPayload) => {
    options.channel.postMessage({ protocol: PROTOCOL, ...message } as RefreshCoordinationMessage);
  };
  const validRemoteOwner = () => {
    if (remoteOwner && remoteOwner.leaseUntil > now()) return remoteOwner;
    remoteOwner = undefined;
    return undefined;
  };
  const validRecentResult = () => {
    if (recentResult && recentResult.validUntil > now()) return recentResult;
    recentResult = undefined;
    return undefined;
  };
  const settleRemoteWaiters = (result: boolean | undefined) => {
    const waiters = remoteWaiters;
    remoteWaiters = new Set();
    for (const waiter of waiters) waiter(result);
  };
  const waitForRemote = (owner: { claimId: string; leaseUntil: number }): Promise<boolean | undefined> =>
    new Promise((resolve) => {
      const timeout = Math.max(0, owner.leaseUntil - now());
      const timer = setTimeout(() => {
        remoteWaiters.delete(waiter);
        if (remoteOwner?.claimId === owner.claimId) remoteOwner = undefined;
        resolve(undefined);
      }, timeout);
      const waiter = (result: boolean | undefined) => {
        clearTimeout(timer);
        resolve(result);
      };
      remoteWaiters.add(waiter);
    });

  const unsubscribe = options.channel.subscribe((message) => {
    if (disposed || message.protocol !== PROTOCOL || message.participantId === options.participantId) return;

    if (message.type === "probe") {
      if (localOwner && localOwner.leaseUntil > now()) {
        post({
          type: "owner",
          participantId: options.participantId,
          claimId: localOwner.claimId,
          leaseUntil: localOwner.leaseUntil,
        });
      }
      return;
    }

    if (message.type === "claim") {
      if (localOwner && localOwner.leaseUntil > now()) {
        post({
          type: "owner",
          participantId: options.participantId,
          claimId: localOwner.claimId,
          leaseUntil: localOwner.leaseUntil,
        });
        return;
      }
      if (!candidateClaimId || message.claimId < candidateClaimId) {
        remoteOwner = {
          participantId: message.participantId,
          claimId: message.claimId,
          leaseUntil: message.leaseUntil,
        };
      }
      return;
    }

    if (message.type === "owner") {
      remoteOwner = {
        participantId: message.participantId,
        claimId: message.claimId,
        leaseUntil: message.leaseUntil,
      };
      return;
    }

    recentResult = { success: message.success, validUntil: message.validUntil };
    if (!remoteOwner || remoteOwner.claimId === message.claimId) remoteOwner = undefined;
    settleRemoteWaiters(message.success);
  });

  const run: RefreshCoordinator = async (refresh) => {
    if (disposed) return false;
    if (localOwner) return localOwner.promise;
    const recent = validRecentResult();
    if (recent) return recent.success;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      post({ type: "probe", participantId: options.participantId, requestId: nextId("probe") });
      await delay(claimWindowMs);

      const probedOwner = validRemoteOwner();
      if (probedOwner) {
        const outcome = await waitForRemote(probedOwner);
        if (outcome !== undefined) return outcome;
        continue;
      }
      const resultAfterProbe = validRecentResult();
      if (resultAfterProbe) return resultAfterProbe.success;

      const claimId = nextId("claim");
      const leaseUntil = now() + leaseMs;
      candidateClaimId = claimId;
      post({ type: "claim", participantId: options.participantId, claimId, leaseUntil });
      await delay(claimWindowMs);

      const claimedByAnother = validRemoteOwner();
      if (claimedByAnother && claimedByAnother.claimId !== claimId) {
        candidateClaimId = undefined;
        const outcome = await waitForRemote(claimedByAnother);
        if (outcome !== undefined) return outcome;
        continue;
      }

      candidateClaimId = undefined;
      let ownerPromise!: Promise<boolean>;
      ownerPromise = (async () => {
        post({ type: "owner", participantId: options.participantId, claimId, leaseUntil });
        let success = false;
        try {
          success = await refresh();
          return success;
        } finally {
          const validUntil = now() + Math.max(50, claimWindowMs * 4);
          recentResult = { success, validUntil };
          post({ type: "result", participantId: options.participantId, claimId, success, validUntil });
          localOwner = undefined;
        }
      })();
      localOwner = { claimId, leaseUntil, promise: ownerPromise };
      return ownerPromise;
    }

    return false;
  };

  const reset = () => {
    candidateClaimId = undefined;
    remoteOwner = undefined;
    recentResult = undefined;
    settleRemoteWaiters(undefined);
  };

  return {
    run,
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      unsubscribe();
    },
  };
}

export function createBrowserRefreshCoordinator(): RefreshCoordinatorHandle | undefined {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return undefined;
  const broadcastChannel = new BroadcastChannel("politicall-session-refresh");
  const participantId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  const channel: RefreshCoordinationChannel = {
    postMessage: (message) => broadcastChannel.postMessage(message),
    subscribe: (listener) => {
      const handler = (event: MessageEvent<RefreshCoordinationMessage>) => listener(event.data);
      broadcastChannel.addEventListener("message", handler);
      return () => broadcastChannel.removeEventListener("message", handler);
    },
  };
  const coordinator = createRefreshCoordinator({ channel, participantId });
  return {
    ...coordinator,
    dispose() {
      coordinator.dispose();
      broadcastChannel.close();
    },
  };
}
