<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ReportDialog from '$lib/components/ReportDialog.svelte';
	import { addHistoryEntry } from '$lib/history';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { SubmitFunction } from '@sveltejs/kit';

	const { form } = $props<{
		form?: {
			error?: string;
			transcript?: string;
			sourceUrl?: string;
			videoId?: string;
			videoTitle?: string | null;
			videoDurationSeconds?: number | null;
		};
	}>();

	type ReportDialogHandle = {
		open: () => void;
		close: () => void;
	};
	const TITLE_BLINK_INTERVAL_MS = 2000;

	let url = $state('');
	let isLoading = $state(false);
	let copyStatus = $state('');
	let verifyLoading = $state(false);
	let verifyError = $state('');
	let verifyResult = $state('');
	let modelTask = $state<'verify' | 'summary'>('verify');
	let reportDialogRef = $state<ReportDialogHandle | null>(null);
	let sanitizeMarkdown = $state<((input: string) => string) | null>(null);
	let verifyProgress = $state(0);
	let verifyStatusMessage = $state('');
	let verifyProgressTimer: ReturnType<typeof setTimeout> | null = null;
	let verifyStatusTimer: ReturnType<typeof setTimeout> | null = null;
	let titleBlinkTimer: ReturnType<typeof setInterval> | null = null;
	let isDark = $state(false);
	let themeInitialized = $state(false);
	let titleAlertMode = $state<'idle' | 'loading' | 'completed'>('idle');
	let titleAlertVisible = $state(false);
	let titleAlertDismissed = $state(false);

	const verifyStatusMessages = [
		'Parsing transcript segments',
		'Identifying factual claims',
		'Extracting named entities',
		'Detecting dates and numbers',
		'Checking quotes against sources',
		'Cross-referencing public data',
		'Normalizing claim phrasing',
		'Scanning for dubious assertions',
		'Evaluating evidence strength',
		'Comparing statements to known facts',
		'Highlighting claims to verify',
		'Ranking claims by impact',
		'Reviewing contextual cues',
		'Looking for missing context',
		'Summarizing verification steps',
		'Checking for contradictory sources',
		'Evaluating uncertainty signals',
		'Reconciling overlapping claims',
		'Preparing citation-ready notes',
		'Drafting verification summary'
	];

	const summaryStatusMessages = [
		'Reading transcript structure',
		'Identifying core topics',
		'Tracking speaker intent',
		'Extracting key arguments',
		'Grouping related ideas',
		'Highlighting major conclusions',
		'Filtering repeated points',
		'Building concise overview',
		'Drafting short summary',
		'Selecting top takeaways'
	];

	onMount(async () => {
		if (browser) {
			const storedTheme = localStorage.getItem('theme');
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			isDark = storedTheme ? storedTheme === 'dark' : prefersDark;
			themeInitialized = true;
		}

		const [{ marked }, { default: DOMPurify }] = await Promise.all([
			import('marked'),
			import('dompurify')
		]);
		sanitizeMarkdown = (input: string) =>
			DOMPurify.sanitize(marked.parse(input, { async: false }) as string);
	});

	$effect(() => {
		if (!browser || !themeInitialized) return;
		document.documentElement.classList.toggle('dark', isDark);
		localStorage.setItem('theme', isDark ? 'dark' : 'light');
	});

	const transcript = $derived(form?.transcript ?? '');
	const videoTitle = $derived(form?.videoTitle ?? '');
	const videoDurationSeconds = $derived(form?.videoDurationSeconds ?? null);
	const sourceUrl = $derived(form?.sourceUrl ?? url);
	const error = $derived(form?.error ?? '');
	const words = $derived(transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0);
	const lines = $derived(transcript ? transcript.split('\n').length : 0);
	const videoDurationLabel = $derived(
		videoDurationSeconds === null
			? ''
			: (() => {
					const total = Math.max(0, Math.floor(videoDurationSeconds));
					const hours = Math.floor(total / 3600);
					const minutes = Math.floor((total % 3600) / 60);
					const seconds = total % 60;
					if (hours > 0) {
						return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
					}
					return `${minutes}:${String(seconds).padStart(2, '0')}`;
				})()
	);

	const getStatusMessages = () =>
		modelTask === 'summary' ? summaryStatusMessages : verifyStatusMessages;

	const basePageTitle = 'YouTube Transcript Fact-Checker & Summarizer';
	const activeTaskLabel = $derived(modelTask === 'summary' ? 'summary' : 'fact-check');
	const titleAlertText = $derived(
		titleAlertMode === 'loading'
			? `(1) ${activeTaskLabel} loading ...`
			: titleAlertMode === 'completed'
				? `(1) ${activeTaskLabel} completed!`
				: ''
	);
	const pageTitle = $derived(
		titleAlertMode === 'idle' ? basePageTitle : titleAlertVisible ? titleAlertText : basePageTitle
	);

	$effect(() => {
		if (titleBlinkTimer) {
			clearInterval(titleBlinkTimer);
			titleBlinkTimer = null;
		}

		if (titleAlertMode === 'idle') {
			titleAlertVisible = false;
			return;
		}

		titleAlertVisible = true;
		titleBlinkTimer = setInterval(() => {
			titleAlertVisible = !titleAlertVisible;
		}, TITLE_BLINK_INTERVAL_MS);

		return () => {
			if (titleBlinkTimer) {
				clearInterval(titleBlinkTimer);
				titleBlinkTimer = null;
			}
		};
	});

	const pickRandomStatusMessage = (current: string) => {
		const statusMessages = getStatusMessages();
		if (!statusMessages.length) return '';
		if (statusMessages.length === 1) return statusMessages[0];
		let next = current;
		while (next === current) {
			next = statusMessages[Math.floor(Math.random() * statusMessages.length)];
		}
		return next;
	};

	const stopVerifyLoadingEffects = (complete = false) => {
		if (verifyProgressTimer) {
			clearTimeout(verifyProgressTimer);
			verifyProgressTimer = null;
		}
		if (verifyStatusTimer) {
			clearTimeout(verifyStatusTimer);
			verifyStatusTimer = null;
		}
		if (complete) {
			verifyProgress = 100;
		}
	};

	const startVerifyLoadingEffects = () => {
		stopVerifyLoadingEffects();
		verifyProgress = 0;
		verifyStatusMessage = pickRandomStatusMessage('');

		const totalDuration = 30000;
		const chunkCount = 18 + Math.floor(Math.random() * 9);
		const minChunk = 2;
		const maxChunk = 10;
		const minDelay = 450;
		const maxDelay = 1800;

		const rawChunks = Array.from(
			{ length: chunkCount },
			() => minChunk + Math.random() * (maxChunk - minChunk)
		);
		const chunkTotal = rawChunks.reduce((sum, value) => sum + value, 0);
		const chunkSizes = rawChunks.map((value) => (value / chunkTotal) * 100);

		const rawDurations = Array.from(
			{ length: chunkCount },
			() => minDelay + Math.random() * (maxDelay - minDelay)
		);
		const durationTotal = rawDurations.reduce((sum, value) => sum + value, 0);
		const chunkDurations = rawDurations.map((value) => (value / durationTotal) * totalDuration);

		let chunkIndex = 0;
		const step = () => {
			if (!verifyLoading || verifyResult) return;
			verifyProgress = Math.min(99, verifyProgress + chunkSizes[chunkIndex]);
			if (verifyProgress >= 99) {
				verifyProgress = 99;
				verifyStatusMessage =
					modelTask === 'summary' ? 'Finalizing summary ...' : 'Summarizing findings ...';
				return;
			}
			chunkIndex += 1;
			if (chunkIndex >= chunkSizes.length) {
				verifyProgress = 99;
				verifyStatusMessage =
					modelTask === 'summary' ? 'Finalizing summary ...' : 'Summarizing findings ...';
				return;
			}
			verifyProgressTimer = setTimeout(step, chunkDurations[chunkIndex]);
		};

		verifyProgressTimer = setTimeout(step, chunkDurations[0]);

		const scheduleStatus = () => {
			if (!verifyLoading || verifyResult || verifyProgress >= 99) return;
			verifyStatusMessage = pickRandomStatusMessage(verifyStatusMessage);
			verifyStatusTimer = setTimeout(scheduleStatus, 2000 + Math.random() * 2000);
		};

		verifyStatusTimer = setTimeout(scheduleStatus, 2000 + Math.random() * 2000);
	};

	const enhanceForm: SubmitFunction = () => {
		isLoading = true;
		copyStatus = '';

		return async ({ update }) => {
			isLoading = false;
			await update();
		};
	};

	const handleCopy = async () => {
		if (!transcript) return;
		await navigator.clipboard.writeText(transcript);
		copyStatus = 'Copied to clipboard';
		toast.success('Transcript copied to clipboard');
		setTimeout(() => {
			copyStatus = '';
		}, 2000);
	};

	const handleModelRequest = async (task: 'verify' | 'summary') => {
		if (!transcript || verifyLoading) return;
		modelTask = task;
		verifyLoading = true;
		titleAlertDismissed = false;
		titleAlertMode = 'loading';
		verifyError = '';
		verifyResult = '';
		const historyUrl = sourceUrl.trim();
		startVerifyLoadingEffects();
		reportDialogRef?.open();
		const genericError =
			task === 'summary'
				? 'Unable to summarize the transcript right now.'
				: 'Unable to verify the transcript right now.';
		let requestSucceeded = false;

		try {
			const endpoint = task === 'summary' ? '/api/summary' : '/api/verify';

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ transcript })
			});

			if (!response.ok) {
				const errorText = await response.text();
				verifyError = errorText || genericError;
				toast.error(verifyError);
				return;
			}

			if (!response.body) {
				verifyError = 'No response stream returned from the model.';
				toast.error(verifyError);
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';

				for (const event of events) {
					const line = event.split('\n').find((part) => part.startsWith('data: '));
					if (!line) continue;
					const payload = line.slice(6);
					try {
						const { text } = JSON.parse(payload) as { text?: string };
						if (text) {
							if (!verifyResult) {
								stopVerifyLoadingEffects(true);
							}
							verifyResult += text;
						}
					} catch {
						// ignore malformed chunks
					}
				}
			}
			requestSucceeded = true;
		} catch (error) {
			verifyError = error instanceof Error ? error.message : genericError;
			toast.error(verifyError);
		} finally {
			if (requestSucceeded && verifyResult.trim()) {
				const savedEntry = addHistoryEntry({
					youtubeUrl:
						historyUrl || (form?.videoId ? `https://www.youtube.com/watch?v=${form.videoId}` : ''),
					videoTitle: videoTitle || null,
					videoDurationSeconds,
					callType: task === 'summary' ? 'summary' : 'factcheck',
					content: verifyResult
				});
				const actionLabel = task === 'summary' ? 'Summary' : 'Fact check';
				if (savedEntry) {
					toast.success(`${actionLabel} ready. Saved to history.`);
				} else {
					toast.error(`${actionLabel} completed, but it could not be saved to history.`);
				}
				if (!titleAlertDismissed) {
					titleAlertMode = 'completed';
				}
			} else {
				titleAlertMode = 'idle';
			}
			verifyLoading = false;
			stopVerifyLoadingEffects(true);
		}
	};

	const handleVerify = async () => {
		await handleModelRequest('verify');
	};

	const handleSummary = async () => {
		await handleModelRequest('summary');
	};

	const handleReportDialogClose = () => {
		titleAlertDismissed = true;
		titleAlertMode = 'idle';
	};
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta
		name="description"
		content="Paste a YouTube URL to extract its transcript, then generate an AI summary or fact-check report in seconds."
	/>
</svelte:head>

<main
	class="min-h-screen bg-blue-100 bg-size-[200%_200%] px-6 pt-6 pb-4 text-[#0F172A] sm:px-10 md:pb-10 lg:px-20 dark:bg-slate-950 dark:text-slate-100"
>
	<div class="flex items-center justify-between gap-3">
		<a
			href={resolve('/history', {})}
			class="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] transition hover:bg-[#E2E8F0] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
		>
			History
		</a>
		<button
			class="group relative inline-flex h-9 w-16 items-center rounded-full border border-[#E2E8F0] bg-white px-1 transition hover:shadow-[0_10px_20px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-900 dark:hover:shadow-[0_10px_24px_rgba(15,23,42,0.4)]"
			type="button"
			aria-pressed={isDark}
			aria-label="Toggle dark mode"
			onclick={() => (isDark = !isDark)}
		>
			<span class="sr-only">Toggle dark mode</span>
			<span
				class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[0.6rem] font-semibold text-white transition-transform duration-300 dark:text-slate-900"
				class:translate-x-7={isDark}
			>
				{isDark ? 'D' : 'L'}
			</span>
		</button>
	</div>
	<section class="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
		<div class="md:space-y-4">
			<p class="text-[0.7rem] font-semibold tracking-[0.24em] text-secondary uppercase">
				YouTube Transcript Analyzer
			</p>
			<h1
				class="hidden text-4xl leading-tight font-semibold text-[#0F172A] sm:text-5xl md:flex dark:text-slate-100"
			>
				Extract the transcript, then summarize or fact-check it.
			</h1>
			<p class="hidden max-w-2xl text-lg leading-relaxed text-secondary md:flex">
				Paste any YouTube URL to pull captions and turn the transcript into a quick summary or a
				detailed claim verification report.
			</p>
		</div>
		<form
			class="grid gap-4 rounded-[1.4rem] border border-[#E2E8F0] bg-white p-7 shadow-[0_24px_40px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_30px_50px_rgba(15,23,42,0.4)]"
			method="POST"
			use:enhance={enhanceForm}
		>
			<label class="grid gap-2 text-sm font-semibold text-[#0F172A] dark:text-slate-100">
				<span>Paste a YouTube URL</span>
				<input
					name="url"
					type="url"
					required
					placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
					bind:value={url}
					class="rounded-[0.9rem] border border-[#E2E8F0] bg-white px-4 py-3 text-base transition focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
				/>
			</label>
			<div class="grid gap-2">
				<button
					class="rounded-full bg-primary px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(29,78,216,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none dark:text-slate-950 dark:hover:shadow-[0_12px_24px_rgba(56,189,248,0.35)]"
					type="submit"
					disabled={isLoading}
				>
					{isLoading ? 'Fetching transcript…' : 'Get transcript'}
				</button>
				<p class="text-sm text-secondary">Captions must be enabled for the video.</p>
			</div>
			{#if error}
				<p class="text-sm font-semibold text-[#b3362f] dark:text-red-400">{error}</p>
			{/if}
		</form>
	</section>

	<section
		class="mt-4 rounded-[1.6rem] border border-[#E2E8F0] bg-white p-6 shadow-[0_30px_50px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_30px_60px_rgba(15,23,42,0.45)]"
	>
		<header class="flex flex-wrap items-center justify-between gap-4">
			<div class="mt-4 flex w-full items-center justify-between gap-3">
				<button
					class="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#0F172A] transition hover:bg-[#E2E8F0] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
					type="button"
					onclick={handleCopy}
					disabled={!transcript}
				>
					Copy transcript
				</button>

				<div class="flex items-center gap-2">
					<button
						class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,78,216,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none dark:text-slate-950 dark:hover:shadow-[0_12px_24px_rgba(56,189,248,0.3)]"
						type="button"
						onclick={handleVerify}
						disabled={!transcript || verifyLoading}
					>
						{verifyLoading && modelTask === 'verify' ? 'Verifying…' : 'Verify'}
					</button>
					<button
						class="rounded-full border border-primary/30 bg-primary/20 px-5 py-2 text-sm font-semibold text-primary transition hover:-translate-y-0.5 hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 dark:border-primary/35 dark:bg-primary/25 dark:text-slate-100 dark:hover:bg-primary/35"
						type="button"
						onclick={handleSummary}
						disabled={!transcript || verifyLoading}
					>
						{verifyLoading && modelTask === 'summary' ? 'Summarizing…' : 'Summary'}
					</button>
				</div>

				{#if copyStatus}
					<span class="absolute top-2 right-2 animate-bounce text-sm font-semibold text-primary"
						>{copyStatus}</span
					>
				{/if}
			</div>
		</header>

		<div
			class="mt-6 max-h-88 min-h-56 w-full overflow-auto rounded-2xl border border-[#E2E8F0] bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
		>
			{#if transcript}
				<pre
					class="w-full font-mono text-[0.95rem] leading-relaxed whitespace-pre-wrap text-[#0F172A] dark:text-slate-100">
					{transcript}
				</pre>
			{:else}
				<div class="space-y-3 text-sm leading-relaxed text-secondary">
					<p>No transcript yet. Paste a link to start pulling captions.</p>
					<ul class="list-disc space-y-1 pl-5">
						<li>Supports watch, short, and embed links.</li>
						<li>Private or caption-free videos will return an error.</li>
					</ul>
				</div>
			{/if}
		</div>
		<div>
			<h2 class="text-lg font-semibold">Transcript output</h2>
			{#if videoTitle || videoDurationLabel}
				<p class="mt-1 text-sm text-secondary">
					Video: {videoTitle || 'Untitled'}
					{#if videoDurationLabel}
						· Duration: {videoDurationLabel}
					{/if}
				</p>
			{/if}
			<p class="mt-1 text-sm text-secondary">
				{#if transcript}
					{words} words · {lines} lines
				{:else}
					Waiting for a video link.
				{/if}
			</p>
		</div>

		{#if verifyError}
			<p class="mt-3 text-sm font-semibold text-[#b3362f] dark:text-red-400">{verifyError}</p>
		{/if}
	</section>
</main>

<ReportDialog
	bind:this={reportDialogRef}
	task={modelTask}
	loading={verifyLoading}
	progress={verifyProgress}
	statusMessage={verifyStatusMessage}
	result={verifyResult}
	error={verifyError}
	{sanitizeMarkdown}
	onDialogClose={handleReportDialogClose}
/>
