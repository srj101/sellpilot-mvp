/**
 * Everything a bug report needs that the merchant should never have to type.
 *
 * A report saying "the bot is not working properly" is unactionable. The same sentence
 * with the page, the business and — above all — the conversation id attached is usually a
 * five-minute fix. Merchants are not going to supply that themselves, and asking them to
 * would just mean fewer reports, so the client collects it silently at submit time.
 */

/** Rolling buffer of recent console errors. Nothing here leaves the browser unless the
 * merchant actually files a report. */
const MAX_BUFFERED_ERRORS = 10;
const errorBuffer: string[] = [];
let installed = false;

/**
 * Redact anything credential-shaped before it is stored.
 *
 * Browser errors quote request URLs and response bodies, which is exactly where an API key
 * or a session token ends up. A bug report must not become the thing that leaks one.
 * Pattern-matching is imperfect by nature — this reduces the risk, it does not remove it,
 * which is also why only console.error is captured and never full request payloads.
 */
function scrub(text: string): string {
  return text
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[redacted-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9._-]{10,}/g, "[redacted-jwt]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted-hex]")
    .replace(/([?&](?:token|key|secret|password|access_token)=)[^&\s]+/gi, "$1[redacted]")
    // Anything long and high-entropy, for secrets with no recognisable prefix — the Meta
    // webhook verify token is a bare 43-character base64url string and matched none of
    // the rules above. Deliberately narrow: requires upper AND lower AND digit, so uuids
    // (lowercase hex) and platform ids (digits only) are untouched.
    .replace(/\b(?=[A-Za-z0-9_-]{24,})(?=[^\s]*[a-z])(?=[^\s]*[A-Z])(?=[^\s]*\d)[A-Za-z0-9_-]{24,}\b/g, "[redacted-token]")
    .slice(0, 1000);
}

/**
 * Start buffering console errors. Called once from the dashboard layout.
 *
 * Wraps rather than replaces console.error, so the browser devtools output a developer
 * relies on is unchanged.
 */
export function installConsoleErrorBuffer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const line = args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
        .join(" ");
      errorBuffer.push(`${new Date().toISOString().slice(11, 19)} ${scrub(line)}`);
      if (errorBuffer.length > MAX_BUFFERED_ERRORS) errorBuffer.shift();
    } catch {
      // Buffering a log line must never break the page it came from.
    }
    original(...args);
  };
}

export interface BugContext {
  pageUrl?: string;
  threadId?: string;
  userAgent?: string;
  viewport?: string;
  consoleErrors?: string[];
}

/**
 * Snapshot the current page.
 *
 * threadId is pulled from the Inbox's own `?thread=` param. It is the single most valuable
 * field in a report: most complaints are about something the agent said, and without it
 * there is no way to find which conversation they mean.
 */
export function captureBugContext(): BugContext {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);

  return {
    // Path only — the query string can carry ids we do not need, and the origin is known.
    pageUrl: window.location.pathname,
    threadId: params.get("thread") ?? params.get("threadId") ?? undefined,
    userAgent: navigator.userAgent.slice(0, 500),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    consoleErrors: errorBuffer.length > 0 ? [...errorBuffer] : undefined,
  };
}
