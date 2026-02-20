import { browser } from '$app/environment';

export const HISTORY_STORAGE_KEY = 'yt-factcheck-history';
const MAX_HISTORY_ITEMS = 50;

export type HistoryCallType = 'factcheck' | 'summary';

export interface HistoryEntry {
	id: string;
	createdAt: string;
	youtubeUrl: string;
	videoTitle?: string | null;
	videoDurationSeconds?: number | null;
	callType: HistoryCallType;
	content: string;
}

const isHistoryCallType = (value: unknown): value is HistoryCallType =>
	value === 'factcheck' || value === 'summary';

const isHistoryEntry = (value: unknown): value is HistoryEntry => {
	if (!value || typeof value !== 'object') return false;
	const item = value as Record<string, unknown>;

	return (
		typeof item.id === 'string' &&
		typeof item.createdAt === 'string' &&
		typeof item.youtubeUrl === 'string' &&
		(item.videoTitle === undefined ||
			item.videoTitle === null ||
			typeof item.videoTitle === 'string') &&
		(item.videoDurationSeconds === undefined ||
			item.videoDurationSeconds === null ||
			(typeof item.videoDurationSeconds === 'number' &&
				Number.isFinite(item.videoDurationSeconds) &&
				item.videoDurationSeconds >= 0)) &&
		isHistoryCallType(item.callType) &&
		typeof item.content === 'string'
	);
};

const parseHistoryEntries = (raw: string | null): HistoryEntry[] => {
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isHistoryEntry);
	} catch {
		return [];
	}
};

const createHistoryId = (): string => {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getHistoryEntries = (): HistoryEntry[] => {
	if (!browser) return [];
	return parseHistoryEntries(localStorage.getItem(HISTORY_STORAGE_KEY));
};

export const setHistoryEntries = (entries: HistoryEntry[]): void => {
	if (!browser) return;
	localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ITEMS)));
};

export const addHistoryEntry = (entry: {
	youtubeUrl: string;
	videoTitle?: string | null;
	videoDurationSeconds?: number | null;
	callType: HistoryCallType;
	content: string;
}): HistoryEntry | null => {
	if (!browser) return null;

	const youtubeUrl = entry.youtubeUrl.trim();
	const content = entry.content.trim();
	const videoTitle =
		typeof entry.videoTitle === 'string'
			? entry.videoTitle.trim() || null
			: (entry.videoTitle ?? null);
	const videoDurationSeconds =
		typeof entry.videoDurationSeconds === 'number' &&
		Number.isFinite(entry.videoDurationSeconds) &&
		entry.videoDurationSeconds >= 0
			? Math.floor(entry.videoDurationSeconds)
			: null;
	if (!youtubeUrl || !content) return null;

	const nextEntry: HistoryEntry = {
		id: createHistoryId(),
		createdAt: new Date().toISOString(),
		youtubeUrl,
		videoTitle,
		videoDurationSeconds,
		callType: entry.callType,
		content
	};

	setHistoryEntries([nextEntry, ...getHistoryEntries()]);
	return nextEntry;
};
