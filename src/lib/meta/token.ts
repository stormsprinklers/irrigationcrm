const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { message?: string; type?: string; code?: number };

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: number };

async function graphGetRaw<T>(path: string, params: Record<string, string>): Promise<GraphResult<T>> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as T & { error?: GraphError };

  if (!res.ok || data.error) {
    return {
      ok: false,
      error: data.error?.message ?? `Meta Graph API error (${res.status})`,
      code: data.error?.code,
    };
  }

  return { ok: true, data };
}

export type MetaPageAccount = {
  id: string;
  name: string;
  accessToken: string;
  instagramAccountId: string | null;
};

export type ResolvePageTokenResult = {
  pageToken: string;
  pageName: string | null;
  instagramAccountId: string | null;
  source: "page_token" | "user_token" | "granular_user_token";
};

export type MetaTokenDiagnostics = {
  tokenAppId: string | null;
  expectedAppId: string | null;
  tokenType: string | null;
  tokenValid: boolean | null;
  tokenScopes: string[];
  granularPageIds: string[];
  tokenExpiresAt: string | null;
  meId: string | null;
  meName: string | null;
  managedPages: Array<{ id: string; name: string }>;
  resolvedPageName: string | null;
  postsProbeOk: boolean;
  resolutionMethod: string | null;
  error: string | null;
};

type DebugTokenData = {
  app_id?: string;
  type?: string;
  is_valid?: boolean;
  expires_at?: number;
  scopes?: string[];
  granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
  profile_id?: string;
  error?: GraphError;
};

const PAGE_READ_SCOPES = new Set([
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_manage_metadata",
]);

async function debugAccessToken(
  token: string,
  appId: string,
  appSecret: string
): Promise<DebugTokenData | null> {
  const result = await graphGetRaw<{ data?: DebugTokenData }>("/debug_token", {
    input_token: token,
    access_token: `${appId}|${appSecret}`,
  });

  return result.ok ? (result.data.data ?? null) : null;
}

function granularPageIds(debug: DebugTokenData | null) {
  if (!debug?.granular_scopes) return [];
  const ids = new Set<string>();
  for (const entry of debug.granular_scopes) {
    if (!entry.scope || !PAGE_READ_SCOPES.has(entry.scope)) continue;
    for (const id of entry.target_ids ?? []) ids.add(id);
  }
  return [...ids];
}

function hasBusinessManagement(debug: DebugTokenData | null) {
  return Boolean(debug?.scopes?.includes("business_management"));
}

async function exchangeForLongLivedUserToken(
  userToken: string,
  appId: string,
  appSecret: string
): Promise<string> {
  const result = await graphGetRaw<{ access_token?: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: userToken,
  });

  if (!result.ok || !result.data.access_token) {
    return userToken;
  }

  return result.data.access_token;
}

async function getTokenIdentity(token: string) {
  return graphGetRaw<{ id?: string; name?: string }>("/me", {
    fields: "id,name",
    access_token: token,
  });
}

async function listManagedPages(userToken: string): Promise<GraphResult<MetaPageAccount[]>> {
  const result = await graphGetRaw<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string };
    }>;
  }>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account",
    limit: "100",
    access_token: userToken,
  });

  if (!result.ok) return result;

  const pages = (result.data.data ?? [])
    .filter((page): page is typeof page & { id: string; access_token: string } =>
      Boolean(page.id && page.access_token)
    )
    .map((page) => ({
      id: page.id,
      name: page.name ?? page.id,
      accessToken: page.access_token,
      instagramAccountId: page.instagram_business_account?.id ?? null,
    }));

  return { ok: true, data: pages };
}

async function listBusinessOwnedPages(userToken: string): Promise<GraphResult<MetaPageAccount[]>> {
  const businesses = await graphGetRaw<{
    data?: Array<{ id?: string; name?: string }>;
  }>("/me/businesses", {
    fields: "id,name",
    limit: "25",
    access_token: userToken,
  });

  if (!businesses.ok) return businesses;

  const pages: MetaPageAccount[] = [];

  for (const business of businesses.data.data ?? []) {
    if (!business.id) continue;

    const owned = await graphGetRaw<{
      data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
        instagram_business_account?: { id?: string };
      }>;
    }>(`/${business.id}/owned_pages`, {
      fields: "id,name,access_token,instagram_business_account",
      limit: "100",
      access_token: userToken,
    });

    if (!owned.ok) continue;

    for (const page of owned.data.data ?? []) {
      if (!page.id || !page.access_token) continue;
      pages.push({
        id: page.id,
        name: page.name ?? page.id,
        accessToken: page.access_token,
        instagramAccountId: page.instagram_business_account?.id ?? null,
      });
    }
  }

  return { ok: true, data: pages };
}

async function fetchPageAccessTokenFromPageNode(pageId: string, userToken: string) {
  return graphGetRaw<{
    id?: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: { id?: string };
  }>(`/${pageId}`, {
    fields: "id,name,access_token,instagram_business_account",
    access_token: userToken,
  });
}

async function probePagePosts(pageId: string, pageToken: string) {
  return graphGetRaw<{ data?: Array<{ id: string }> }>(`/${pageId}/posts`, {
    fields: "id",
    limit: "1",
    access_token: pageToken,
  });
}

function formatExpiry(expiresAt?: number) {
  if (!expiresAt) return null;
  return new Date(expiresAt * 1000).toISOString();
}

function invalidTokenMessage(debug: DebugTokenData | null) {
  if (debug && debug.is_valid === false) {
    const reason = debug.error?.message ?? "Token is not valid for this app.";
    return `Meta rejected this token: ${reason} Generate a new User token in Graph API Explorer using the same App ID as this CRM.`;
  }
  return "Invalid or expired token. Generate a new User token in Graph API Explorer (tokens expire in about an hour), paste it here, and save again.";
}

function emptyAccountsMessage(debug: DebugTokenData | null, pageId: string) {
  const granularIds = granularPageIds(debug);
  const granularHint =
    granularIds.length > 0
      ? ` Meta shows page access for: ${granularIds.join(", ")}.`
      : "";

  if (!hasBusinessManagement(debug)) {
    return (
      `Meta returned no pages from /me/accounts.${granularHint} ` +
      `If your Page is in Meta Business Suite, add business_management when generating the token, ` +
      `select your business and Page in the permission dialog, then generate a new User token. ` +
      `Your configured Page ID is ${pageId}.`
    );
  }

  return (
    `Meta returned no pages for this token.${granularHint} ` +
    `Confirm you are a Page admin, regenerate the User token in Graph API Explorer, ` +
    `and select your business + Page during authorization. Configured Page ID: ${pageId}.`
  );
}

async function collectManagedPages(userToken: string, debug: DebugTokenData | null) {
  const pages = new Map<string, MetaPageAccount>();

  const accounts = await listManagedPages(userToken);
  if (accounts.ok) {
    for (const page of accounts.data) pages.set(page.id, page);
  }

  if (pages.size === 0) {
    const businessPages = await listBusinessOwnedPages(userToken);
    if (businessPages.ok) {
      for (const page of businessPages.data) pages.set(page.id, page);
    }
  }

  return [...pages.values()];
}

async function tryGranularUserToken(params: {
  userToken: string;
  pageId: string;
  debug: DebugTokenData | null;
}) {
  const granularIds = granularPageIds(params.debug);
  const hasPageScope =
    granularIds.includes(params.pageId) ||
    Boolean(params.debug?.scopes?.some((scope) => PAGE_READ_SCOPES.has(scope)));

  if (!hasPageScope && granularIds.length > 0 && !granularIds.includes(params.pageId)) {
    return null;
  }

  const postsProbe = await probePagePosts(params.pageId, params.userToken);
  if (!postsProbe.ok) return null;

  const pageInfo = await graphGetRaw<{
    name?: string;
    instagram_business_account?: { id?: string };
  }>(`/${params.pageId}`, {
    fields: "name,instagram_business_account",
    access_token: params.userToken,
  });

  return {
    pageToken: params.userToken,
    pageName: pageInfo.ok ? (pageInfo.data.name ?? null) : null,
    instagramAccountId: pageInfo.ok
      ? (pageInfo.data.instagram_business_account?.id ?? null)
      : null,
    source: "granular_user_token" as const,
  };
}

/**
 * Graph API Explorer issues a User token. Page post/insight endpoints need a Page token,
 * unless Meta granted granular page scopes — then the User token may work directly.
 */
export async function resolvePageAccessToken(params: {
  token: string;
  pageId: string;
  appId?: string | null;
  appSecret?: string | null;
}): Promise<ResolvePageTokenResult> {
  const pageId = params.pageId.trim();
  const trimmed = params.token.trim();
  const appId = params.appId?.trim() || process.env.META_APP_ID?.trim() || null;
  const appSecret = params.appSecret?.trim() || null;

  if (!trimmed) {
    throw new Error("Access token is required.");
  }
  if (!pageId) {
    throw new Error("Facebook Page ID is required.");
  }

  const debug =
    appId && appSecret ? await debugAccessToken(trimmed, appId, appSecret) : null;

  if (debug?.is_valid === false) {
    throw new Error(invalidTokenMessage(debug));
  }

  if (debug?.type === "PAGE" && debug.profile_id === pageId) {
    const postsProbe = await probePagePosts(pageId, trimmed);
    if (postsProbe.ok) {
      const identity = await getTokenIdentity(trimmed);
      return {
        pageToken: trimmed,
        pageName: identity.ok ? (identity.data.name ?? null) : null,
        instagramAccountId: null,
        source: "page_token",
      };
    }
  }

  const identity = await getTokenIdentity(trimmed);
  if (identity.ok && identity.data.id === pageId) {
    const postsProbe = await probePagePosts(pageId, trimmed);
    if (postsProbe.ok) {
      return {
        pageToken: trimmed,
        pageName: identity.data.name ?? null,
        instagramAccountId: null,
        source: "page_token",
      };
    }
  }

  let userToken = trimmed;
  if (appId && appSecret) {
    userToken = await exchangeForLongLivedUserToken(trimmed, appId, appSecret);
  }

  const pageNode = await fetchPageAccessTokenFromPageNode(pageId, userToken);
  if (pageNode.ok && pageNode.data.access_token) {
    const postsProbe = await probePagePosts(pageId, pageNode.data.access_token);
    if (postsProbe.ok) {
      return {
        pageToken: pageNode.data.access_token,
        pageName: pageNode.data.name ?? null,
        instagramAccountId: pageNode.data.instagram_business_account?.id ?? null,
        source: "user_token",
      };
    }
  }

  const granular = await tryGranularUserToken({ userToken, pageId, debug });
  if (granular) {
    return granular;
  }

  const managedPages = await collectManagedPages(userToken, debug);
  const match = managedPages.find((page) => page.id === pageId);

  if (!match) {
    const available = managedPages.map((page) => `${page.name} (${page.id})`).join(", ");
    if (available) {
      throw new Error(
        `Token does not manage Page ID ${pageId}. Available pages: ${available}.`
      );
    }
    throw new Error(emptyAccountsMessage(debug, pageId));
  }

  const postsProbe = await probePagePosts(pageId, match.accessToken);
  if (!postsProbe.ok) {
    const granularFallback = await tryGranularUserToken({ userToken, pageId, debug });
    if (granularFallback) return granularFallback;

    throw new Error(
      `Resolved a Page token for ${match.name}, but Meta still blocked post access: ${postsProbe.error}. Ensure pages_read_engagement and pages_read_user_content are granted to your app, then regenerate the User token.`
    );
  }

  return {
    pageToken: match.accessToken,
    pageName: match.name,
    instagramAccountId: match.instagramAccountId,
    source: "user_token",
  };
}

export async function diagnoseMetaAccessToken(params: {
  token: string;
  pageId: string;
  appId?: string | null;
  appSecret?: string | null;
}): Promise<MetaTokenDiagnostics> {
  const pageId = params.pageId.trim();
  const token = params.token.trim();
  const appId = params.appId?.trim() || process.env.META_APP_ID?.trim() || null;
  const appSecret = params.appSecret?.trim() || null;

  const debug =
    appId && appSecret && token ? await debugAccessToken(token, appId, appSecret) : null;
  const identity = token ? await getTokenIdentity(token) : null;

  let managedPages: MetaPageAccount[] = [];
  let resolvedPageName: string | null = null;
  let postsProbeOk = false;
  let resolutionMethod: string | null = null;
  let error: string | null = null;

  if (token) {
    const pagesResult = await listManagedPages(token);
    if (pagesResult.ok) managedPages = pagesResult.data;

    if (managedPages.length === 0) {
      const businessPages = await listBusinessOwnedPages(token);
      if (businessPages.ok) managedPages = businessPages.data;
    }
  }

  if (token && pageId) {
    try {
      const resolved = await resolvePageAccessToken({
        token,
        pageId,
        appId,
        appSecret,
      });
      resolvedPageName = resolved.pageName;
      resolutionMethod = resolved.source;
      const probe = await probePagePosts(pageId, resolved.pageToken);
      postsProbeOk = probe.ok;
      if (!probe.ok) error = probe.error;
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not resolve Page token";
    }
  }

  return {
    tokenAppId: debug?.app_id ?? null,
    expectedAppId: appId,
    tokenType: debug?.type ?? null,
    tokenValid: debug?.is_valid ?? null,
    tokenScopes: debug?.scopes ?? [],
    granularPageIds: granularPageIds(debug),
    tokenExpiresAt: formatExpiry(debug?.expires_at),
    meId: identity?.ok ? (identity.data.id ?? null) : null,
    meName: identity?.ok ? (identity.data.name ?? null) : null,
    managedPages: managedPages.map((page) => ({ id: page.id, name: page.name })),
    resolvedPageName,
    postsProbeOk,
    resolutionMethod,
    error,
  };
}
