const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_TOKENS_PER_INTERVAL = 5;

type PendingResolver = () => void;

interface RateLimiterState {
  intervalMs: number;
  maxTokens: number;
  queue: PendingResolver[];
  refillAmount: number;
  refillTimer: NodeJS.Timeout | null;
  tokens: number;
}

export interface CreateRateLimiterOptions {
  intervalMs?: number;
  maxTokens?: number;
  tokensPerInterval?: number;
}

export interface RateLimiter {
  acquire: () => Promise<void>;
  getPendingCount: () => number;
  schedule: <TResult>(task: () => Promise<TResult> | TResult) => Promise<TResult>;
}

function scheduleFlush(state: RateLimiterState): void {
  if (state.refillTimer) {
    return;
  }

  state.refillTimer = setInterval(() => {
    state.tokens = Math.min(state.tokens + state.refillAmount, state.maxTokens);

    while (state.tokens > 0 && state.queue.length > 0) {
      const resolve = state.queue.shift();
      state.tokens -= 1;
      if (resolve) {
        resolve();
      }
    }

    if (state.queue.length === 0 && state.tokens === state.maxTokens) {
      const timer = state.refillTimer;
      if (timer) {
        clearInterval(timer);
        state.refillTimer = null;
      }
    }
  }, state.intervalMs);
}

export function createRateLimiter({
  tokensPerInterval = DEFAULT_TOKENS_PER_INTERVAL,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxTokens = tokensPerInterval
}: CreateRateLimiterOptions = {}): RateLimiter {
  const state = {
    tokens: tokensPerInterval,
    maxTokens,
    intervalMs,
    refillAmount: tokensPerInterval,
    queue: [],
    refillTimer: null
  } as RateLimiterState;

  function tryConsume(): boolean {
    if (state.tokens > 0) {
      state.tokens -= 1;
      scheduleFlush(state);
      return true;
    }
    scheduleFlush(state);
    return false;
  }

  async function acquire(): Promise<void> {
    if (tryConsume()) {
      return;
    }

    await new Promise<void>((resolve) => {
      state.queue.push(resolve);
    });
  }

  return {
    acquire,
    async schedule<TResult>(task: () => Promise<TResult> | TResult): Promise<TResult> {
      await acquire();

      try {
        const result = await task();
        return result;
      }
      finally {
        scheduleFlush(state);
      }
    },
    getPendingCount() {
      return state.queue.length;
    }
  };
}
