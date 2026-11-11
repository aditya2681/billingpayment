export function signInErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/TooManyFailedAttempts|rate.?limit|too many/i.test(message)) {
    return "Too many sign-in attempts. Wait a few minutes and try again.";
  }
  if (/network|failed to fetch|offline|connection/i.test(message)) {
    return "Could not connect. Check your internet connection and try again.";
  }
  return "The username or password is incorrect. Please try again.";
}

export function userErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const businessMessage = error.message.match(/Uncaught (?:Error|ConvexError):\s*([^\n]+)/)?.[1];
  if (businessMessage) return businessMessage.trim();
  return /\[CONVEX|\[Request ID:|Server Error|Called by client/i.test(error.message) ? fallback : error.message;
}
