const SESSION_KEY = "injectCssBookmarks";

type CssBookmarks = Record<string, string>;

let memoryBookmarks: CssBookmarks | null = null;
let loadPromise: Promise<CssBookmarks> | null = null;

function bookmarkKey(tabId: number, scriptId: string): string {
  return `${tabId}:${scriptId}`;
}

async function readBookmarks(): Promise<CssBookmarks> {
  if (memoryBookmarks) {
    return memoryBookmarks;
  }

  if (!loadPromise) {
    loadPromise = chrome.storage.session
      .get(SESSION_KEY)
      .then((result) => {
        memoryBookmarks = (result[SESSION_KEY] as CssBookmarks | undefined) ?? {};
        return memoryBookmarks;
      })
      .catch((error) => {
        console.warn("Failed to load CSS inject bookmarks:", error);
        memoryBookmarks = {};
        return memoryBookmarks;
      })
      .finally(() => {
        loadPromise = null;
      });
  }

  return loadPromise;
}

async function writeBookmarks(bookmarks: CssBookmarks): Promise<void> {
  memoryBookmarks = bookmarks;

  try {
    await chrome.storage.session.set({ [SESSION_KEY]: bookmarks });
  } catch (error) {
    console.warn("Failed to persist CSS inject bookmarks:", error);
  }
}

export async function getCssBookmark(
  tabId: number,
  scriptId: string
): Promise<string | undefined> {
  const bookmarks = await readBookmarks();
  return bookmarks[bookmarkKey(tabId, scriptId)];
}

export async function setCssBookmark(
  tabId: number,
  scriptId: string,
  css: string
): Promise<void> {
  const bookmarks = { ...(await readBookmarks()) };
  bookmarks[bookmarkKey(tabId, scriptId)] = css;
  await writeBookmarks(bookmarks);
}

export async function clearCssBookmark(
  tabId: number,
  scriptId: string
): Promise<void> {
  const bookmarks = { ...(await readBookmarks()) };
  const key = bookmarkKey(tabId, scriptId);

  if (!(key in bookmarks)) {
    return;
  }

  delete bookmarks[key];
  await writeBookmarks(bookmarks);
}

export async function clearCssBookmarksForTab(tabId: number): Promise<void> {
  const prefix = `${tabId}:`;
  const bookmarks = { ...(await readBookmarks()) };
  let changed = false;

  for (const key of Object.keys(bookmarks)) {
    if (key.startsWith(prefix)) {
      delete bookmarks[key];
      changed = true;
    }
  }

  if (changed) {
    await writeBookmarks(bookmarks);
  }
}
