import { HttpClient } from './http';
import { TranscriptListFetcher } from './transcripts';
import type { ProxyConfig } from './proxies';
import type { FetchedTranscript, TranscriptList } from './transcripts';

export class YouTubeTranscriptApi {
	private _fetcher: TranscriptListFetcher;

	constructor({
		proxyConfig = null,
		httpClient = null,
		fetcher = null,
		agent = null
	}: {
		proxyConfig?: ProxyConfig | null;
		httpClient?: HttpClient | null;
		fetcher?: typeof fetch | null;
		agent?: unknown;
	} = {}) {
		const client =
			httpClient ??
			new HttpClient({
				fetcher: (fetcher ?? fetch) as typeof fetch,
				proxyConfig: proxyConfig ?? null,
				agent
			});

		client.setHeader('Accept-Language', 'en-US');

		this._fetcher = new TranscriptListFetcher(client, proxyConfig ?? null);
	}

	async fetch(
		videoId: string,
		{
			languages = ['en'],
			preserveFormatting = false
		}: { languages?: Iterable<string>; preserveFormatting?: boolean } = {}
	): Promise<FetchedTranscript> {
		const list = await this.list(videoId);
		const transcript = list.findTranscript(languages);
		return transcript.fetch({ preserveFormatting });
	}

	async list(videoId: string): Promise<TranscriptList> {
		return this._fetcher.fetch(videoId);
	}
}
