import { useState } from 'react';
import { ArrowRight, CheckCircle2, Radio, SkipForward, Sparkles } from 'lucide-react';
import { soundEngine } from '../engine/audio';
import { StoryChapterDef } from '../types/mission';

interface StoryDialogueModalProps {
  chapter: StoryChapterDef;
  variant: 'intro' | 'outro';
  onFinish: () => void;
  onClose?: () => void;
}

const ACCENT_STYLES = {
  cyan: {
    border: 'border-cyan-500/60',
    badgeBg: 'bg-cyan-950/60',
    text: 'text-cyan-300',
    ring: '#22D3EE',
  },
  amber: {
    border: 'border-amber-500/60',
    badgeBg: 'bg-amber-950/60',
    text: 'text-amber-300',
    ring: '#F59E0B',
  },
  emerald: {
    border: 'border-emerald-500/60',
    badgeBg: 'bg-emerald-950/60',
    text: 'text-emerald-300',
    ring: '#10B981',
  },
  violet: {
    border: 'border-violet-500/60',
    badgeBg: 'bg-violet-950/60',
    text: 'text-violet-300',
    ring: '#A78BFA',
  },
};

export function StoryDialogueModal({
  chapter,
  variant,
  onFinish,
  onClose,
}: StoryDialogueModalProps) {
  const beats = variant === 'intro' ? chapter.introBeats : chapter.outroBeats;
  const [idx, setIdx] = useState(0);
  const beat = beats[idx] || beats[0];
  const isLast = idx >= beats.length - 1;
  const style = ACCENT_STYLES[beat.accent];

  const handleNext = () => {
    soundEngine.playSfx(isLast ? 'snap' : 'click');
    if (isLast) {
      onFinish();
    } else {
      setIdx((i) => i + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04070E]/90 p-4">
      <div
        className={`w-full max-w-2xl rounded-xl border ${style.border} bg-[#0D1526] shadow-2xl overflow-hidden`}
      >
        {/* Top Comms Header */}
        <div className="border-b border-slate-800 bg-[#0A101D] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs font-mono">
            <Radio className="w-4 h-4 text-cyan-400" />
            <span className="text-cyan-300 font-semibold">
              CHAPTER {chapter.chapterNum} · {chapter.actLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-slate-400">
              Transmission {idx + 1} / {beats.length}
            </span>
            {onClose && (
              <button
                onClick={() => {
                  soundEngine.playSfx('click');
                  onClose();
                }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <div className="text-[11px] font-mono uppercase text-slate-400">
              {variant === 'intro' ? 'Incoming Story Directive' : 'Chapter Debrief Transmission'}
            </div>
            <h2 className="text-xl font-bold text-white mt-0.5">{chapter.title}</h2>
          </div>

          {/* Character Dialogue Card */}
          <div className={`rounded-xl border ${style.border} ${style.badgeBg} p-5 flex gap-4 items-start`}>
            {/* Bespoke SVG Comms Portrait Emblem */}
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <circle cx="24" cy="24" r="22" fill="#070B14" stroke={style.ring} strokeWidth="1.6" />
              <circle cx="24" cy="19" r="6" stroke={style.ring} strokeWidth="1.5" />
              <path
                d="M13 36C14.8 30.8 19 28.5 24 28.5C29 28.5 33.2 30.8 35 36"
                stroke={style.ring}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`text-sm font-bold ${style.text}`}>{beat.speaker}</span>
                <span className="text-[11px] font-mono text-slate-400">{beat.role}</span>
              </div>
              <p className="text-sm text-slate-100 leading-relaxed">{beat.line}</p>
            </div>
          </div>

          {variant === 'outro' && isLast && (
            <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-3 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-emerald-200 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Chapter {chapter.chapterNum} Complete — Next Campaign Chapter Unlocked
              </span>
              <span className="font-mono font-bold text-amber-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />+{chapter.bonusCredits} Story CR
              </span>
            </div>
          )}

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => {
                soundEngine.playSfx('click');
                onFinish();
              }}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
            >
              <SkipForward className="w-3.5 h-3.5" />
              {variant === 'intro' ? 'Skip to Mission' : 'Continue'}
            </button>

            <button
              onClick={handleNext}
              className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2.5 text-xs transition-colors flex items-center gap-2"
            >
              <span>
                {isLast
                  ? variant === 'intro'
                    ? chapter.mode === 'rocket'
                      ? 'Enter Rocket Hangar'
                      : 'Begin Spacecraft Mission'
                    : 'Return to Command Hub'
                  : 'Next Transmission'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
