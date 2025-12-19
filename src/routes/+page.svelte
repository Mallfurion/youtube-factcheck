<script lang="ts">
	import { enhance } from '$app/forms';

	const { data } = $props<{
		data: {
			form?: {
				error?: string;
				transcript?: string;
				videoId?: string;
			};
		};
	}>();

	let url = $state('');
	let isLoading = $state(false);
	let copyStatus = $state('');

	const transcript = $derived(data?.form?.transcript ?? '');
	const error = $derived(data?.form?.error ?? '');
	const words = $derived(
		transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0
	);
	const lines = $derived(transcript ? transcript.split('\n').length : 0);

	const enhanceForm = enhance(() => {
		isLoading = true;
		copyStatus = '';

		return async ({ update }) => {
			isLoading = false;
			await update();
		};
	});

	const handleCopy = async () => {
		if (!transcript) return;
		await navigator.clipboard.writeText(transcript);
		copyStatus = 'Copied to clipboard';
		setTimeout(() => {
			copyStatus = '';
		}, 2000);
	};
</script>

<main class="page">
	<section class="hero">
		<div class="headline">
			<p class="eyebrow">YouTube Fact Checker</p>
			<h1>Lift the transcript, audit the claims.</h1>
			<p class="subhead">
				Drop a YouTube link and pull down the full transcript so you can copy, annotate, and
				verify the facts fast.
			</p>
		</div>
		<form class="card" method="POST" use:enhance={enhanceForm}>
			<label class="field">
				<span>Paste a YouTube URL</span>
				<input
					name="url"
					type="url"
					required
					placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
					bind:value={url}
				/>
			</label>
			<div class="actions">
				<button class="primary" type="submit" disabled={isLoading}>
					{isLoading ? 'Fetching transcript…' : 'Get transcript'}
				</button>
				<p class="helper">Captions must be enabled for the video.</p>
			</div>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</form>
	</section>

	<section class="panel">
		<header class="panel-header">
			<div>
				<h2>Transcript output</h2>
				<p>
					{#if transcript}
						{words} words · {lines} lines
					{:else}
						Waiting for a video link.
					{/if}
				</p>
			</div>
			<div class="panel-actions">
				<button class="ghost" type="button" onclick={handleCopy} disabled={!transcript}>
					Copy transcript
				</button>
				{#if copyStatus}
					<span class="copy-status">{copyStatus}</span>
				{/if}
			</div>
		</header>

		<div class="transcript-shell">
			{#if transcript}
				<pre>{transcript}</pre>
			{:else}
				<div class="empty">
					<p>No transcript yet. Paste a link to start pulling captions.</p>
					<ul>
						<li>Supports watch, short, and embed links.</li>
						<li>Private or caption-free videos will return an error.</li>
					</ul>
				</div>
			{/if}
		</div>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Space Grotesk', 'IBM Plex Sans', 'Segoe UI', sans-serif;
		background: radial-gradient(circle at top, #ffe9c4 0%, #f5f0ea 45%, #eef4f3 100%);
		color: #1f1a17;
	}

	:global(*) {
		box-sizing: border-box;
	}

	.page {
		min-height: 100vh;
		padding: clamp(2.5rem, 5vw, 5rem);
		display: grid;
		gap: clamp(2rem, 4vw, 3rem);
	}

	.hero {
		display: grid;
		gap: 2rem;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		align-items: start;
	}

	.headline h1 {
		font-size: clamp(2.2rem, 4vw, 3.6rem);
		line-height: 1.05;
		margin: 0 0 1rem 0;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.24em;
		font-size: 0.7rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: #6d4a2f;
	}

	.subhead {
		font-size: 1.1rem;
		line-height: 1.6;
		max-width: 34rem;
		color: #3d312c;
	}

	.card {
		background: rgba(255, 255, 255, 0.85);
		padding: 1.8rem;
		border-radius: 1.4rem;
		box-shadow: 0 24px 40px rgba(132, 89, 52, 0.16);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(120, 92, 72, 0.15);
		display: grid;
		gap: 1.2rem;
	}

	.field {
		display: grid;
		gap: 0.5rem;
		font-weight: 600;
		color: #3f3028;
	}

	.field input {
		border-radius: 0.9rem;
		border: 1px solid rgba(92, 67, 50, 0.2);
		padding: 0.9rem 1rem;
		font-size: 1rem;
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
		background: #fffaf4;
	}

	.field input:focus {
		outline: none;
		border-color: #ea8e3d;
		box-shadow: 0 0 0 3px rgba(234, 142, 61, 0.2);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.primary {
		background: #1f1a17;
		color: #f7f1ea;
		border: none;
		padding: 0.95rem 1.6rem;
		border-radius: 999px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 12px 24px rgba(31, 26, 23, 0.2);
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.helper {
		margin: 0;
		color: #6d5b52;
		font-size: 0.9rem;
	}

	.error {
		margin: 0;
		color: #b3362f;
		font-weight: 600;
	}

	.panel {
		background: #ffffff;
		border-radius: 1.6rem;
		padding: clamp(1.4rem, 3vw, 2rem);
		box-shadow: 0 30px 50px rgba(79, 65, 50, 0.12);
		border: 1px solid rgba(86, 70, 54, 0.15);
	}

	.panel-header {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
	}

	.panel-header h2 {
		margin: 0;
		font-size: 1.2rem;
	}

	.panel-header p {
		margin: 0.3rem 0 0;
		color: #6d5b52;
	}

	.panel-actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}

	.ghost {
		background: transparent;
		border: 1px solid rgba(86, 70, 54, 0.3);
		padding: 0.6rem 1rem;
		border-radius: 999px;
		cursor: pointer;
		font-weight: 600;
		color: #3a2d26;
		transition: background 0.2s ease, color 0.2s ease;
	}

	.ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ghost:hover:not(:disabled) {
		background: #f3e9de;
	}

	.copy-status {
		font-size: 0.85rem;
		color: #176b58;
		font-weight: 600;
	}

	.transcript-shell {
		margin-top: 1.5rem;
		background: #fdf9f4;
		border-radius: 1rem;
		border: 1px solid rgba(86, 70, 54, 0.12);
		padding: 1.2rem;
		min-height: 14rem;
		max-height: 22rem;
		overflow: auto;
	}

	.transcript-shell pre {
		white-space: pre-wrap;
		margin: 0;
		font-family: 'IBM Plex Mono', 'Space Mono', ui-monospace, monospace;
		line-height: 1.6;
		font-size: 0.95rem;
		color: #2f2520;
	}

	.empty {
		color: #6a5a52;
		line-height: 1.6;
	}

	.empty ul {
		margin: 0.8rem 0 0;
		padding-left: 1.2rem;
	}

	@media (max-width: 720px) {
		.page {
			padding: 2rem 1.5rem 3rem;
		}

		.panel-actions {
			width: 100%;
			justify-content: flex-start;
		}
	}
</style>
