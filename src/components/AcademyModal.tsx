import { useState } from 'react';
import { BookOpen, CheckCircle2, Compass, ExternalLink, Wrench, X } from 'lucide-react';
import { ACADEMY_TOPICS, NASA_OPEN_DATA_LINKS } from '../data/missionData';
import { soundEngine } from '../engine/audio';

interface AcademyModalProps {
  onClose: () => void;
}

type AcademyTab = 'playbook' | 'fixes' | 'physics';

const WARNING_FIX_CHEATSHEET = [
  {
    code: 'SCI-01 / SCI-02',
    meaning: 'Missing required science sensors for this mission.',
    fix: 'Open Step 1 (Sensors) and turn ON every card tagged with green REQ.',
  },
  {
    code: 'CoM / Left vs Right Imbalance',
    meaning: 'Too many heavy sensors sit on one bay (Left vs Right), tilting the satellite off thrust axis.',
    fix: 'In Step 1 (Sensors), click "Move to Left/Right" on equipped sensor cards until Left & Right weights balance inside the green seesaw zone!',
  },
  {
    code: 'PWR-01 / BAT-01',
    meaning: 'Instruments use more watts than solar panels generate, or battery drains in shadow.',
    fix: 'Open Step 2 (Core Craft) and upgrade Solar Power & Battery to Medium or High-Area Arrays (or research Solar Wings in R&D Lab).',
  },
  {
    code: 'COM-01 / DAT-01',
    meaning: 'Radio dish is too slow or SSD memory is too small for daily sensor scans.',
    fix: 'Open Step 2 (Core Craft) and upgrade Communications Dish (X-Band/Ka-Band) and Data Buffer (128/512 GB).',
  },
  {
    code: 'SEQ-01 / SEQ-02',
    meaning: 'Nose fairing blocks panels/sensors, or Ion thruster fires before solar arrays open.',
    fix: 'Open Step 3 (Order) and press the ↑ arrow to move Fairing Jettison to Step 1. Keep Solar Array Unfurl earlier than Orbit Insertion Burn.',
  },
  {
    code: 'RAD-01 / THM-01',
    meaning: 'Deep-space radiation or Moon/Mars temperature swings will damage electronics.',
    fix: 'Open Step 2 (Core Craft): turn ON Radiation Armor Plates and upgrade Thermal Loop to Level 2 or Level 3.',
  },
  {
    code: 'LCH-01 / PRP-01',
    meaning: 'Satellite is too heavy for the chosen rocket or short on orbital Δv.',
    fix: 'Open Step 4 (Orbit): switch to Heavy Launcher or Low-Energy Assist; in Step 2, upgrade to Bipropellant or Hall-Effect Ion.',
  },
];

export function AcademyModal({ onClose }: AcademyModalProps) {
  const [tab, setTab] = useState<AcademyTab>('playbook');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04070E]/90 p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-xl border border-slate-700/80 bg-[#0D1424] shadow-2xl overflow-hidden my-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-lg font-semibold text-slate-100">NASA Space Academy Field Guide</h2>
              <p className="text-xs text-slate-400">
                Plain-English mission playbook, warning fixes, and orbital aerospace physics
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playSfx('click');
              onClose();
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-500 transition-colors flex items-center gap-1.5"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>

        {/* 3 Clear Navigation Tabs */}
        <div className="border-b border-slate-800 bg-[#090F1C] px-6 py-2.5 flex flex-wrap gap-2">
          {[
            { id: 'playbook' as const, label: '1. Step-by-Step Playbook' },
            { id: 'fixes' as const, label: '2. Warning & Fix Cheat Sheet' },
            { id: 'physics' as const, label: '3. Physics & NASA Open Data' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                soundEngine.playSfx('click');
                setTab(t.id);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border ${
                tab === t.id
                  ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                  : 'border-slate-800 bg-[#111A2E] text-slate-300 hover:border-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
          {tab === 'playbook' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-cyan-500/35 bg-[#111A2E] p-4 space-y-3">
                <h3 className="text-sm font-bold text-cyan-300">
                  Satellite Mode · From Craft Studio to 3D Orbit
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-1">
                    <div className="font-mono text-emerald-300 font-semibold">Step 1 · Pick &amp; Balance Sensors</div>
                    <p className="text-slate-300 leading-relaxed">
                      Turn ON all green <strong>REQ</strong> sensors. Watch the <strong>Left ⚖ Right Balance Bar</strong> and click <strong>Move to Left / Right</strong> on equipped cards so the yellow &amp; green weights balance evenly!
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-1">
                    <div className="font-mono text-amber-300 font-semibold">Step 2 · Upgrade Core Craft</div>
                    <p className="text-slate-300 leading-relaxed">
                      Check the live numbers beside Solar Power, Radio Dish, Engine, Thermal Loop, and Data Buffer. Turn ON Radiation Armor for L1, Moon, and Mars.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-1">
                    <div className="font-mono text-cyan-300 font-semibold">Step 3 &amp; 4 · Order &amp; Orbit</div>
                    <p className="text-slate-300 leading-relaxed">
                      Use the <strong>↑</strong> arrow in Step 3 (Order) to place <strong>Fairing Jettison</strong> at Step 1, then verify your Carrier Rocket capacity in Step 4 (Orbit).
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-1">
                    <div className="font-mono text-violet-300 font-semibold">Phase 4 · Swath Aim &amp; Scan</div>
                    <p className="text-slate-300 leading-relaxed">
                      Tilt your sensor beam left/right with <strong>[A]/[D]</strong> to catch glowing amber hotspots, press <strong>[Space]</strong> to Scan, then press <strong>[E]</strong> over green Ground Dishes to beam data home.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/35 bg-[#111A2E] p-4 space-y-3">
                <h3 className="text-sm font-bold text-amber-300">
                  Rocket Mode · Launching to the Moon &amp; Beyond
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-1">
                    <div className="font-semibold text-white">1. Clean Window &amp; Stages</div>
                    <p className="text-slate-300 leading-relaxed">
                      Pick <strong>Day 3</strong> (0 m/s alignment penalty), keep Liftoff Thrust (TWR) &gt;= 1.25, and use <strong>Whisper-LH2 / Zephyr-NX</strong> plus Stage 3 for Moon &amp; Mars.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-1">
                    <div className="font-semibold text-white">2. Boost Rings &amp; Bullseye Staging</div>
                    <p className="text-slate-300 leading-relaxed">
                      Steer left/right through cyan <strong>+95 Δv Boost Rings</strong>, dodge amber Shear clouds, and hit <strong>[Space]</strong> in the green Burnout Sweet Spot!
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-1">
                    <div className="font-semibold text-white">3. Powered Descent &amp; Crew Game</div>
                    <p className="text-slate-300 leading-relaxed">
                      Pilot your lander onto a green pad (speed &lt;= 7.5 m/s), then complete the Rover, Radar Drill, or Base Engineering mini-game!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'fixes' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  See a red NO-GO or amber WARNING code? Find the exact fix below (or click <strong>Fix →</strong> in the Craft Checklist).
                </span>
              </div>
              <div className="space-y-2.5">
                {WARNING_FIX_CHEATSHEET.map((item) => (
                  <div
                    key={item.code}
                    className="rounded-lg border border-slate-800 bg-[#111A2E] p-3.5 grid grid-cols-1 md:grid-cols-12 gap-2 items-center text-xs"
                  >
                    <div className="md:col-span-3 font-mono font-bold text-amber-300">
                      {item.code}
                    </div>
                    <div className="md:col-span-4 text-slate-300">{item.meaning}</div>
                    <div className="md:col-span-5 text-emerald-300 flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{item.fix}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'physics' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ACADEMY_TOPICS.map((topic) => (
                  <div
                    key={topic.id}
                    className="rounded-lg border border-slate-800 bg-[#111A2E] p-4 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-cyan-300">{topic.title}</h3>
                      <div className="mt-1.5 rounded bg-[#070B14] border border-slate-800 px-2.5 py-1.5 font-mono text-xs text-amber-300">
                        {topic.formula}
                      </div>
                      <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{topic.summary}</p>
                    </div>
                    <div className="rounded bg-cyan-950/30 border border-cyan-800/40 px-3 py-2 text-xs text-cyan-200">
                      <span className="font-semibold text-cyan-400">Flight Tip: </span>
                      {topic.tip}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-3">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  <span>NASA Open Data Reference Catalog (Educational Context)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {NASA_OPEN_DATA_LINKS.map((item) => (
                    <a
                      key={item.name}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-lg border border-slate-800 bg-[#111A2E] p-3 hover:border-cyan-500/60 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-cyan-300 group-hover:text-cyan-200">
                        <span>{item.name}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.detail}</p>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
