import { json } from '@sveltejs/kit';
import { GOOGLE_AI_API_KEY } from '$env/static/private';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const MODEL = process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION_SET = [
	'You are a rigorous fact checker.',
	'You are receiving as user prompt a transcript from a YouTube video.',
	'Extract all the facts from this transcript, analyze them, identify factual claims, and flag any that are dubious or need citations.',
	'Search for studies and peer-reviewed papers that support of disprove the facts',
	'Return a concise report, starting with a "Summary", split the facts in categories based on how true or false they are.',
	'At the end, create a report with how many facts are true and how many are false, along with a list of studies that support or disprove.',
	'Lastly, create a list with the studies that were found, as links to the studies, having the name of the study as text.',
	'Each heading should be a H2 (##).',
	'Use emojis when relevant.'
];

if (env.ENABLE_SHORT_VERIFICATION) SYSTEM_INSTRUCTION_SET.push('Keep it short and concise.');

const SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION_SET.join(' ');

export const POST: RequestHandler = async ({ request }) => {
	if (!GOOGLE_AI_API_KEY) {
		return json({ error: 'Missing GOOGLE_AI_API_KEY environment variable.' }, { status: 500 });
	}

	const { transcript } = (await request.json().catch(() => ({}))) as {
		transcript?: string;
	};

	if (!transcript || !transcript.trim()) {
		return json({ error: 'Transcript is required.' }, { status: 400 });
	}

	try {
		const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);
		const model = genAI.getGenerativeModel({
			model: MODEL,
			systemInstruction: SYSTEM_INSTRUCTION
		});

		const result = await model.generateContentStream({
			contents: [
				{
					role: 'user',
					parts: [{ text: transcript }]
				}
			]
		});

		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					controller.enqueue(encoder.encode(':ok\n\n'));
					for await (const chunk of result.stream) {
						const text = chunk.text();
						if (text) {
							const payload = JSON.stringify({ text });
							controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
							await new Promise((resolve) => setTimeout(resolve, 0));
						}
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no'
			}
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error while calling the model.';
		return json({ error: message }, { status: 500 });
	}
};
