import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	AgeRestricted,
	FailedToCreateConsentCookie,
	IpBlocked,
	RequestBlocked,
	TranscriptsDisabled,
	VideoUnavailable,
	VideoUnplayable,
	YouTubeDataUnparsable,
	YouTubeRequestFailed,
	YouTubeTranscriptApi,
	type FetchedTranscriptSnippet
} from '$lib/youtube-transcript/src';
import { decodeHtml } from '$lib/youtube-transcript/src/utils';
import type { Actions } from './$types';

const YOUTUBE_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'youtu.be',
	'www.youtu.be'
]);

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const extractVideoId = (input: string): string | null => {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

	try {
		const url = new URL(trimmed);
		if (!YOUTUBE_HOSTS.has(url.hostname)) return null;

		if (url.hostname === 'youtu.be') {
			const shortId = url.pathname.split('/').filter(Boolean)[0];
			return shortId && VIDEO_ID_REGEX.test(shortId) ? shortId : null;
		}

		const vParam = url.searchParams.get('v');
		if (vParam && VIDEO_ID_REGEX.test(vParam)) return vParam;

		const pathMatch = url.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/);
		if (pathMatch && VIDEO_ID_REGEX.test(pathMatch[2])) return pathMatch[2];
	} catch {
		return null;
	}

	return null;
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const url = String(data.get('url') ?? '').trim();

		if (!url) {
			return fail(400, { error: 'Add a YouTube URL to fetch the transcript.' });
		}

		const videoId = extractVideoId(url);
		if (!videoId) {
			return fail(400, {
				error: 'That link does not look like a valid YouTube video URL. Try a standard watch link.'
			});
		}

		try {
			const api = new YouTubeTranscriptApi();
			const transcriptData = await api.fetch(videoId, { languages: ['en'] });
			const transcript = transcriptData
				.toRawData()
				.map((item: FetchedTranscriptSnippet) => decodeHtml(item.text).replace(/\\n/g, ' '))
				.join(' ');

			if (!transcript) {
				return fail(404, {
					error: 'No transcript was returned for this video. It may not have captions available.'
				});
			}

			return {
				transcript,
				sourceUrl: url,
				videoId
			};
		} catch (error) {
			if (env.TRANSCRIPT_DEBUG === 'true') {
				console.error('[transcript] fetch failed', error);
			}

			let message = 'Unable to fetch the transcript right now.';
			if (error instanceof TranscriptsDisabled) {
				message = 'Captions are disabled for this video.';
			} else if (error instanceof AgeRestricted) {
				message = 'This video is age-restricted and cannot be fetched by the server.';
			} else if (error instanceof VideoUnavailable) {
				message = 'This video is unavailable.';
			} else if (error instanceof RequestBlocked || error instanceof IpBlocked) {
				message =
					'YouTube is blocking requests from this server (common on Netlify). Try again later or use a proxy.';
			} else if (error instanceof FailedToCreateConsentCookie) {
				message = 'YouTube consent checks blocked the transcript retrieval.';
			} else if (error instanceof YouTubeRequestFailed || error instanceof YouTubeDataUnparsable) {
				message = 'YouTube did not return transcript data in the expected format.';
			} else if (error instanceof VideoUnplayable) {
				message = error.message;
			} else if (error instanceof Error) {
				message = error.message;
			}
			return fail(500, { error: message });
		}
	}
};
