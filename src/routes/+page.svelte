<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	const { form } = $props<{
		form?: {
			error?: string;
			transcript?: string;
			videoId?: string;
		};
	}>();

	let url = $state('');
	let isLoading = $state(false);
	let copyStatus = $state('');
	let verifyLoading = $state(false);
	let verifyError = $state('');
	let verifyResult = $state('');
	let dialogRef = $state<HTMLDialogElement | null>(null);
	let dialogBodyRef = $state<HTMLDivElement | null>(null);
	let sanitizeMarkdown = $state<((input: string) => string) | null>(null);

	onMount(async () => {
		const [{ marked }, { default: DOMPurify }] = await Promise.all([
			import('marked'),
			import('dompurify')
		]);
		sanitizeMarkdown = (input: string) =>
			DOMPurify.sanitize(marked.parse(input, { async: false }) as string);
	});

	const verifyHtml = $derived(
		verifyResult && sanitizeMarkdown ? sanitizeMarkdown(verifyResult) : ''
	);

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

	const transcript = $derived(form?.transcript ?? '');
	const error = $derived(form?.error ?? '');
	const words = $derived(transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0);
	const lines = $derived(transcript ? transcript.split('\n').length : 0);

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
		setTimeout(() => {
			copyStatus = '';
		}, 2000);
	};

	const handleVerify = async () => {
		if (!transcript || verifyLoading) return;
		verifyLoading = true;
		verifyError = '';
		verifyResult = '';
		dialogRef?.showModal();

		try {
			const response = await fetch('/api/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ transcript })
			});

			if (!response.ok) {
				const errorText = await response.text();
				verifyError = errorText || 'Unable to verify the transcript right now.';
				return;
			}

			if (!response.body) {
				verifyError = 'No response stream returned from the model.';
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let scheduledScroll = false;

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
							verifyResult += text;
							if (!scheduledScroll) {
								scheduledScroll = true;
								requestAnimationFrame(() => {
									if (dialogBodyRef) {
										dialogBodyRef.scrollTop = dialogBodyRef.scrollHeight;
									}
									scheduledScroll = false;
								});
							}
						}
					} catch {
						// ignore malformed chunks
					}
				}
			}
		} catch (error) {
			verifyError =
				error instanceof Error ? error.message : 'Unable to verify the transcript right now.';
		} finally {
			verifyLoading = false;
		}
	};
</script>

<main
	class="min-h-screen bg-blue-100 bg-size-[200%_200%] px-6 py-4 text-[#0F172A] sm:px-10 md:py-10 lg:px-20"
>
	<section class="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
		<div class="md:space-y-4">
			<p class="text-[0.7rem] font-semibold tracking-[0.24em] text-[#475569] uppercase">
				YouTube Fact Checker
			</p>
			<h1 class="hidden text-4xl leading-tight font-semibold text-[#0F172A] sm:text-5xl md:flex">
				Lift the transcript, audit the claims.
			</h1>
			<p class="hidden max-w-2xl text-lg leading-relaxed text-[#475569] md:flex">
				Drop a YouTube link and pull down the full transcript so you can copy, annotate, and verify
				the facts fast.
			</p>
		</div>
		<form
			class="grid gap-4 rounded-[1.4rem] border border-[#E2E8F0] bg-white p-7 shadow-[0_24px_40px_rgba(15,23,42,0.08)]"
			method="POST"
			use:enhance={enhanceForm}
		>
			<label class="grid gap-2 text-sm font-semibold text-[#0F172A]">
				<span>Paste a YouTube URL</span>
				<input
					name="url"
					type="url"
					required
					placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
					bind:value={url}
					class="rounded-[0.9rem] border border-[#E2E8F0] bg-white px-4 py-3 text-base transition focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/30 focus:outline-none"
				/>
			</label>
			<div class="grid gap-2">
				<button
					class="rounded-full bg-[#1D4ED8] px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(29,78,216,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
					type="submit"
					disabled={isLoading}
				>
					{isLoading ? 'Fetching transcript…' : 'Get transcript'}
				</button>
				<p class="text-sm text-[#475569]">Captions must be enabled for the video.</p>
			</div>
			{#if error}
				<p class="text-sm font-semibold text-[#b3362f]">{error}</p>
			{/if}
		</form>
	</section>

	<section
		class="mt-4 rounded-[1.6rem] border border-[#E2E8F0] bg-white p-6 shadow-[0_30px_50px_rgba(15,23,42,0.08)]"
	>
		<header class="flex flex-wrap items-center justify-between gap-4">
			<div class="mt-4 flex w-full justify-between">
				<button
					class="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#0F172A] transition hover:bg-[#E2E8F0] disabled:cursor-not-allowed disabled:opacity-50"
					type="button"
					onclick={handleCopy}
					disabled={!transcript}
				>
					Copy transcript
				</button>
				<button
					class="rounded-full bg-[#1D4ED8] px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(29,78,216,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
					type="button"
					onclick={handleVerify}
					disabled={!transcript || verifyLoading}
				>
					{verifyLoading ? 'Verifying…' : 'Verify'}
				</button>

				{#if copyStatus}
					<span class="absolute top-2 right-2 animate-bounce text-sm font-semibold text-[#1D4ED8]"
						>{copyStatus}</span
					>
				{/if}
			</div>
		</header>

		<div
			class="mt-6 max-h-88 min-h-56 w-full overflow-auto rounded-2xl border border-[#E2E8F0] bg-white p-5"
		>
			{#if transcript}
				<pre
					class="w-full font-mono text-[0.95rem] leading-relaxed whitespace-pre-wrap text-[#0F172A]">
					{transcript}
				</pre>
			{:else}
				<div class="space-y-3 text-sm leading-relaxed text-[#475569]">
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
			<p class="mt-1 text-sm text-[#475569]">
				{#if transcript}
					{words} words · {lines} lines
				{:else}
					Waiting for a video link.
				{/if}
			</p>
		</div>

		{#if verifyError}
			<p class="mt-3 text-sm font-semibold text-[#b3362f]">{verifyError}</p>
		{/if}
	</section>
</main>

<dialog
	bind:this={dialogRef}
	class=" mt-4 h-full w-full max-w-none rounded-3xl border border-[#E2E8F0] bg-white p-0 text-left text-[#0F172A] shadow-[0_30px_60px_rgba(15,23,42,0.2)] backdrop:bg-black/40"
>
	<div class="flex items-start justify-between gap-4 border-b border-[#E2E8F0] px-6 py-5">
		<div>
			<p class="text-xs font-semibold tracking-[0.24em] text-[#475569] uppercase">
				Verification report
			</p>
			<h3 class="text-xl font-semibold">Fact check summary</h3>
		</div>
		<button
			class="rounded-full border border-[#E2E8F0] px-3 py-1 text-sm font-semibold text-[#0F172A] transition hover:bg-[#E2E8F0]"
			type="button"
			onclick={() => dialogRef?.close()}
		>
			Close
		</button>
	</div>
	<div class="max-h-[90vh] overflow-auto px-6 py-5" bind:this={dialogBodyRef}>
		{#if verifyLoading && !verifyResult}
			<div class="space-y-3 text-sm text-[#475569]">
				<div class="h-4 w-40 animate-pulse rounded-full bg-[#E2E8F0]"></div>
				<div class="h-3 w-full animate-pulse rounded-full bg-[#E2E8F0]"></div>
				<div class="h-3 w-11/12 animate-pulse rounded-full bg-[#E2E8F0]"></div>
				<div class="h-3 w-10/12 animate-pulse rounded-full bg-[#E2E8F0]"></div>
				<p class="text-sm font-semibold text-[#475569]">Verifying claims…</p>
			</div>
		{:else if verifyResult}
			<div
				class="space-y-3 text-sm leading-relaxed text-[#0F172A] [&_a]:text-[#1D4ED8] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-black/20 [&_blockquote]:pl-3 [&_blockquote]:text-[#475569] [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
				use:renderMarkdown={verifyHtml}
			></div>
		{:else if verifyError}
			<p class="text-sm font-semibold text-[#b3362f]">{verifyError}</p>
		{:else}
			<p class="text-sm text-[#475569]">No verification response yet.</p>
		{/if}
	</div>
</dialog>

<style>
	@keyframes gradientShift {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}
</style>
