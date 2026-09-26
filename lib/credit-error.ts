/**
 * Detects OpenRouter "no funds left" errors — both an account running out of credits and
 * an API key hitting its configured spending limit, which surface with different wording.
 */
export function isCreditError(message: string): boolean {
  return /insufficient.*credits|out of credits|not enough credits|credits.*required|payment required|spending limit|credit limit|quota exceeded/i.test(
    message
  );
}
