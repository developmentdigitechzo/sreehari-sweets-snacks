/**
 * The admin saves an uploaded picture with the address it was uploaded from, which is usually "localhost". On a phone that means the
 * phone itself, so the picture never loads. Pictures served by the store's own API (/uploads/...) are fetched from the API address the
 * app really uses. Pictures from any other site are left alone.
 */
export function rewriteLocalUploadUrl(uri: string, apiUrl: string): string {
  const m = uri.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/uploads\/.*)$/);
  if (!m) return uri;
  try { return new URL(apiUrl).origin + m[1]; } catch { return uri; }
}
