const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { message?: string; type?: string; code?: number };

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function graphGetRaw<T>(path: string, params: Record<string, string>): Promise<GraphResult<T>> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as T & { error?: GraphError };

  if (!res.ok || data.error) {
    return { ok: false, error: data.error?.message ?? `Meta Graph API error (${res.status})` };
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

async function exchangeForLongLivedUserToken(
  userToken: string,
  appId: string,
  appSecret: string
): Promise<string> {
  const result = await graphGetRaw<{ access_token?: string }>(`${GRAPH_BASE}/oauth/access_token`, {
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

/**
 * Graph API Explorer issues a User token. Page endpoints need a Page token.
 * Accept either: use a Page token directly, or resolve one via /me/accounts.
 */
export async function resolvePageAccessToken(params: {
  token: string;
  pageId: string;
  appId?: string | null;
  appSecret?: string | null;
}): Promise<ResolvePageTokenResult> {
  const { token, pageId, appId, appSecret } = params;
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Access token is required.");
  }

  const direct = await graphGetRaw<{ id?: string; name?: string }>(`/${pageId}`, {
    fields: "id,name",
    access_token: trimmed,
  });

  if (direct.ok) {
    return {
      pageToken: trimmed,
      pageName: direct.data.name ?? null,
      instagramAccountId: null,
      source: "page_token",
    };
  }

  let userToken = trimmed;
  if (appId && appSecret) {
    userToken = await exchangeForLongLivedUserToken(trimmed, appId, appSecret);
  }

  const pagesResult = await listManagedPages(userToken);
  if (!pagesResult.ok) {
    if (pagesResult.error.toLowerCase().includes("invalid oauth")) {
      throw new Error(
        "Invalid or expired token. Generate a new User token in Graph API Explorer (tokens expire in about an hour), then save it here again."
      );
    }
    throw new Error(
      `${pagesResult.error} Add pages_show_list to your token permissions, or paste a Page token instead.`
    );
  }

  const match = pagesResult.data.find((page) => page.id === pageId);
  if (!match) {
    const available = pagesResult.data.map((page) => `${page.name} (${page.id})`).join(", ");
    throw new Error(
      available
        ? `Token does not manage Page ID ${pageId}. Available pages: ${available}. Update Facebook Page ID to match, or use an account that manages that page.`
        : `This token is not linked to any Facebook Pages. In Graph API Explorer, add pages_show_list and generate a new User token while logged in as a Page admin.`
    );
  }

  return {
    pageToken: match.accessToken,
    pageName: match.name,
    instagramAccountId: match.instagramAccountId,
    source: "user_token",
  };
}
