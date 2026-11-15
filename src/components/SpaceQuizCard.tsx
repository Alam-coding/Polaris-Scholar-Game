import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Download, HelpCircle, Sparkles } from 'lucide-react';
import { soundEngine } from '../engine/audio';
import { downloadMissionCertificate, SPACE_QUIZ_BANK } from '../engine/nasaLive';

interface SpaceQuizCardProps {
  missionTitle: string;
  modeLabel: string;
  score: number;
  stars: number;
  highlightStat: string;
  onBonusCredits: (amount: number) => void;
}

export function SpaceQuizCard({
  missionTitle,
  modeLabel,
  score,
  stars,
  highlightStat,
  onBonusCredits,
}: SpaceQuizCardProps) {
  const question = useMemo(() => {
    const idx = Math.abs(missionTitle.length + score) % SPACE_QUIZ_BANK.length;
    return SPACE_QUIZ_BANK[idx];
  }, [missionTitle, score]);

  const [picked, setPicked] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const handleAnswer = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === question.correctIndex) {
      soundEngine.playSfx('success');
      onBonusCredits(25);
    } else {
      soundEngine.playSfx('beep');
    }
  };

  const handleDownloadCert = () => {
    soundEngine.playSfx('snap');
    downloadMissionCertificate({
      missionTitle,
      modeLabel,
      score,
      stars,
      highlightStat,
    });
    setDownloaded(true);
  };

  return (
    <div className="space-y-4">
      {/* Kid-Friendly Space Check Quiz */}
      <div className="rounded-xl border border-cyan-700/50 bg-[#0A1324] p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4" />
            Quick Space Check (Optional Bonus!)
          </span>
          <span className="font-mono text-amber-300">+25 CR</span>
        </div>
        <p className="text-xs sm:text-sm font-medium text-white leading-relaxed">
          {question.question}
        </p>
        <div className="space-y-1.5">
          {question.options.map((opt, idx) => {
            const isCorrect = idx === question.correctIndex;
            const isSelected = picked === idx;
            let cls =
              'border-slate-800 bg-[#111A2E] text-slate-200 hover:border-cyan-500/60';
            if (picked !== null) {
              if (isCorrect) {
                cls = 'border-emerald-500 bg-emerald-950/50 text-emerald-200';
              } else if (isSelected) {
                cls = 'border-rose-500 bg-rose-950/40 text-rose-200';
              } else {
                cls = 'border-slate-800 bg-[#0D1526] text-slate-500';
              }
            }
            return (
              <button
                key={idx}
                disabled={picked !== null}
                onClick={() => handleAnswer(idx)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors flex items-center justify-between gap-2 ${cls}`}
              >
                <span>{opt}</span>
                {picked !== null && isCorrect && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5 text-xs text-cyan-100 leading-relaxed flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              {picked === question.correctIndex ? 'Awesome! +25 Credits earned. ' : 'Good try! '}
              {question.explanation}
            </span>
          </div>
        )}
      </div>

      {/* Downloadable PNG Flight Certificate */}
      <button
        onClick={handleDownloadCert}
        className="w-full rounded-lg border border-amber-500/60 bg-amber-950/30 hover:bg-amber-900/40 px-4 py-2.5 text-xs font-semibold text-amber-200 transition-colors flex items-center justify-center gap-2"
      >
        {downloaded ? <Award className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
        {downloaded
          ? 'Mission Certificate Downloaded! (Click to Save Again)'
          : 'Download Official Mission Certificate (PNG)'}
      </button>
    </div>
  );
}
