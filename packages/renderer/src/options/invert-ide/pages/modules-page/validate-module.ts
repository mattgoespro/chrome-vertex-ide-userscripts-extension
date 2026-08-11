/**
 * Validates that a CDN URL is reachable.
 */
export async function validateCdnUrl(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { method: "HEAD" });

    if (!response.ok) {
      return `CDN returned ${response.status} ${response.statusText}`;
    }

    return undefined;
  } catch {
    return "Failed to fetch module from CDN URL";
  }
}

/**
 * Validates that type definitions exist for the given package name on
 * DefinitelyTyped (unpkg, then jsDelivr).
 */
export async function validateTypesUrl(
  packageName: string
): Promise<string | undefined> {
  try {
    const response = await fetch(
      `https://unpkg.com/@types/${packageName}/index.d.ts`,
      { method: "HEAD" }
    );

    if (response.ok) {
      return undefined;
    }
  } catch {
    // Fall through to jsdelivr fallback
  }

  try {
    const response = await fetch(
      `https://cdn.jsdelivr.net/npm/@types/${packageName}/index.d.ts`,
      { method: "HEAD" }
    );

    if (response.ok) {
      return undefined;
    }

    return `No @types/${packageName} package found on DefinitelyTyped`;
  } catch {
    return "Failed to check type definitions availability";
  }
}
