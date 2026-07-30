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
const MAX_COORDINATION_ID_LENGTH = 256;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_COORDINATION_ID_LENGTH;
}

export function createRefreshCoordinator(options: CoordinatorOptions): RefreshCoordinatorHandle {
  const claimWindowMs = options.claimWindowMs ?? 25;
  const leaseMs = options.leaseMs ?? 10_000;
  const resultTtlMs = Math.max(50, claimWindowMs * 4);
  const now = options.now ?? Date.now;
  let sequence = 0;
  let stateGeneration = 0;
  let disposed = false;
  let candidateClaimId: string | undefined;
  let localOwner: { generation: number; claimId: string; leaseUntil: number; promise: Promise<boolean> } | undefined;
  let remoteOwner: { participantId: string; claimId: string; leaseUntil: number } | undefined;
  let recentResult: { claimId: string; success: boolean; validUntil: number } | undefined;
  let remoteWaiters = new Map<string, Set<(result: boolean | undefined) => void>>();

  const nextId = (kind: "probe" | "claim") => `${options.participantId}:${kind}:${++sequence}`;
  const post = (message: RefreshCoordinationPayload) => {
    options.channel.postMessage({ protocol: PROTOCOL, ...message } as RefreshCoordinationMessage);
  };
  const boundedTimestamp = (value: unknown, maximumLifetime: number): number | undefined => {
    const currentTime = now();
    if (typeof value !== "number" || !Number.isFinite(value) || value <= currentTime) return undefined;
    return Math.min(value, currentTime + maximumLifetime);
  };
  const normalizeMessage = (value: unknown): RefreshCoordinationMessage | undefined => {
    if (!isRecord(value)
      || value.protocol !== PROTOCOL
      || !isCoordinationId(value.participantId)
      || typeof value.type !== "string") return undefined;

    if (value.type === "probe") {
      if (!isCoordinationId(value.requestId)) return undefined;
      return {
        protocol: PROTOCOL,
        type: "probe",
        participantId: value.participantId,
        requestId: value.requestId,
      };
    }

    if (value.type === "claim" || value.type === "owner") {
      const leaseUntil = boundedTimestamp(value.leaseUntil, leaseMs);
      if (!isCoordinationId(value.claimId) || leaseUntil === undefined) return undefined;
      return {
        protocol: PROTOCOL,
        type: value.type,
        participantId: value.participantId,
        claimId: value.claimId,
        leaseUntil,
      };
    }

    if (value.type === "result") {
      const validUntil = boundedTimestamp(value.validUntil, resultTtlMs);
      if (!isCoordinationId(value.claimId)
        || typeof value.success !== "boolean"
        || validUntil === undefined) return undefined;
      return {
        protocol: PROTOCOL,
        type: "result",
        participantId: value.participantId,
        claimId: value.claimId,
        success: value.success,
        validUntil,
      };
    }

    return undefined;
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
  const settleRemoteWaiters = (claimId: string, result: boolean | undefined) => {
    const waiters = remoteWaiters.get(claimId);
    if (!waiters) return;
    remoteWaiters.delete(claimId);
    for (const waiter of waiters) waiter(result);
  };
  const settleAllRemoteWaiters = () => {
    const claimIds = [...remoteWaiters.keys()];
    for (const claimId of claimIds) settleRemoteWaiters(claimId, undefined);
  };
  const waitForRemote = (owner: { claimId: string; leaseUntil: number }): Promise<boolean | undefined> =>
    new Promise((resolve) => {
      const timeout = Math.max(0, owner.leaseUntil - now());
      const timer = setTimeout(() => {
        const waiters = remoteWaiters.get(owner.claimId);
        waiters?.delete(waiter);
        if (waiters?.size === 0) remoteWaiters.delete(owner.claimId);
        if (remoteOwner?.claimId === owner.claimId) remoteOwner = undefined;
        resolve(undefined);
      }, timeout);
      const waiter = (result: boolean | undefined) => {
        clearTimeout(timer);
        resolve(result);
      };
      const waiters = remoteWaiters.get(owner.claimId) ?? new Set();
      waiters.add(waiter);
      remoteWaiters.set(owner.claimId, waiters);
    });

  const unsubscribe = options.channel.subscribe((value) => {
    const message = normalizeMessage(value);
    if (disposed || !message || message.participantId === options.participantId) return;

    if (message.type === "probe") {
      if (localOwner && localOwner.generation === stateGeneration && localOwner.leaseUntil > now()) {
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
      if (localOwner && localOwner.generation === stateGeneration && localOwner.leaseUntil > now()) {
        post({
          type: "owner",
          participantId: options.participantId,
          claimId: localOwner.claimId,
          leaseUntil: localOwner.leaseUntil,
        });
        return;
      }
      const activeRemote = validRemoteOwner();
      if ((!candidateClaimId || message.claimId < candidateClaimId)
        && (!activeRemote || message.claimId < activeRemote.claimId)) {
        remoteOwner = {
          participantId: message.participantId,
          claimId: message.claimId,
          leaseUntil: message.leaseUntil,
        };
      }
      return;
    }

    if (message.type === "owner") {
      if (localOwner && localOwner.generation === stateGeneration && localOwner.leaseUntil > now()) {
        post({
          type: "owner",
          participantId: options.participantId,
          claimId: localOwner.claimId,
          leaseUntil: localOwner.leaseUntil,
        });
        return;
      }
      if (candidateClaimId && candidateClaimId < message.claimId) return;
      remoteOwner = {
        participantId: message.participantId,
        claimId: message.claimId,
        leaseUntil: message.leaseUntil,
      };
      return;
    }

    const matchesRemoteOwner = remoteOwner?.claimId === message.claimId;
    const hasMatchingWaiters = remoteWaiters.has(message.claimId);
    if (!matchesRemoteOwner && !hasMatchingWaiters) return;

    settleRemoteWaiters(message.claimId, message.success);
    if (localOwner || !matchesRemoteOwner) return;
    recentResult = {
      claimId: message.claimId,
      success: message.success,
      validUntil: message.validUntil,
    };
    remoteOwner = undefined;
  });

  const run: RefreshCoordinator = async (refresh) => {
    if (disposed) return false;
    const generation = stateGeneration;
    if (localOwner?.generation === generation) return localOwner.promise;
    const recent = validRecentResult();
    if (recent) return recent.success;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      post({ type: "probe", participantId: options.participantId, requestId: nextId("probe") });
      await delay(claimWindowMs);
      if (disposed || generation !== stateGeneration) return false;

      const probedOwner = validRemoteOwner();
      if (probedOwner) {
        const outcome = await waitForRemote(probedOwner);
        if (disposed || generation !== stateGeneration) return false;
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
      if (disposed || generation !== stateGeneration) return false;

      const resultAfterClaim = validRecentResult();
      if (resultAfterClaim) {
        candidateClaimId = undefined;
        return resultAfterClaim.success;
      }
      const claimedByAnother = validRemoteOwner();
      if (claimedByAnother && claimedByAnother.claimId !== claimId) {
        candidateClaimId = undefined;
        const outcome = await waitForRemote(claimedByAnother);
        if (disposed || generation !== stateGeneration) return false;
        if (outcome !== undefined) return outcome;
        continue;
      }

      candidateClaimId = undefined;
      const ownerPromise = Promise.resolve().then(async () => {
        post({ type: "owner", participantId: options.participantId, claimId, leaseUntil });
        if (generation !== stateGeneration || disposed) return false;
        let success = false;
        try {
          success = await refresh();
          return success;
        } finally {
          if (generation === stateGeneration && !disposed) {
            const validUntil = now() + resultTtlMs;
            recentResult = { claimId, success, validUntil };
            post({ type: "result", participantId: options.participantId, claimId, success, validUntil });
            if (localOwner?.generation === generation && localOwner.claimId === claimId) localOwner = undefined;
          }
        }
      });
      localOwner = { generation, claimId, leaseUntil, promise: ownerPromise };
      return ownerPromise;
    }

    return false;
  };

  const reset = () => {
    stateGeneration += 1;
    candidateClaimId = undefined;
    localOwner = undefined;
    remoteOwner = undefined;
    recentResult = undefined;
    settleAllRemoteWaiters();
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
