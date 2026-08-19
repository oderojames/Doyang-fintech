import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  size?: 'xs' | 'sm';
  align?: 'center' | 'start';
}

/**
 * Renders an error message. If the message contains more than one sentence
 * (e.g. an explanation + an instruction like "Please try again."), it's
 * wrapped in an enclosing box for emphasis. Single-sentence messages render
 * as plain inline text with just an icon — no box.
 */
export default function ErrorMessage({ message, size = 'sm', align = 'center' }: ErrorMessageProps) {
  if (!message) return null;

  // Count sentences: split on '.', '!', or '?' followed by a space or end of
  // string, then filter out empty fragments from trailing punctuation.
  const sentenceCount = message
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean).length;

  const isMultiSentence = sentenceCount > 1;
  const textSize = size === 'xs' ? 'text-xs' : 'text-sm';
  const iconSize = size === 'xs' ? 13 : 14;
  const alignClass = align === 'start' ? 'items-start' : 'items-center';

  if (isMultiSentence) {
    return (
      <div className={`flex ${alignClass} gap-2 text-destructive ${textSize} bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5`}>
        <AlertCircle size={iconSize} className="shrink-0" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className={`flex ${alignClass} gap-2 text-destructive ${textSize} px-3 py-2`}>
      <AlertCircle size={iconSize} className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}
