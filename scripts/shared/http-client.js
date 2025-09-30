import {setTimeout as delay} from "node:timers/promises";
import process from "node:process";

const DEFAULT_USER_AGENT = "MagicMirror-Pipeline/0.1 (+https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules)";
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1500;

function buildHeaders (baseHeaders = {}, overrides = {}) {
  const normalizedBase = {...baseHeaders};
  const merged = {...normalizedBase, ...overrides};
  const pairs = Object.entries(merged)
    .filter((entry) => typeof entry[1] !== "undefined" && entry[1] !== null)
    .map((entry) => {
      const [key, value] = entry;
      return [key.toLowerCase() === "user-agent" ? "user-agent" : key, value];
    });

  return Object.fromEntries(pairs);
}

export function createHttpClient ({userAgent = DEFAULT_USER_AGENT, defaultHeaders = {}, rateLimiter, maxRetries = DEFAULT_RETRY_COUNT, retryBackoffMs = DEFAULT_RETRY_BACKOFF_MS} = {}) {
  const mergedDefaults = buildHeaders({"user-agent": userAgent}, defaultHeaders);

  async function performRequest (url, options = {}) {
    const {
      method = "GET",
      headers = {},
      body,
      signal,
      retries = maxRetries,
      retryDelayMs = retryBackoffMs,
      ...fetchOverrides
    } = options;
    const mergedHeaders = buildHeaders(mergedDefaults, headers);

    const execute = async () => {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        body,
        signal,
        ...fetchOverrides
      });
      return response;
    };

    let attempt = 0;

    while (true) {
      if (rateLimiter) {
        await rateLimiter.acquire();
      }

      try {
        const response = await execute();

        if (!response.ok && attempt < retries && shouldRetry(response.status)) {
          attempt += 1;
          const delayMs = retryDelayMs * attempt;
          await delay(delayMs, null, {signal});
        }

        if (response.ok || attempt >= retries || !shouldRetry(response.status)) {
          return response;
        }
      } catch (error) {
        if (attempt >= retries || (signal?.aborted ?? false)) {
          throw error;
        }
        attempt += 1;
        const delayMs = retryDelayMs * attempt;
        await delay(delayMs, null, {signal});
      }
    }
  }

  async function requestJson (url, options = {}) {
    const response = await performRequest(url, options);
    const text = await response.text();
    try {
      const parsed = text.length > 0 ? JSON.parse(text) : null;
      return {
        status: response.status,
        ok: response.ok,
        data: parsed,
        headers: response.headers
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const err = new Error(`Failed to parse JSON from ${url}: ${message}`);
      err.cause = error;
      err.responseText = text;
      throw err;
    }
  }

  async function requestText (url, options = {}) {
    const response = await performRequest(url, options);
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      data: text,
      headers: response.headers
    };
  }

  return {
    request: performRequest,
    getJson: requestJson,
    getText: requestText,
    withDefaults (overrides) {
      return createHttpClient({
        userAgent,
        defaultHeaders: buildHeaders(mergedDefaults, overrides.defaultHeaders ?? {}),
        rateLimiter: overrides.rateLimiter ?? rateLimiter,
        maxRetries: overrides.maxRetries ?? maxRetries,
        retryBackoffMs: overrides.retryBackoffMs ?? retryBackoffMs
      });
    }
  };
}

function shouldRetry (status) {
  if (status >= 500) {
    return true;
  }

  if (status === 429) {
    return true;
  }

  return false;
}

export function buildAuthHeadersFromEnv (env = process.env) {
  if (env.GITHUB_TOKEN) {
    return {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`
    };
  }

  return {};
}
