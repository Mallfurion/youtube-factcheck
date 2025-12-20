import type { FetchedTranscript, FetchedTranscriptSnippet } from './transcripts';

export class Formatter {
	formatTranscript(_transcript: FetchedTranscript): string {
		throw new Error('A subclass of Formatter must implement their own .formatTranscript() method.');
	}

	formatTranscripts(_transcripts: FetchedTranscript[]): string {
		throw new Error(
			'A subclass of Formatter must implement their own .formatTranscripts() method.'
		);
	}
}

export class PrettyPrintFormatter extends Formatter {
	formatTranscript(transcript: FetchedTranscript, options: { indent?: number } = {}): string {
		return this._prettyPrint(transcript.toRawData(), options);
	}

	formatTranscripts(transcripts: FetchedTranscript[], options: { indent?: number } = {}): string {
		return this._prettyPrint(
			transcripts.map((transcript) => transcript.toRawData()),
			options
		);
	}

	private _prettyPrint(value: unknown, options: { indent?: number }): string {
		const indent = Number.isInteger(options.indent) ? options.indent : 2;
		return JSON.stringify(value, null, indent);
	}
}

export class JSONFormatter extends Formatter {
	formatTranscript(transcript: FetchedTranscript, options: { space?: number } = {}): string {
		const space = options.space ?? 0;
		return JSON.stringify(transcript.toRawData(), null, space);
	}

	formatTranscripts(transcripts: FetchedTranscript[], options: { space?: number } = {}): string {
		const space = options.space ?? 0;
		return JSON.stringify(
			transcripts.map((transcript) => transcript.toRawData()),
			null,
			space
		);
	}
}

export class TextFormatter extends Formatter {
	formatTranscript(transcript: FetchedTranscript): string {
		return transcript.snippets.map((line) => line.text).join('\n');
	}

	formatTranscripts(transcripts: FetchedTranscript[]): string {
		return transcripts.map((transcript) => this.formatTranscript(transcript)).join('\n\n\n');
	}
}

abstract class TextBasedFormatter extends TextFormatter {
	protected abstract _formatTimestamp(
		hours: number,
		mins: number,
		secs: number,
		ms: number
	): string;
	protected abstract _formatTranscriptHeader(lines: string[]): string;
	protected abstract _formatTranscriptHelper(
		index: number,
		timeText: string,
		snippet: FetchedTranscriptSnippet
	): string;

	protected _secondsToTimestamp(time: number): string {
		const seconds = Number(time);
		const hoursFloat = Math.floor(seconds / 3600);
		const remainder = seconds % 3600;
		const minsFloat = Math.floor(remainder / 60);
		const secsFloat = Math.floor(remainder % 60);
		const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
		return this._formatTimestamp(hoursFloat, minsFloat, secsFloat, ms);
	}

	formatTranscript(transcript: FetchedTranscript): string {
		const lines: string[] = [];
		for (let i = 0; i < transcript.snippets.length; i += 1) {
			const line = transcript.snippets[i];
			const end = line.start + line.duration;
			const nextStart =
				i < transcript.snippets.length - 1 && transcript.snippets[i + 1].start < end
					? transcript.snippets[i + 1].start
					: end;
			const timeText = `${this._secondsToTimestamp(line.start)} --> ${this._secondsToTimestamp(
				nextStart
			)}`;
			lines.push(this._formatTranscriptHelper(i, timeText, line));
		}

		return this._formatTranscriptHeader(lines);
	}
}

export class SRTFormatter extends TextBasedFormatter {
	protected _formatTimestamp(hours: number, mins: number, secs: number, ms: number): string {
		return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
			secs
		).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
	}

	protected _formatTranscriptHeader(lines: string[]): string {
		return `${lines.join('\n\n')}\n`;
	}

	protected _formatTranscriptHelper(
		index: number,
		timeText: string,
		snippet: FetchedTranscriptSnippet
	): string {
		return `${index + 1}\n${timeText}\n${snippet.text}`;
	}
}

export class WebVTTFormatter extends TextBasedFormatter {
	protected _formatTimestamp(hours: number, mins: number, secs: number, ms: number): string {
		return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
			secs
		).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
	}

	protected _formatTranscriptHeader(lines: string[]): string {
		return `WEBVTT\n\n${lines.join('\n\n')}\n`;
	}

	protected _formatTranscriptHelper(
		_index: number,
		timeText: string,
		snippet: FetchedTranscriptSnippet
	): string {
		return `${timeText}\n${snippet.text}`;
	}
}

export class FormatterLoader {
	static TYPES: Record<string, new () => Formatter> = {
		json: JSONFormatter,
		pretty: PrettyPrintFormatter,
		text: TextFormatter,
		webvtt: WebVTTFormatter,
		srt: SRTFormatter
	};

	static UnknownFormatterType = class UnknownFormatterType extends Error {
		constructor(formatterType: string) {
			super(
				`The format '${formatterType}' is not supported. Choose one of the following formats: ${Object.keys(
					FormatterLoader.TYPES
				).join(', ')}`
			);
			this.name = new.target.name;
		}
	};

	load(formatterType = 'pretty'): Formatter {
		if (!Object.prototype.hasOwnProperty.call(FormatterLoader.TYPES, formatterType)) {
			throw new FormatterLoader.UnknownFormatterType(formatterType);
		}
		return new FormatterLoader.TYPES[formatterType]();
	}
}
