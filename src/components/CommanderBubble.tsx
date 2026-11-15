import { useState } from 'react';
import { HelpCircle, MessageSquare, Sparkles } from 'lucide-react';
import { soundEngine } from '../engine/audio';

interface CommanderBubbleProps {
  speaker?: string;
  role?: string;
  message: string;
  actionHint?: string;
  nasaFact?: string;
  tone?: 'cyan' | 'amber' | 'emerald' | 'violet';
}

const TONE_CLASSES: Record<NonNullable<CommanderBubbleProps['tone']>, string> = {
  cyan: 'border-cyan-500/45 bg-[#0B1526]',
  amber: 'border-amber-500/45 bg-[#16120B]',
  emerald: 'border-emerald-500/45 bg-[#0A1916]',
  violet: 'border-violet-500/45 bg-[#121024]',
};

const ACCENT_TEXT: Record<NonNullable<CommanderBubbleProps['tone']>, string> = {
  cyan: 'text-cyan-300',
  amber: 'text-amber-300',
  emerald: 'text-emerald-300',
  violet: 'text-violet-300',
};

export function CommanderBubble({
  speaker = 'Commander Vance',
  role = 'Earth Mission Office',
  message,
  actionHint,
  nasaFact,
  tone = 'cyan',
}: CommanderBubbleProps) {
  const [showFact, setShowFact] = useState(false);

  return (
    <div
      className={`rounded-xl border ${TONE_CLASSES[tone]} px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 min-w-0">
        {/* Clean Commander Avatar */}
        <div className="w-10 h-10 rounded-full border border-slate-700 bg-[#080D18] flex items-center justify-center shrink-0">
          <MessageSquare className={`w-4 h-4 ${ACCENT_TEXT[tone]}`} />
        </div>

        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className={`font-bold ${ACCENT_TEXT[tone]}`}>{speaker}</span>
            <span className="text-slate-500" aria-hidden="true">·</span>
            <span className="text-slate-400">{role}</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">{message}</p>

          {actionHint && (
            <p className="text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>What to do: {actionHint}</span>
            </p>
          )}

          {showFact && nasaFact && (
            <p className="text-[11px] text-cyan-200/90 pt-1 border-t border-slate-800/80 leading-relaxed">
              <span className="font-semibold text-cyan-300">NASA Space Fact: </span>
              {nasaFact}
            </p>
          )}
        </div>
      </div>

      {nasaFact && (
        <button
          type="button"
          onClick={() => {
            soundEngine.playSfx('click');
            setShowFact((v) => !v);
          }}
          className="self-start sm:self-center shrink-0 rounded-lg border border-slate-700 bg-[#0D1526] hover:border-cyan-400 px-3 py-1.5 text-[11px] font-medium text-cyan-200 flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>{showFact ? 'Hide NASA Fact' : 'Why NASA Does This'}</span>
        </button>
      )}
    </div>
  );
}
