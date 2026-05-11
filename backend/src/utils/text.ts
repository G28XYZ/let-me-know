export function roughSplitText(text: string) {
  // Normalize and clean basic artifacts
  const normalized = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Split by potential paragraphs, but first clean single line breaks
  // We KEEP "Страница X" markers for now so they can be used for page range extraction later.
  const blocks = normalized.split(/\n{2,}/).map((block) => {
    return block
      .replace(/([a-zA-Zа-яА-ЯёЁ])-\s*\n\s*([a-zA-Zа-яА-ЯёЁ])/g, "$1$2") // Clean hyphenation
      .replace(/(?<!\n)\n(?!\n)/g, " ")     // Replace single newlines with space
      .replace(/[ \t]+/g, " ")               // Normalize spaces
      .trim();
  }).filter(Boolean);

  const candidates: string[] = [];
  let current = "";

  blocks.forEach((block, index) => {
    const isHeading = isSectionHeading(block, index);

    // Group blocks into candidates of ~1200 characters
    if ((isHeading || (current + "\n\n" + block).length > 1200) && current) {
      candidates.push(current);
      current = block;
      return;
    }
    current = current ? `${current}\n\n${block}` : block;
  });

  if (current) candidates.push(current);

  // Ensure each candidate ends logically if it was hard-grouped
  return candidates.flatMap((candidate) => {
    if (candidate.length <= 1500) return [candidate];
    return splitAtSentences(candidate, 1200);
  });
}

function splitAtSentences(text: string, limit: number): string[] {
  const result: string[] = [];
  let remaining = text;

  while (remaining.length > limit + 300) {
    const searchRange = remaining.slice(0, limit + 300);
    // Look for sentence endings
    const matches = [...searchRange.matchAll(/[.!?](?:\s+|$)/g)];
    
    let splitIdx = -1;
    if (matches.length > 0) {
      // Find the last match before the limit, or the first one after the limit if none before
      for (let i = matches.length - 1; i >= 0; i--) {
        const idx = matches[i].index! + matches[i][0].length;
        if (idx <= limit + 100) {
          splitIdx = idx;
          break;
        }
      }
      if (splitIdx === -1) splitIdx = matches[0].index! + matches[0][0].length;
    }

    if (splitIdx === -1 || splitIdx < limit * 0.3) {
      // Fallback to space
      splitIdx = searchRange.lastIndexOf(" ", limit);
    }

    if (splitIdx === -1) splitIdx = limit; // Absolute fallback

    result.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining) result.push(remaining);
  return result;
}

export function isSectionHeading(paragraph: string, index: number) {
  const normalized = paragraph.trim().toLowerCase();
  if (index <= 12 && /^(оглавление|содержание|contents|table of contents|введение|предисловие|introduction|preface)$/i.test(normalized)) {
    return true;
  }

  return /^(глава\s+\d+|chapter\s+\d+|раздел\s+\d+|\d+(\.\d+)*\.?\s+\S+|[а-яa-z][а-яa-z\s-]{3,60})$/i.test(normalized);
}

export function parseJsonOrFallback(text: string, fallback: any) {
  const withoutThinking = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const cleaned = extractJsonObject(withoutThinking);
  if (!cleaned) return fallback;

  try {
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

export function extractJsonObject(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return cleaned.slice(start, end + 1);
}

export function asArray(value: any) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function extractPageRange(text: string) {
  const matches = [...String(text || "").matchAll(/Страница\s+(\d+)/gi)].map((match) => Number(match[1]));
  if (!matches.length) return null;

  return {
    start: Math.min(...matches),
    end: Math.max(...matches),
  };
}
