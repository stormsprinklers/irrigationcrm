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
  source: "page_token" | "user_token";
};

export type MetaTokenDiagnostics = {
  tokenAppId: string | null;
  expectedAppId: string | null;
  tokenType: string | null;
  tokenValid: boolean | null;
  tokenScopes: string[];
  tokenExpiresAt: string | null;
  meId: string | null;
  meName: string | null;
  managedPages: Array<{ id: string; name: string }>;
  resolvedPageName: string | null;
  postsProbeOk: boolean;
  error: string | null;
};

type DebugTokenData = {
  app_id?: string;
  type?: string;
  is_valid?: boolean;
  expires_at?: number;
  scopes?: string[];
  profile_id?: string;
  error?: GraphError;
};

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

/**
 * Graph API Explorer issues a User token. Page post/insight endpoints need a Page token.
 * A User token can read basic Page metadata but still fail on /posts — never assume Page token
 * from a successful /{page-id} lookup alone.
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

  const pagesResult = await listManagedPages(userToken);
  if (!pagesResult.ok) {
    if (pagesResult.error.toLowerCase().includes("invalid oauth")) {
      throw new Error(invalidTokenMessage(debug));
    }
    throw new Error(
      `${pagesResult.error} Add pages_show_list to your token permissions, then generate a new User token.`
    );
  }

  const match = pagesResult.data.find((page) => page.id === pageId);
  if (!match) {
    const available = pagesResult.data.map((page) => `${page.name} (${page.id})`).join(", ");
    throw new Error(
      available
        ? `Token does not manage Page ID ${pageId}. Available pages: ${available}.`
        : "This token is not linked to any Facebook Pages. In Graph API Explorer, add pages_show_list, make sure you are logged in as a Page admin, and generate a new User token."
    );
  }

  const postsProbe = await probePagePosts(pageId, match.accessToken);
  if (!postsProbe.ok) {
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
  let error: string | null = null;

  if (token && pageId) {
    try {
      const resolved = await resolvePageAccessToken({
        token,
        pageId,
        appId,
        appSecret,
      });
      resolvedPageName = resolved.pageName;
      const probe = await probePagePosts(pageId, resolved.pageToken);
      postsProbeOk = probe.ok;
      if (!probe.ok) error = probe.error;
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not resolve Page token";
    }

    if (!error) {
      const pagesResult = await listManagedPages(token);
      if (pagesResult.ok) managedPages = pagesResult.data;
    } else {
      const pagesResult = await listManagedPages(token);
      if (pagesResult.ok) managedPages = pagesResult.data;
    }
  }

  return {
    tokenAppId: debug?.app_id ?? null,
    expectedAppId: appId,
    tokenType: debug?.type ?? null,
    tokenValid: debug?.is_valid ?? null,
    tokenScopes: debug?.scopes ?? [],
    tokenExpiresAt: formatExpiry(debug?.expires_at),
    meId: identity?.ok ? (identity.data.id ?? null) : null,
    meName: identity?.ok ? (identity.data.name ?? null) : null,
    managedPages: managedPages.map((page) => ({ id: page.id, name: page.name })),
    resolvedPageName,
    postsProbeOk,
    error,
  };
}
