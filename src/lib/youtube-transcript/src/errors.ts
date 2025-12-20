import { WATCH_URL } from './settings';
import { GenericProxyConfig, WebshareProxyConfig, type ProxyConfig } from './proxies';

export class YouTubeTranscriptApiException extends Error {
	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export class CookieError extends YouTubeTranscriptApiException {}

export class CookiePathInvalid extends CookieError {
	constructor(cookiePath: string) {
		super(`Can't load the provided cookie file: ${cookiePath}`);
	}
}

export class CookieInvalid extends CookieError {
	constructor(cookiePath: string) {
		super(`The cookies provided are not valid (may have expired): ${cookiePath}`);
	}
}

export class CouldNotRetrieveTranscript extends YouTubeTranscriptApiException {
	static ERROR_MESSAGE = '\nCould not retrieve a transcript for the video {video_url}!';
	static CAUSE_MESSAGE_INTRO = ' This is most likely caused by:\n\n{cause}';
	static CAUSE_MESSAGE = '';
	static GITHUB_REFERRAL =
		'\n\nIf you are sure that the described cause is not responsible for this error ' +
		'and that a transcript should be retrievable, please create an issue at ' +
		'https://github.com/jdepoix/youtube-transcript-api/issues. ' +
		'Please add which version of youtube_transcript_api you are using ' +
		'and provide the information needed to replicate the error. ' +
		'Also make sure that there are no open issues which already describe your problem!';

	videoId: string;

	constructor(videoId: string) {
		super('');
		this.videoId = videoId;
		this._updateMessage();
	}

	protected get causeMessage(): string {
		return (this.constructor as typeof CouldNotRetrieveTranscript).CAUSE_MESSAGE;
	}

	private _buildErrorMessage(): string {
		let errorMessage = (
			this.constructor as typeof CouldNotRetrieveTranscript
		).ERROR_MESSAGE.replace('{video_url}', WATCH_URL.replace('{video_id}', this.videoId));

		const cause = this.causeMessage;
		if (cause) {
			errorMessage +=
				(this.constructor as typeof CouldNotRetrieveTranscript).CAUSE_MESSAGE_INTRO.replace(
					'{cause}',
					cause
				) + (this.constructor as typeof CouldNotRetrieveTranscript).GITHUB_REFERRAL;
		}

		return errorMessage;
	}

	protected _updateMessage(): void {
		this.message = this._buildErrorMessage();
	}

	toString(): string {
		return this.message;
	}
}

export class YouTubeDataUnparsable extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE =
		'The data required to fetch the transcript is not parsable. This should ' +
		'not happen, please open an issue (make sure to include the video ID)!';
}

export class YouTubeRequestFailed extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE = 'Request to YouTube failed: {reason}';

	private reason: string;

	constructor(videoId: string, httpError: string) {
		super(videoId);
		this.reason = String(httpError);
		this._updateMessage();
	}

	protected get causeMessage(): string {
		return YouTubeRequestFailed.CAUSE_MESSAGE.replace('{reason}', this.reason);
	}
}

export class VideoUnplayable extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE = 'The video is unplayable for the following reason: {reason}';
	static SUBREASON_MESSAGE = '\n\nAdditional Details:\n{sub_reasons}';

	private reason: string | null;
	private subReasons: string[];

	constructor(videoId: string, reason: string | null, subReasons: string[]) {
		super(videoId);
		this.reason = reason;
		this.subReasons = subReasons;
		this._updateMessage();
	}

	protected get causeMessage(): string {
		let reason = this.reason === null ? 'No reason specified!' : this.reason;
		if (this.subReasons?.length) {
			const subReasons = this.subReasons.map((item) => ` - ${item}`).join('\n');
			reason = `${reason}${VideoUnplayable.SUBREASON_MESSAGE.replace('{sub_reasons}', subReasons)}`;
		}
		return VideoUnplayable.CAUSE_MESSAGE.replace('{reason}', reason);
	}
}

export class VideoUnavailable extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE = 'The video is no longer available';
}

export class InvalidVideoId extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE =
		'You provided an invalid video id. Make sure you are using the video id and NOT the url!\n\n' +
		'Do NOT run: `YouTubeTranscriptApi().fetch("https://www.youtube.com/watch?v=1234")`\n' +
		'Instead run: `YouTubeTranscriptApi().fetch("1234")`';
}

export class RequestBlocked extends CouldNotRetrieveTranscript {
	static BASE_CAUSE_MESSAGE =
		'YouTube is blocking requests from your IP. This usually is due to one of the ' +
		'following reasons:\n' +
		'- You have done too many requests and your IP has been blocked by YouTube\n' +
		'- You are doing requests from an IP belonging to a cloud provider (like AWS, ' +
		'Google Cloud Platform, Azure, etc.). Unfortunately, most IPs from cloud ' +
		'providers are blocked by YouTube.\n\n';

	static CAUSE_MESSAGE =
		`${RequestBlocked.BASE_CAUSE_MESSAGE}` +
		'There are two things you can do to work around this:\n' +
		'1. Use proxies to hide your IP address, as explained in the "Working around ' +
		'IP bans" section of the README ' +
		'(https://github.com/jdepoix/youtube-transcript-api' +
		'?tab=readme-ov-file' +
		'#working-around-ip-bans-requestblocked-or-ipblocked-exception).\n' +
		'2. (NOT RECOMMENDED) If you authenticate your requests using cookies, you ' +
		'will be able to continue doing requests for a while. However, YouTube will ' +
		'eventually permanently ban the account that you have used to authenticate ' +
		"with! So only do this if you don't mind your account being banned!";

	static WITH_GENERIC_PROXY_CAUSE_MESSAGE =
		'YouTube is blocking your requests, despite you using proxies. Keep in mind ' +
		'that a proxy is just a way to hide your real IP behind the IP of that proxy, ' +
		"but there is no guarantee that the IP of that proxy won't be blocked as " +
		'well.\n\n' +
		'The only truly reliable way to prevent IP blocks is rotating through a large ' +
		'pool of residential IPs, by using a provider like Webshare ' +
		'(https://www.webshare.io/?referral_code=w0xno53eb50g), which provides you ' +
		'with a pool of >30M residential IPs (make sure to purchase ' +
		'"Residential" proxies, NOT "Proxy Server" or "Static Residential"!).\n\n' +
		'You will find more information on how to easily integrate Webshare here: ' +
		'https://github.com/jdepoix/youtube-transcript-api' +
		'?tab=readme-ov-file#using-webshare';

	static WITH_WEBSHARE_PROXY_CAUSE_MESSAGE =
		'YouTube is blocking your requests, despite you using Webshare proxies. ' +
		'Please make sure that you have purchased "Residential" proxies and ' +
		'NOT "Proxy Server" or "Static Residential", as those won\'t work as ' +
		'reliably! The free tier also uses "Proxy Server" and will NOT work!\n\n' +
		'The only reliable option is using "Residential" proxies (not "Static ' +
		'Residential"), as this allows you to rotate through a pool of over 30M IPs, ' +
		"which means you will always find an IP that hasn't been blocked by YouTube " +
		'yet!\n\n' +
		'You can support the development of this open source project by making your ' +
		'Webshare purchases through this affiliate link: ' +
		'https://www.webshare.io/?referral_code=w0xno53eb50g \n\n' +
		'Thank you for your support! <3';

	private _proxyConfig: ProxyConfig | null = null;

	withProxyConfig(proxyConfig: ProxyConfig | null): this {
		this._proxyConfig = proxyConfig;
		this._updateMessage();
		return this;
	}

	protected get causeMessage(): string {
		if (this._proxyConfig instanceof WebshareProxyConfig) {
			return RequestBlocked.WITH_WEBSHARE_PROXY_CAUSE_MESSAGE;
		}
		if (this._proxyConfig instanceof GenericProxyConfig) {
			return RequestBlocked.WITH_GENERIC_PROXY_CAUSE_MESSAGE;
		}
		return RequestBlocked.CAUSE_MESSAGE;
	}
}

export class IpBlocked extends RequestBlocked {
	static CAUSE_MESSAGE =
		`${RequestBlocked.BASE_CAUSE_MESSAGE}` +
		'Ways to work around this are explained in the "Working around IP ' +
		'bans" section of the README (https://github.com/jdepoix/youtube-transcript-api' +
		'?tab=readme-ov-file' +
		'#working-around-ip-bans-requestblocked-or-ipblocked-exception).\n';
}

export class TranscriptsDisabled extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE = 'Subtitles are disabled for this video';
}

export class AgeRestricted extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE =
		'This video is age-restricted. Therefore, you are unable to retrieve ' +
		'transcripts for it without authenticating yourself.\n\n' +
		'Unfortunately, Cookie Authentication is temporarily unsupported in ' +
		"youtube-transcript-api, as recent changes in YouTube's API broke the previous " +
		'implementation. I will do my best to re-implement it as soon as possible.';
}

export class NotTranslatable extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE = 'The requested language is not translatable';
}

export class TranslationLanguageNotAvailable extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE = 'The requested translation language is not available';
}

export class FailedToCreateConsentCookie extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE = 'Failed to automatically give consent to saving cookies';
}

export class NoTranscriptFound extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE =
		'No transcripts were found for any of the requested language codes: {requested_language_codes}\n\n' +
		'{transcript_data}';

	private requestedLanguageCodes: Iterable<string>;
	private transcriptData: { toString(): string };

	constructor(
		videoId: string,
		requestedLanguageCodes: Iterable<string>,
		transcriptData: { toString(): string }
	) {
		super(videoId);
		this.requestedLanguageCodes = requestedLanguageCodes;
		this.transcriptData = transcriptData;
		this._updateMessage();
	}

	protected get causeMessage(): string {
		return NoTranscriptFound.CAUSE_MESSAGE.replace(
			'{requested_language_codes}',
			String(this.requestedLanguageCodes)
		).replace('{transcript_data}', String(this.transcriptData));
	}
}

export class PoTokenRequired extends CouldNotRetrieveTranscript {
	static CAUSE_MESSAGE =
		'The requested video cannot be retrieved without a PO Token. If this happens, ' +
		'please open a GitHub issue!';
}
