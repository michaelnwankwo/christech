// src/lib/security/next-param.ts
// Open-redirect guard for ?next= on auth pages: only same-origin relative
// paths survive — "//evil.com" and absolute URLs are refused.

export function sanitizeNext(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || /^\/\/.*/.test(value)) return "/";
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}
