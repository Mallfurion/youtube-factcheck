import { fetch as undiciFetch } from 'undici';

export const defaultFetch: typeof fetch =
	typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undiciFetch;

export async function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
	timeoutMs = 10_000
): Promise<Response> {
	if (timeoutMs <= 0) {
		return defaultFetch(url, init);
	}

	if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
		const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
		return defaultFetch(url, { ...init, signal });
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const signal = init.signal ?? controller.signal;
		return await defaultFetch(url, { ...init, signal });
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function fetchText(
	url: string,
	init: RequestInit = {},
	timeoutMs = 10_000
): Promise<string> {
	const response = await fetchWithTimeout(url, init, timeoutMs);
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status} for ${url}`);
	}
	return response.text();
}

export async function fetchJson<T>(
	url: string,
	init: RequestInit = {},
	timeoutMs = 10_000
): Promise<T> {
	const response = await fetchWithTimeout(url, init, timeoutMs);
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status} for ${url}`);
	}
	return (await response.json()) as T;
}
