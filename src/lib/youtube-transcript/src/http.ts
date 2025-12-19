import type { ProxyConfig } from "./proxies";

export class CookieJar {
  private _cookies: Array<{ name: string; value: string; domain: string }> = [];

  set(name: string, value: string, domain: string): void {
    this._cookies.push({ name, value, domain });
  }

  getHeader(url: string): string {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch (error) {
      return "";
    }

    const matching = this._cookies.filter((cookie) => {
      if (!cookie.domain) {
        return false;
      }
      if (host === cookie.domain) {
        return true;
      }
      return host.endsWith(cookie.domain.replace(/^\./, ""));
    });

    if (!matching.length) {
      return "";
    }

    return matching.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class HttpClient {
  private _fetch: Fetcher;
  private _headers: Record<string, string>;
  private _cookieJar: CookieJar;
  private _proxyConfig: ProxyConfig | null;
  private _agent: unknown;
  private _extraFetchOptions: RequestInit;

  constructor({
    fetcher,
    headers = {},
    cookieJar = new CookieJar(),
    proxyConfig = null,
    agent = null,
    extraFetchOptions = {},
  }: {
    fetcher: Fetcher;
    headers?: Record<string, string>;
    cookieJar?: CookieJar;
    proxyConfig?: ProxyConfig | null;
    agent?: unknown;
    extraFetchOptions?: RequestInit;
  }) {
    if (!fetcher) {
      throw new Error("A fetch implementation is required.");
    }
    this._fetch = fetcher;
    this._headers = { ...headers };
    this._cookieJar = cookieJar;
    this._proxyConfig = proxyConfig;
    this._agent = agent;
    this._extraFetchOptions = extraFetchOptions;
  }

  setHeader(name: string, value: string): void {
    this._headers[name] = value;
  }

  setCookie(name: string, value: string, domain: string): void {
    this._cookieJar.set(name, value, domain);
  }

  async get(url: string, options: RequestInit = {}): Promise<Response> {
    return this._request(url, { method: "GET", ...options });
  }

  async post(url: string, options: RequestInit = {}): Promise<Response> {
    return this._request(url, { method: "POST", ...options });
  }

  private _buildHeaders(url: string, headers: HeadersInit = {}): HeadersInit {
    const merged = { ...this._headers, ...(headers as Record<string, string>) };

    const cookieHeader = this._cookieJar.getHeader(url);
    if (cookieHeader) {
      merged.Cookie = cookieHeader;
    }

    if (this._proxyConfig && this._proxyConfig.preventKeepingConnectionsAlive) {
      merged.Connection = "close";
    }

    return merged;
  }

  private async _request(url: string, options: RequestInit): Promise<Response> {
    const headers = this._buildHeaders(url, options.headers);

    const fetchOptions: RequestInit & { agent?: unknown; dispatcher?: unknown } = {
      ...this._extraFetchOptions,
      ...options,
      headers,
    };

    if (this._agent) {
      fetchOptions.agent = this._agent;
      fetchOptions.dispatcher = this._agent;
    }

    return this._fetch(url, fetchOptions);
  }
}
