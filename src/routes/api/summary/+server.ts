import { json } from '@sveltejs/kit';
import { GOOGLE_AI_API_KEY } from '$env/static/private';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { RequestHandler } from './$types';

const MODEL = process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = [
	'You are an expert video summarizer.',
	'You are receiving as user prompt a transcript from a YouTube video.',
	'Create a clear and accurate summary of the transcript only, without inventing facts.',
	'Start with a section titled "General Summary" that explains the full video in a few concise paragraphs.',
	'Then add a section titled "Short Summary" with 2-3 sentences.',
	'Then add a section titled "Main Ideas" as bullet points with the most important takeaways.',
	'Prioritize concrete details, key arguments, and conclusions from the transcript.',
	'Use Markdown headings and make each heading an H2 (##).'
].join(' ');

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
