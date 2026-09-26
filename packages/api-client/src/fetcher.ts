/**
 * Injectable fetch for the generated client.
 *
 * The signature is deliberately `Response`-shaped: orval's react-query client
 * calls the mutator and then reads `.status`, `.text()` and `.headers` off the
 * result. Returning parsed JSON here would break the generated code.
 *
 * What this buys us is spec §15: one place decides the base URL, the
 * credentials mode and the extra headers, so the future mobile app can call
 * `setApiConfig({ headers: { Authorization: `Bearer ${token}` } })` and have
 * every generated hook follow, with no change to generated code.
 */
export type ApiFetchConfig = {
  /** Base URL of the Laravel API, e.g. https://api.olivarcalc.es. */
  baseUrl: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /**
   * true for the web (cookie-based Sanctum auth across origins),
   * false for mobile (bearer token, no cookies).
   */
  withCredentials: boolean;
};

function readEnv(key: string): string | undefined {
  // `import.meta.env` only exists under Vite/Astro. Guard it so this file can
  // also be imported by plain Node tooling.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.[key];
}

export const apiConfig: ApiFetchConfig = {
  baseUrl: readEnv('PUBLIC_API_URL') ?? 'http://127.0.0.1:8000',
  withCredentials: true,
};

export function setApiConfig(next: Partial<ApiFetchConfig>): void {
  Object.assign(apiConfig, next);
}

export const apiFetcher = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const { baseUrl, headers, withCredentials } = apiConfig;

  return fetch(new URL(url, baseUrl).toString(), {
    ...options,
    credentials: withCredentials ? 'include' : 'omit',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
};

/**
 * Turn a Laravel error response into something showable.
 *
 * Kept out of `apiFetcher` because orval owns response handling. Call it from
 * the React Query layer (`throwOnError`) rather than from generated code.
 */
export type ApiError = Error & {
  status: number;
  /** Field-level messages from a 422, when the endpoint returns them. */
  errors?: Record<string, string[]>;
};

export async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as
    | { message?: string; errors?: Record<string, string[]> }
    | null;

  return Object.assign(new Error(body?.message ?? `Error ${response.status}`), {
    status: response.status,
    errors: body?.errors,
  });
}
