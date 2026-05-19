// stats.js — writing stats for the status bar. Pure functions, no DOM.
// Feedback, not a target: "14-minute read" when you meant to be tight is the
// kind of signal that changes behavior.

const WPM = 238; // average adult silent reading speed

function strip(md) {
  return (md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function syllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return word ? 1 : 0;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
             .replace(/^y/, '');
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

export function stats(md) {
  const text = strip(md);
  const words = text ? text.split(/\s+/) : [];
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length || 1;
  const syl = words.reduce((n, w) => n + syllables(w), 0);

  const minutes = Math.max(1, Math.round(wordCount / WPM));
  // Flesch Reading Ease
  const flesch = wordCount
    ? Math.max(0, Math.min(100, Math.round(
        206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syl / wordCount))))
    : 0;
  const grade =
    flesch >= 70 ? 'easy' : flesch >= 50 ? 'plain' : flesch >= 30 ? 'dense' : 'hard';

  return {
    words: wordCount,
    minutes,
    avgSentence: Math.round((wordCount / sentences) * 10) / 10,
    flesch,
    grade,
  };
}
