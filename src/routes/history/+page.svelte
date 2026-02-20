<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import ReportDialog from '$lib/components/ReportDialog.svelte';
	import {
		HISTORY_STORAGE_KEY,
		getHistoryEntries,
		setHistoryEntries,
		type HistoryEntry
	} from '$lib/history';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	type ReportDialogHandle = {
		open: () => void;
		close: () => void;
	};

	let historyEntries = $state<HistoryEntry[]>([]);
	let selectedTask = $state<'verify' | 'summary'>('verify');
	let selectedResult = $state('');
	let sanitizeMarkdown = $state<((input: string) => string) | null>(null);
	let reportDialogRef = $state<ReportDialogHandle | null>(null);

	const loadHistory = () => {
		historyEntries = getHistoryEntries();
	};

	const handleClearHistory = () => {
		if (!historyEntries.length) return;
		setHistoryEntries([]);
		historyEntries = [];
		toast.success('History cleared');
	};

	const openHistoryEntry = (entry: HistoryEntry) => {
		selectedTask = entry.callType === 'summary' ? 'summary' : 'verify';
		selectedResult = entry.content;
		reportDialogRef?.open();
	};

	const openVideo = (youtubeUrl: string) => {
		if (!browser) return;
		window.open(youtubeUrl, '_blank', 'noopener,noreferrer');
	};

	const formatCallType = (entry: HistoryEntry) =>
		entry.callType === 'summary' ? 'Summary' : 'Fact check';

	const formatDate = (isoDate: string) =>
		new Date(isoDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	const formatDuration = (durationSeconds: number | null | undefined): string => {
		if (
			typeof durationSeconds !== 'number' ||
			!Number.isFinite(durationSeconds) ||
			durationSeconds < 0
		) {
			return '';
		}
		const total = Math.floor(durationSeconds);
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const seconds = total % 60;

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}

		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	};

	onMount(() => {
		loadHistory();
		if (browser) {
			const onStorage = (event: StorageEvent) => {
				if (event.key === HISTORY_STORAGE_KEY) {
					loadHistory();
				}
			};
			window.addEventListener('storage', onStorage);

			void Promise.all([import('marked'), import('dompurify')]).then(
				([{ marked }, { default: DOMPurify }]) => {
					sanitizeMarkdown = (input: string) =>
						DOMPurify.sanitize(marked.parse(input, { async: false }) as string);
				}
			);

			return () => {
				window.removeEventListener('storage', onStorage);
			};
		}
	});
</script>

<svelte:head>
	<title>History | YouTube Transcript Fact-Checker & Summarizer</title>
	<meta
		name="description"
		content="Review previously generated summary and fact-check reports saved in your browser."
	/>
</svelte:head>

<main
	class="min-h-screen bg-blue-100 px-6 pt-6 pb-10 text-[#0F172A] sm:px-10 lg:px-20 dark:bg-slate-950 dark:text-slate-100"
>
	<div class="mx-auto w-full max-w-5xl space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<a
				href={resolve('/', {})}
				class="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] transition hover:bg-[#E2E8F0] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
			>
				Back to analyzer
			</a>
			<button
				class="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] transition hover:bg-[#E2E8F0] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
				type="button"
				onclick={handleClearHistory}
				disabled={!historyEntries.length}
			>
				Clear history
			</button>
		</div>

		<section
			class="rounded-[1.4rem] border border-[#E2E8F0] bg-white p-6 shadow-[0_24px_40px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_30px_50px_rgba(15,23,42,0.4)]"
		>
			<p class="text-[0.7rem] font-semibold tracking-[0.24em] text-secondary uppercase">History</p>
			<h1 class="mt-2 text-3xl leading-tight font-semibold">Saved reports</h1>
			<p class="mt-3 text-sm text-secondary">
				Every summary or fact-check generated on this browser is stored locally.
			</p>
		</section>

		<section
			class="rounded-[1.6rem] border border-[#E2E8F0] bg-white p-6 shadow-[0_30px_50px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_30px_60px_rgba(15,23,42,0.45)]"
		>
			{#if historyEntries.length}
				<ul class="space-y-3">
					{#each historyEntries as entry (entry.id)}
						<li
							class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
						>
							<div class="min-w-0 flex-1">
								<p class="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
									{formatCallType(entry)}
								</p>
								<p class="mt-1 truncate text-sm font-semibold">
									{entry.videoTitle?.trim() || 'Untitled video'}
								</p>
								<p class="mt-1 truncate text-xs text-secondary">{entry.youtubeUrl}</p>
								<p class="mt-1 text-xs text-secondary">
									{formatDate(entry.createdAt)}
									{#if formatDuration(entry.videoDurationSeconds)}
										· {formatDuration(entry.videoDurationSeconds)}
									{/if}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<button
									class="rounded-full border border-[#E2E8F0] px-4 py-2 text-xs font-semibold transition hover:bg-[#E2E8F0] dark:border-slate-700 dark:hover:bg-slate-800"
									type="button"
									onclick={() => openVideo(entry.youtubeUrl)}
								>
									Open video
								</button>
								<button
									class="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,78,216,0.25)] dark:text-slate-950 dark:hover:shadow-[0_12px_24px_rgba(56,189,248,0.3)]"
									type="button"
									onclick={() => openHistoryEntry(entry)}
								>
									View report
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="rounded-2xl border border-dashed border-[#CBD5E1] p-6 text-sm text-secondary">
					No saved reports yet. Run a summary or fact-check from the home page to populate history.
				</div>
			{/if}
		</section>
	</div>
</main>

<ReportDialog
	bind:this={reportDialogRef}
	task={selectedTask}
	loading={false}
	progress={100}
	statusMessage=""
	result={selectedResult}
	error=""
	{sanitizeMarkdown}
/>
