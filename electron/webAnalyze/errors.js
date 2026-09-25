export class FormAssistantError extends Error {
  /**
   * @param {string} code
   * @param {string} message User-facing message; never include stack traces or internals.
   */
  constructor(code, message) {
    super(message);
    this.name = "FormAssistantError";
    this.code = code;
  }
}

const NET_ERROR_RULES = [
  {
    test: /ERR_CERT_|ERR_SSL_|SSL_|CERT_/i,
    code: "SSL_ERROR",
    message: "The website's security certificate is invalid or untrusted, so it was not opened.",
  },
  {
    test: /ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ENOTFOUND/i,
    code: "UNREACHABLE",
    message: "The website could not be found. Check the address and your internet connection.",
  },
  {
    test: /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_ADDRESS_UNREACHABLE|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_FAILED|ERR_EMPTY_RESPONSE/i,
    code: "UNREACHABLE",
    message: "The website is unreachable right now. Try again later.",
  },
  {
    test: /ERR_TOO_MANY_REDIRECTS/i,
    code: "TOO_MANY_REDIRECTS",
    message: "The website redirected too many times and was not analyzed.",
  },
  {
    test: /ERR_BLOCKED_BY_CLIENT|ERR_ACCESS_DENIED|ERR_UNSAFE_REDIRECT|ERR_UNSAFE_PORT/i,
    code: "UNSUPPORTED_URL",
    message: "The website tried to load a blocked or unsupported address.",
  },
  {
    test: /ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|Timeout .*exceeded/i,
    code: "TIMEOUT",
    message: "The website took too long to load.",
  },
  {
    test: /ERR_ABORTED|ERR_FAILED|ERR_INVALID_RESPONSE|ERR_HTTP2/i,
    code: "PAGE_LOAD_FAILED",
    message: "The page stopped loading before it could be analyzed.",
  },
];

/**
 * Converts any thrown value into a FormAssistantError with a friendly message.
 * @param {unknown} error
 * @returns {FormAssistantError}
 */
export function toFormAssistantError(error) {
  if (error instanceof FormAssistantError) {
    return error;
  }
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (error instanceof Error && error.name === "TimeoutError") {
    return new FormAssistantError("TIMEOUT", "The website took too long to load.");
  }
  for (const rule of NET_ERROR_RULES) {
    if (rule.test.test(raw)) {
      return new FormAssistantError(rule.code, rule.message);
    }
  }
  if (/Target (page, context or browser )?closed|Browser closed|browser has been closed/i.test(raw)) {
    return new FormAssistantError("CANCELLED", "The analysis was stopped.");
  }
  return new FormAssistantError(
    "BROWSER_ERROR",
    "Something went wrong while analyzing the page. Try again."
  );
}
