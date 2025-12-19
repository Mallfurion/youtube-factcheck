const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
};

export function decodeHtml(input: string): string {
  if (!input) {
    return "";
  }

  return String(input)
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      const codePoint = parseInt(hex, 16);
      return Number.isNaN(codePoint) ? _match : String.fromCodePoint(codePoint);
    })
    .replace(/&#(\d+);/g, (_match, num) => {
      const codePoint = parseInt(num, 10);
      return Number.isNaN(codePoint) ? _match : String.fromCodePoint(codePoint);
    })
    .replace(/&([a-zA-Z]+);/g, (match, name) => {
      if (Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, name)) {
        return HTML_ENTITY_MAP[name];
      }
      return match;
    });
}

export function buildHtmlStripper({
  preserveFormatting,
}: {
  preserveFormatting: boolean;
}): (text: string) => string {
  if (preserveFormatting) {
    const formattingTags = [
      "strong",
      "em",
      "b",
      "i",
      "mark",
      "small",
      "del",
      "ins",
      "sub",
      "sup",
    ];
    const tagsRegex = formattingTags.join("|");
    const regex = new RegExp(`<\\/?(?!\\/?(${tagsRegex})\\b).*?\\b>`, "gi");
    return (text) => text.replace(regex, "");
  }

  const regex = /<[^>]*>/gi;
  return (text) => text.replace(regex, "");
}
