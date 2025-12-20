import {
	VideoUnavailable,
	YouTubeRequestFailed,
	NoTranscriptFound,
	TranscriptsDisabled,
	NotTranslatable,
	TranslationLanguageNotAvailable,
	FailedToCreateConsentCookie,
	InvalidVideoId,
	IpBlocked,
	RequestBlocked,
	AgeRestricted,
	VideoUnplayable,
	YouTubeDataUnparsable,
	PoTokenRequired
} from './errors';
import { WATCH_URL, INNERTUBE_CONTEXT, INNERTUBE_API_URL } from './settings';
import { decodeHtml, buildHtmlStripper } from './utils';
import type { HttpClient } from './http';
import type { ProxyConfig } from './proxies';

const PLAYABILITY_STATUS = {
	OK: 'OK',
	ERROR: 'ERROR',
	LOGIN_REQUIRED: 'LOGIN_REQUIRED'
} as const;

const PLAYABILITY_FAILED_REASON = {
	BOT_DETECTED: "Sign in to confirm you're not a bot",
	AGE_RESTRICTED: 'This video may be inappropriate for some users.',
	VIDEO_UNAVAILABLE: 'This video is unavailable'
} as const;

type LanguageName = {
	runs?: Array<{ text?: string }>;
	simpleText?: string;
};

type TranslationLanguageRaw = {
	languageName?: LanguageName;
	languageCode?: string;
};

type CaptionTrackRaw = {
	kind?: string;
	languageCode?: string;
	baseUrl?: string;
	name?: LanguageName;
	isTranslatable?: boolean;
};

type PlayabilityStatusData = {
	status?: string;
	reason?: string;
	errorScreen?: {
		playerErrorMessageRenderer?: {
			subreason?: { runs?: Array<{ text?: string }> };
		};
	};
};

type InnertubeData = {
	captions?: {
		playerCaptionsTracklistRenderer?: Record<string, unknown>;
	};
	playabilityStatus?: PlayabilityStatusData;
};

export type FetchedTranscriptSnippet = {
	text: string;
	start: number;
	duration: number;
};

export class FetchedTranscript {
	snippets: FetchedTranscriptSnippet[];
	videoId: string;
	language: string;
	languageCode: string;
	isGenerated: boolean;

	constructor({
		snippets,
		videoId,
		language,
		languageCode,
		isGenerated
	}: {
		snippets: FetchedTranscriptSnippet[];
		videoId: string;
		language: string;
		languageCode: string;
		isGenerated: boolean;
	}) {
		this.snippets = snippets;
		this.videoId = videoId;
		this.language = language;
		this.languageCode = languageCode;
		this.isGenerated = isGenerated;
	}

	[Symbol.iterator](): IterableIterator<FetchedTranscriptSnippet> {
		return this.snippets[Symbol.iterator]();
	}

	get length(): number {
		return this.snippets.length;
	}

	at(index: number): FetchedTranscriptSnippet | undefined {
		const normalized = index < 0 ? this.snippets.length + index : index;
		return this.snippets[normalized];
	}

	toRawData(): FetchedTranscriptSnippet[] {
		return this.snippets.map((snippet) => ({ ...snippet }));
	}
}

export type TranslationLanguage = {
	language: string;
	languageCode: string;
};

export class Transcript {
	private _httpClient: HttpClient;
	private _url: string;
	private _translationLanguagesMap: Map<string, string>;

	videoId: string;
	language: string;
	languageCode: string;
	isGenerated: boolean;
	translationLanguages: TranslationLanguage[];

	constructor({
		httpClient,
		videoId,
		url,
		language,
		languageCode,
		isGenerated,
		translationLanguages
	}: {
		httpClient: HttpClient;
		videoId: string;
		url: string;
		language: string;
		languageCode: string;
		isGenerated: boolean;
		translationLanguages: TranslationLanguage[];
	}) {
		this._httpClient = httpClient;
		this.videoId = videoId;
		this._url = url;
		this.language = language;
		this.languageCode = languageCode;
		this.isGenerated = isGenerated;
		this.translationLanguages = translationLanguages;
		this._translationLanguagesMap = new Map(
			translationLanguages.map((item) => [item.languageCode, item.language])
		);
	}

	async fetch({
		preserveFormatting = false
	}: { preserveFormatting?: boolean } = {}): Promise<FetchedTranscript> {
		if (this._url.includes('&exp=xpe')) {
			throw new PoTokenRequired(this.videoId);
		}

		const response = await this._httpClient.get(this._url);
		const text = await raiseHttpErrors(response, this.videoId).text();
		const parser = new TranscriptParser({ preserveFormatting });
		const snippets = parser.parse(text);
		return new FetchedTranscript({
			snippets,
			videoId: this.videoId,
			language: this.language,
			languageCode: this.languageCode,
			isGenerated: this.isGenerated
		});
	}

	toString(): string {
		return `${this.languageCode} ("${this.language}")${this.isTranslatable ? '[TRANSLATABLE]' : ''}`;
	}

	get isTranslatable(): boolean {
		return this.translationLanguages.length > 0;
	}

	translate(languageCode: string): Transcript {
		if (!this.isTranslatable) {
			throw new NotTranslatable(this.videoId);
		}

		if (!this._translationLanguagesMap.has(languageCode)) {
			throw new TranslationLanguageNotAvailable(this.videoId);
		}

		return new Transcript({
			httpClient: this._httpClient,
			videoId: this.videoId,
			url: `${this._url}&tlang=${languageCode}`,
			language: this._translationLanguagesMap.get(languageCode) || languageCode,
			languageCode,
			isGenerated: true,
			translationLanguages: []
		});
	}
}

export class TranscriptList {
	private _manuallyCreatedTranscripts: Record<string, Transcript>;
	private _generatedTranscripts: Record<string, Transcript>;
	private _translationLanguages: TranslationLanguage[];

	videoId: string;

	constructor({
		videoId,
		manuallyCreatedTranscripts,
		generatedTranscripts,
		translationLanguages
	}: {
		videoId: string;
		manuallyCreatedTranscripts: Record<string, Transcript>;
		generatedTranscripts: Record<string, Transcript>;
		translationLanguages: TranslationLanguage[];
	}) {
		this.videoId = videoId;
		this._manuallyCreatedTranscripts = manuallyCreatedTranscripts;
		this._generatedTranscripts = generatedTranscripts;
		this._translationLanguages = translationLanguages;
	}

	static build(
		httpClient: HttpClient,
		videoId: string,
		captionsJson: Record<string, unknown>
	): TranscriptList {
		const translationLanguagesValue = captionsJson.translationLanguages;
		const translationLanguagesRaw = Array.isArray(translationLanguagesValue)
			? (translationLanguagesValue as TranslationLanguageRaw[])
			: [];
		const translationLanguages = translationLanguagesRaw.map((translationLanguage) => ({
			language:
				translationLanguage?.languageName?.runs?.[0]?.text ??
				translationLanguage?.languageName?.simpleText ??
				translationLanguage?.languageCode ??
				'Unknown',
			languageCode: translationLanguage?.languageCode ?? 'unknown'
		}));

		const manuallyCreatedTranscripts: Record<string, Transcript> = {};
		const generatedTranscripts: Record<string, Transcript> = {};

		const captionTracksValue = captionsJson.captionTracks;
		const captionTracks = Array.isArray(captionTracksValue)
			? (captionTracksValue as CaptionTrackRaw[])
			: [];
		if (!captionTracks.length) {
			throw new TranscriptsDisabled(videoId);
		}

		for (const caption of captionTracks) {
			const target = caption.kind === 'asr' ? generatedTranscripts : manuallyCreatedTranscripts;
			target[caption.languageCode ?? 'unknown'] = new Transcript({
				httpClient,
				videoId,
				url: String(caption.baseUrl ?? '').replace('&fmt=srv3', ''),
				language:
					caption?.name?.runs?.[0]?.text ??
					caption?.name?.simpleText ??
					caption.languageCode ??
					'unknown',
				languageCode: caption.languageCode ?? 'unknown',
				isGenerated: caption.kind === 'asr',
				translationLanguages: caption.isTranslatable ? translationLanguages : []
			});
		}

		return new TranscriptList({
			videoId,
			manuallyCreatedTranscripts,
			generatedTranscripts,
			translationLanguages
		});
	}

	[Symbol.iterator](): IterableIterator<Transcript> {
		const values = [
			...Object.values(this._manuallyCreatedTranscripts),
			...Object.values(this._generatedTranscripts)
		];
		return values[Symbol.iterator]();
	}

	findTranscript(languageCodes: Iterable<string>): Transcript {
		return this._findTranscript(languageCodes, [
			this._manuallyCreatedTranscripts,
			this._generatedTranscripts
		]);
	}

	findGeneratedTranscript(languageCodes: Iterable<string>): Transcript {
		return this._findTranscript(languageCodes, [this._generatedTranscripts]);
	}

	findManuallyCreatedTranscript(languageCodes: Iterable<string>): Transcript {
		return this._findTranscript(languageCodes, [this._manuallyCreatedTranscripts]);
	}

	private _findTranscript(
		languageCodes: Iterable<string>,
		transcriptDicts: Array<Record<string, Transcript>>
	): Transcript {
		for (const languageCode of languageCodes) {
			for (const dict of transcriptDicts) {
				if (dict[languageCode]) {
					return dict[languageCode];
				}
			}
		}

		throw new NoTranscriptFound(this.videoId, languageCodes, this);
	}

	toString(): string {
		return (
			`For this video (${this.videoId}) transcripts are available in the following languages:\n\n` +
			`(MANUALLY CREATED)\n${this._getLanguageDescription(
				Object.values(this._manuallyCreatedTranscripts).map((item) => String(item))
			)}\n\n` +
			`(GENERATED)\n${this._getLanguageDescription(
				Object.values(this._generatedTranscripts).map((item) => String(item))
			)}\n\n` +
			`(TRANSLATION LANGUAGES)\n${this._getLanguageDescription(
				this._translationLanguages.map((item) => `${item.languageCode} ("${item.language}")`)
			)}`
		);
	}

	private _getLanguageDescription(transcriptStrings: string[]): string {
		const description = transcriptStrings.map((item) => ` - ${item}`).join('\n');
		return description || 'None';
	}
}

export class TranscriptListFetcher {
	private _httpClient: HttpClient;
	private _proxyConfig: ProxyConfig | null;

	constructor(httpClient: HttpClient, proxyConfig: ProxyConfig | null) {
		this._httpClient = httpClient;
		this._proxyConfig = proxyConfig;
	}

	async fetch(videoId: string): Promise<TranscriptList> {
		const captionsJson = await this._fetchCaptionsJson(videoId);
		return TranscriptList.build(this._httpClient, videoId, captionsJson);
	}

	private async _fetchCaptionsJson(
		videoId: string,
		tryNumber = 0
	): Promise<Record<string, unknown>> {
		try {
			const html = await this._fetchVideoHtml(videoId);
			const apiKey = this._extractInnertubeApiKey(html, videoId);
			const innertubeData = await this._fetchInnertubeData(videoId, apiKey);
			return this._extractCaptionsJson(innertubeData, videoId);
		} catch (error) {
			if (error instanceof RequestBlocked) {
				const retries = this._proxyConfig ? this._proxyConfig.retriesWhenBlocked : 0;
				if (tryNumber + 1 < retries) {
					return this._fetchCaptionsJson(videoId, tryNumber + 1);
				}
				throw error.withProxyConfig(this._proxyConfig);
			}
			throw error;
		}
	}

	private _extractInnertubeApiKey(html: string, videoId: string): string {
		const pattern = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/;
		const match = html.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
		if (html.includes('class="g-recaptcha"')) {
			throw new IpBlocked(videoId);
		}
		throw new YouTubeDataUnparsable(videoId);
	}

	private _extractCaptionsJson(
		innertubeData: Record<string, unknown>,
		videoId: string
	): Record<string, unknown> {
		const typedInnertube = innertubeData as InnertubeData;
		this._assertPlayability(typedInnertube.playabilityStatus || {}, videoId);

		const captionsJson = typedInnertube.captions?.playerCaptionsTracklistRenderer;
		if (!captionsJson || !captionsJson.captionTracks) {
			throw new TranscriptsDisabled(videoId);
		}

		return captionsJson;
	}

	private _assertPlayability(playabilityStatusData: Record<string, unknown>, videoId: string): void {
		const typedPlayability = playabilityStatusData as PlayabilityStatusData;
		const playabilityStatus = typedPlayability.status;
		if (playabilityStatus && playabilityStatus !== PLAYABILITY_STATUS.OK) {
			const reason = typedPlayability.reason;
			if (playabilityStatus === PLAYABILITY_STATUS.LOGIN_REQUIRED) {
				if (reason === PLAYABILITY_FAILED_REASON.BOT_DETECTED) {
					throw new RequestBlocked(videoId);
				}
				if (reason === PLAYABILITY_FAILED_REASON.AGE_RESTRICTED) {
					throw new AgeRestricted(videoId);
				}
			}
			if (
				playabilityStatus === PLAYABILITY_STATUS.ERROR &&
				reason === PLAYABILITY_FAILED_REASON.VIDEO_UNAVAILABLE
			) {
				if (videoId.startsWith('http://') || videoId.startsWith('https://')) {
					throw new InvalidVideoId(videoId);
				}
				throw new VideoUnavailable(videoId);
			}

			const subreasons =
				typedPlayability.errorScreen?.playerErrorMessageRenderer?.subreason?.runs || [];
			throw new VideoUnplayable(
				videoId,
				reason ?? null,
				subreasons.map((run) => run.text || '')
			);
		}
	}

	private _createConsentCookie(html: string, videoId: string): void {
		const match = html.match(/name="v" value="(.*?)"/);
		if (!match) {
			throw new FailedToCreateConsentCookie(videoId);
		}
		this._httpClient.setCookie('CONSENT', `YES+${match[1]}`, '.youtube.com');
	}

	private async _fetchVideoHtml(videoId: string): Promise<string> {
		let html = await this._fetchHtml(videoId);
		const debug = process.env.TRANSCRIPT_DEBUG === 'true';
		if (debug) {
			console.info(`[youtube-transcript] html length=${html.length}`);
			console.info(`[youtube-transcript] html head=${html.slice(0, 400)}`);
		}
		if (html.includes('action="https://consent.youtube.com/s"')) {
			this._createConsentCookie(html, videoId);
			html = await this._fetchHtml(videoId);
			if (html.includes('action="https://consent.youtube.com/s"')) {
				throw new FailedToCreateConsentCookie(videoId);
			}
		}
		return html;
	}

	private async _fetchHtml(videoId: string): Promise<string> {
		const response = await this._httpClient.get(WATCH_URL.replace('{video_id}', videoId));
		const text = await raiseHttpErrors(response, videoId).text();
		return decodeHtml(text);
	}

	private async _fetchInnertubeData(
		videoId: string,
		apiKey: string
	): Promise<Record<string, unknown>> {
		const response = await this._httpClient.post(INNERTUBE_API_URL.replace('{api_key}', apiKey), {
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				context: INNERTUBE_CONTEXT,
				videoId
			})
		});
		return raiseHttpErrors(response, videoId).json();
	}
}

class TranscriptParser {
	private _stripHtml: (text: string) => string;

	constructor({ preserveFormatting = false }: { preserveFormatting?: boolean } = {}) {
		this._stripHtml = buildHtmlStripper({ preserveFormatting });
	}

	parse(rawData: string): FetchedTranscriptSnippet[] {
		const snippets: FetchedTranscriptSnippet[] = [];
		const regex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
		let match = regex.exec(rawData);
		while (match) {
			const attributes = match[1] || '';
			const content = match[2] ?? '';
			const startMatch = attributes.match(/start="([^"]+)"/);
			const durationMatch = attributes.match(/dur="([^"]+)"/);

			if (content !== null && content !== undefined) {
				const decoded = decodeHtml(content);
				const cleaned = this._stripHtml(decoded);
				snippets.push({
					text: cleaned,
					start: parseFloat(startMatch ? startMatch[1] : '0'),
					duration: parseFloat(durationMatch ? durationMatch[1] : '0')
				});
			}
			match = regex.exec(rawData);
		}

		return snippets;
	}
}

function raiseHttpErrors(response: Response, videoId: string): Response {
	if (response.status === 429) {
		throw new IpBlocked(videoId);
	}
	if (!response.ok) {
		if (process.env.TRANSCRIPT_DEBUG === 'true') {
			console.error(
				`[youtube-transcript] request failed: ${response.status} ${response.statusText} (${response.url})`
			);
		}
		throw new YouTubeRequestFailed(videoId, `${response.status} ${response.statusText}`);
	}
	return response;
}
