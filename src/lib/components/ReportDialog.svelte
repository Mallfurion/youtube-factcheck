<script lang="ts">
	type ModelTask = 'verify' | 'summary';

	const {
		task = 'verify',
		loading = false,
		progress = 0,
		statusMessage = '',
		result = '',
		error = '',
		sanitizeMarkdown = null
	} = $props<{
		task?: ModelTask;
		loading?: boolean;
		progress?: number;
		statusMessage?: string;
		result?: string;
		error?: string;
		sanitizeMarkdown?: ((input: string) => string) | null;
	}>();

	let dialogRef = $state<HTMLDialogElement | null>(null);
	let dialogBodyRef = $state<HTMLDivElement | null>(null);
	let autoScrollEnabled = $state(true);
	let previousResultLength = $state(0);

	const reportHtml = $derived(result && sanitizeMarkdown ? sanitizeMarkdown(result) : '');

	const renderMarkdown = (node: HTMLElement, html: string) => {
		node.innerHTML = html;
		return {
			update(newHtml: string) {
				node.innerHTML = newHtml;
			},
			destroy() {
				node.innerHTML = '';
			}
		};
	};

	export function open() {
		autoScrollEnabled = true;
		dialogRef?.showModal();
	}

	export function close() {
		dialogRef?.close();
	}

	const handleDialogScroll = () => {
		if (!dialogBodyRef) return;
		const { scrollTop, scrollHeight, clientHeight } = dialogBodyRef;
		autoScrollEnabled = scrollHeight - scrollTop - clientHeight < 24;
	};

	$effect(() => {
		if (!loading || result) return;
		autoScrollEnabled = true;
		previousResultLength = 0;
	});

	$effect(() => {
		const nextLength = result.length;
		const shouldScroll = Boolean(
			dialogBodyRef && autoScrollEnabled && nextLength > previousResultLength
		);
		previousResultLength = nextLength;
		if (!shouldScroll || !dialogBodyRef) return;
		requestAnimationFrame(() => {
			if (dialogBodyRef && autoScrollEnabled) {
				dialogBodyRef.scrollTop = dialogBodyRef.scrollHeight;
			}
		});
	});
</script>

<dialog
	bind:this={dialogRef}
	class="mt-4 h-full w-full max-w-none rounded-3xl border border-[#E2E8F0] bg-white p-0 text-left text-[#0F172A] shadow-[0_30px_60px_rgba(15,23,42,0.2)] backdrop:bg-black/40 md:m-auto md:w-[80vh] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_30px_70px_rgba(0,0,0,0.6)]"
>
	<div
		class="flex items-start justify-between gap-4 border-b border-[#E2E8F0] px-6 py-5 dark:border-slate-800"
	>
		<div>
			<p class="text-secondary text-xs font-semibold tracking-[0.24em] uppercase">
				{task === 'summary' ? 'Summary report' : 'Verification report'}
			</p>
			<h3 class="text-xl font-semibold">
				{task === 'summary' ? 'Video summary' : 'Fact check summary'}
			</h3>
		</div>
		<button
			class="rounded-full border border-[#E2E8F0] px-3 py-1 text-sm font-semibold text-[#0F172A] transition hover:bg-[#E2E8F0] dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
			type="button"
			onclick={close}
		>
			Close
		</button>
	</div>
	<div
		class="max-h-[80vh] overflow-auto px-6 py-5"
		bind:this={dialogBodyRef}
		onscroll={handleDialogScroll}
	>
		{#if loading && !result}
			<div class="text-secondary space-y-4 text-sm">
				<div class="space-y-2">
					<div
						class="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-slate-800"
						role="progressbar"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={Math.round(progress)}
					>
						<div
							class="bg-primary h-full rounded-full transition-[width] duration-500 ease-out"
							style={`width: ${progress}%;`}
						></div>
					</div>
					<div class="flex items-center justify-between text-xs font-semibold text-[#64748B]">
						<span>{task === 'summary' ? 'Summary progress' : 'Verification progress'}</span>
						<span>{Math.round(progress)}%</span>
					</div>
				</div>
				<div class="h-4 w-40 animate-pulse rounded-full bg-[#E2E8F0] dark:bg-slate-800"></div>
				<div class="h-3 w-full animate-pulse rounded-full bg-[#E2E8F0] dark:bg-slate-800"></div>
				<div class="h-3 w-11/12 animate-pulse rounded-full bg-[#E2E8F0] dark:bg-slate-800"></div>
				<div class="h-3 w-10/12 animate-pulse rounded-full bg-[#E2E8F0] dark:bg-slate-800"></div>
				<p class="text-secondary text-sm font-semibold">
					{statusMessage
						? `${statusMessage} ...`
						: task === 'summary'
							? 'Summarizing video…'
							: 'Verifying claims…'}
				</p>
			</div>
		{:else if result}
			{#if sanitizeMarkdown}
				<div
					class="[&_a]:text-primary [&_blockquote]:text-secondary space-y-3 text-sm leading-relaxed text-[#0F172A] dark:text-slate-100 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-black/20 [&_blockquote]:pl-3 dark:[&_blockquote]:border-white/10 dark:[&_blockquote]:text-slate-300 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 dark:[&_code]:bg-white/10 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
					use:renderMarkdown={reportHtml}
				></div>
			{:else}
				<pre
					class="w-full font-mono text-[0.9rem] leading-relaxed whitespace-pre-wrap text-[#0F172A] dark:text-slate-100">{result}</pre>
			{/if}
		{:else if error}
			<p class="text-sm font-semibold text-[#b3362f] dark:text-red-400">{error}</p>
		{:else}
			<p class="text-secondary text-sm">
				{task === 'summary' ? 'No summary response yet.' : 'No verification response yet.'}
			</p>
		{/if}
	</div>
</dialog>
