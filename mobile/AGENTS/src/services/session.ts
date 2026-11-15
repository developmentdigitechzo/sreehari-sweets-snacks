/**
 * Holds the current access token in memory for API clients. Kept in its own tiny module so network code
 * never imports the stores (that created an import cycle). useAuth sets it on sign-in / restore / sign-out.
 * The token is never logged.
 */
let token: string | null = null;
let onRejected: (() => void) | null = null;

export const session = {
  get: () => token,
  set: (t: string | null) => {
    token = t;
  },
  /** useAuth registers what to do when the server refuses the token (expired after 12 hours, account blocked, or not a real token). */
  onRejected: (fn: () => void) => {
    onRejected = fn;
  },
  /** Network code calls this when a signed-in request came back 401. */
  rejected: () => onRejected?.(),
};
