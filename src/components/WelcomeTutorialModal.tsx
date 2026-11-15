import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  FlaskConical,
  Globe,
  MessageSquare,
  Rocket,
  Satellite,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { soundEngine } from '../engine/audio';

interface WelcomeTutorialModalProps {
  onGoToModeSelect: () => void;
  onStartRocketMode: () => void;
  onStartSatelliteMode: () => void;
  onClose: () => void;
}

const STEPS = [
  {
    id: 'modes',
    kicker: 'Guide 1 of 5 · Pick Your Adventure',
    title: 'Two Ways to Play: Rocket or Satellite',
    summary:
      'PROJECT AEGIS has two connected modes: fly rockets from Earth to the Moon & Mars, or craft satellites to scan Earth hazards from orbit.',
  },
  {
    id: 'sat-craft',
    kicker: 'Guide 2 of 5 · How to Craft a Satellite',
    title: '4 Simple Rules to Pass Pre-Flight',
    summary:
      'Every satellite starts with a few faults on the Craft Checklist. Follow Steps 1–4 (or tap Fix → on any checklist row) to make every light green!',
  },
  {
    id: 'orbit-ops',
    kicker: 'Guide 3 of 5 · Live 3D Orbit Operations',
    title: 'Aim the Sensor & Scan in 3D Orbit',
    summary:
      'Once your satellite reaches 3D orbit, use A/D (or Slew buttons) to tilt your sensor swath over glowing hotspots and beam data down to green dishes.',
  },
  {
    id: 'rocket-moon',
    kicker: 'Guide 4 of 5 · Rockets to the Moon & Beyond',
    title: 'Fly Rings, Land Gently & Play Surface Ops',
    summary:
      'In Rocket Launch, steer through Ascent Boost Rings to reach the Moon, pilot your Powered Descent onto a green pad, and play Explorer, Scientist, or Engineer mini-games!',
  },
  {
    id: 'start',
    kicker: 'Guide 5 of 5 · Ready for Liftoff',
    title: 'Commander Vance Is on Radio',
    summary:
      'The guidance banner at the top of every screen tells you the exact next click, and Space Academy (F1) has a Problem & Fix Cheat Sheet anytime.',
  },
];

export function WelcomeTutorialModal({
  onGoToModeSelect,
  onStartRocketMode,
  onStartSatelliteMode,
  onClose,
}: WelcomeTutorialModalProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04070E]/92 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tutorial-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-cyan-500/50 bg-[#0D1526] shadow-2xl overflow-hidden my-auto">
        {/* Top Bar */}
        <div className="border-b border-slate-800 bg-[#0A101D] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
            <Compass className="w-4 h-4" />
            <span>{current.kicker}</span>
          </div>
          <button
            onClick={() => {
              soundEngine.playSfx('click');
              onClose();
            }}
            className="text-xs text-slate-400 hover:text-white"
          >
            Skip to Hub
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <h2 id="welcome-tutorial-title" className="text-2xl font-bold text-white">
              {current.title}
            </h2>
            <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{current.summary}</p>
          </div>

          {/* Step 1: Two Modes */}
          {step === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-amber-500/40 bg-[#111A2E] p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <Rocket className="w-4 h-4" />
                  Mode 1: Rocket Launch (Moon Start)
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Stack 3 stages, pick the Day 3 green launch window, reach the Moon, scan craters for a flat landing pad, and complete your crew role!
                </p>
              </div>
              <div className="rounded-xl border border-cyan-500/40 bg-[#111A2E] p-4 space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
                  <Satellite className="w-4 h-4" />
                  Mode 2: Satellite Craft Studio
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Equip science sensors, balance Left/Right bays, upgrade solar power &amp; radio, launch into 3D orbit, and scan live Earth events!
                </p>
              </div>
            </div>
          )}

          {/* Step 2: 4 Satellite Craft Rules */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 space-y-1">
                <div className="font-mono text-cyan-300 font-bold">RULE 1 · SENSORS &amp; BAYS</div>
                <p className="text-slate-300">
                  Turn ON green <span className="text-emerald-300 font-mono">REQ</span> sensors. Click <strong>Move to Left / Right</strong> on equipped sensors so both sides weigh evenly!
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 space-y-1">
                <div className="font-mono text-amber-300 font-bold">RULE 2 · POWER &amp; RADIO</div>
                <p className="text-slate-300">
                  Solar Power must exceed Load, and your Radio Dish + SSD Buffer must handle daily data without overflowing.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 space-y-1">
                <div className="font-mono text-emerald-300 font-bold">RULE 3 · FAIRING FIRST</div>
                <p className="text-slate-300">
                  In Step 3 (Order), press <strong>↑</strong> so <strong>Fairing Jettison</strong> sits at Step 1 and panels open cleanly after liftoff.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 space-y-1">
                <div className="font-mono text-violet-300 font-bold">RULE 4 · ORBIT &amp; SHIELD</div>
                <p className="text-slate-300">
                  Deep-space orbits (L1, Moon, Mars) require Radiation Armor, active Thermal Control, and Heavy Launcher capacity.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: 3-Step Orbit Loop */}
          {step === 2 && (
            <div className="rounded-xl border border-slate-800 bg-[#0A101D] p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                <Globe className="w-4 h-4" />
                How 3D Orbit Operations Work
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-amber-500/40 bg-[#111A2E] p-3">
                  <div className="font-mono text-amber-300 font-bold">1. AIM &amp; SCAN [A/D + SPACE]</div>
                  <div className="text-slate-300 mt-1">
                    Tilt your sensor swath with A/D (or Slew buttons) to catch nearby amber hotspots, then press Spacebar to Scan!
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-500/40 bg-[#111A2E] p-3">
                  <div className="font-mono text-emerald-300 font-bold">2. BEAM [E]</div>
                  <div className="text-slate-300 mt-1">
                    Pass over any green Ground Station dish and press E (or click Beam Data) to empty your SSD memory!
                  </div>
                </div>
                <div className="rounded-lg border border-cyan-500/40 bg-[#111A2E] p-3">
                  <div className="font-mono text-cyan-300 font-bold">3. REPORT</div>
                  <div className="text-slate-300 mt-1">
                    After 2–4 scans &amp; downlinks, click End Orbit &amp; Report to earn Credits for R&amp;D Tech Lab upgrades!
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                Use 2× or 4× time warp in the top-right of the Command Deck if waiting for a target pass.
              </div>
            </div>
          )}

          {/* Step 4: Rocket Landing & Roles */}
          {step === 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="rounded-xl border border-amber-500/40 bg-[#111A2E] p-3 space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  Engineer
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Lock the Dome Seal bracket, aim Solar Panels at the moving Sunbeam, and pump O2 into the safe green zone!
                </p>
              </div>
              <div className="rounded-xl border border-cyan-500/40 bg-[#111A2E] p-3 space-y-1">
                <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5" />
                  Scientist
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Sweep the Radar Boom over buried strata anomalies and time core drills in the green pressure calibration bar.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/40 bg-[#111A2E] p-3 space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" />
                  Explorer / Scout
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Drive your 6-wheel rover (WASD or D-Pad) around craters to gather ore crystals and deploy supply relays!
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Launch Actions */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-cyan-500/45 bg-[#0B1526] p-3.5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full border border-slate-700 bg-[#080D18] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-cyan-300" />
                </div>
                <div className="text-xs">
                  <div className="font-mono text-cyan-300 font-bold">
                    Commander Vance · Mission Control
                  </div>
                  <p className="text-slate-200 mt-0.5">
                    “Every screen shows your next step at the top, and you can press F1 anytime for a Warning &amp; Fix Cheat Sheet. Ready to launch?”
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    soundEngine.playSfx('snap');
                    onStartRocketMode();
                  }}
                  className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 p-3.5 text-left transition-colors space-y-1"
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Rocket className="w-4 h-4" />
                    Launch Rocket to Moon
                  </div>
                  <p className="text-xs text-slate-900/90">
                    Stack stages, fly to the Moon, land &amp; complete a crew role!
                  </p>
                </button>
                <button
                  onClick={() => {
                    soundEngine.playSfx('snap');
                    onStartSatelliteMode();
                  }}
                  className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 p-3.5 text-left transition-colors space-y-1"
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Satellite className="w-4 h-4" />
                    Start Mission Zero (Guided)
                  </div>
                  <p className="text-xs text-slate-900/90">
                    Craft your first satellite in 4 clear steps and scan Earth!
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Footer Navigation */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              disabled={step === 0}
              onClick={() => {
                soundEngine.playSfx('click');
                setStep((s) => Math.max(0, s - 1));
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-35 px-4 py-2 text-xs font-medium text-slate-200 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <div className="flex items-center gap-1.5">
              {STEPS.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setStep(idx);
                  }}
                  aria-label={`Go to guide step ${idx + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    idx === step ? 'w-6 bg-cyan-400' : 'w-2 bg-slate-700 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>

            {!isLast ? (
              <button
                onClick={() => {
                  soundEngine.playSfx('click');
                  setStep((s) => Math.min(STEPS.length - 1, s + 1));
                }}
                className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2 text-xs flex items-center gap-1.5"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  soundEngine.playSfx('snap');
                  onGoToModeSelect();
                }}
                className="rounded-lg border border-emerald-500/60 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-200 font-semibold px-4 py-2 text-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Open Mission Hub
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
