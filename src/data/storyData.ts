import { StoryChapterDef } from '../types/mission';

export const STORY_CHAPTERS: StoryChapterDef[] = [
  {
    id: 'ch1',
    chapterNum: 1,
    title: 'First Light Over the Archipelago',
    actLabel: 'Act I · Orbital Awakening',
    mode: 'satellite',
    missionId: 'zero',
    synopsis:
      'Severe El Niño droughts have sparked peatland fires across Borneo while coastal buoys report erratic sea temperatures. Build and fly humanity’s rapid-response First Light satellite to capture our opening Earth scan.',
    bonusCredits: 40,
    introBeats: [
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        accent: 'cyan',
        line: 'Welcome to Project Aegis, Architect. Two Earth-observing satellites went offline during last week’s geomagnetic storm, right as fires broke out across Borneo and the Western Pacific warmed sharply.',
      },
      {
        speaker: 'Dr. Arya Pratama',
        role: 'Lead Earth Observation Scientist',
        accent: 'emerald',
        line: 'Emergency crews on the ground are flying blind under dense smoke. We need a multispectral imager in Low Earth Orbit immediately—balanced cleanly so our thrusters don’t spin the spacecraft.',
      },
      {
        speaker: 'NOVA',
        role: 'Onboard Flight Guidance System',
        accent: 'violet',
        line: 'Design checklist primed. Equip an imaging sensor, align Fairing Jettison ahead of array deployment, launch into LEO, and press SPACE when our swath crosses Earth’s glowing hazard beacons.',
      },
    ],
    outroBeats: [
      {
        speaker: 'Dr. Arya Pratama',
        role: 'Lead Earth Observation Scientist',
        accent: 'emerald',
        line: 'First Light telemetry just arrived at Biak Ground Station! Thermal and optical maps are already guiding firefighting aircraft around Borneo peat hotspots.',
      },
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        accent: 'cyan',
        line: 'Strong maiden flight, Architect. But First Light’s sensor suite alone isn’t enough—deep convective storms are forming out in the Pacific. Prepare the launchpad.',
      },
    ],
  },
  {
    id: 'ch2',
    chapterNum: 2,
    title: 'Booster Run: Moon Relay & Landing',
    actLabel: 'Act II · Trans-Lunar Ascent',
    mode: 'rocket',
    rocketDest: 'LUNAR',
    synopsis:
      'Build a 3-stage lunar rocket on the optimal Day 3 window, pilot it to the Moon, choose a safe Shackleton landing zone, and complete your crew surface mission.',
    bonusCredits: 55,
    introBeats: [
      {
        speaker: 'Cmdr. Leo Reyes',
        role: 'Launch Complex Flight Boss',
        accent: 'amber',
        line: 'Pad 39-B is green, Architect! Our Artemis relay & lander stack is waiting for launch to the Moon. Remember: lift thrust alone isn’t enough—you need 3 stages and a Vacuum engine to reach Lunar trajectory!',
      },
      {
        speaker: 'NOVA',
        role: 'Onboard Flight Guidance System',
        accent: 'violet',
        line: 'Advisory: Select Day 3 for zero Δv alignment penalty, equip Whisper or Zephyr on Stage 2 plus Stage 3 tanks and a Composite fairing, then guide the lander softly onto a flat Moon pad.',
      },
    ],
    outroBeats: [
      {
        speaker: 'Cmdr. Leo Reyes',
        role: 'Launch Complex Flight Boss',
        accent: 'amber',
        line: 'Touchdown and safe splashdown confirmed! Our Moon surface science and relay beacon are live—guiding deep-space communications back to Earth.',
      },
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        accent: 'cyan',
        line: 'Next up is our flagship atmospheric mission. A Category 5 Super Typhoon just spun up east of the Philippines, and Greenland melt rates just spiked.',
      },
    ],
  },
  {
    id: 'ch3',
    chapterNum: 3,
    title: 'Eyes on the Storm',
    actLabel: 'Act III · Guardians of Earth',
    mode: 'satellite',
    missionId: 'earth',
    synopsis:
      'Build the full Earth Atmosphere Observer with infrared sounders, lidar, and thermal radiometers. Scan global climate hotspots from orbit and downlink life-saving forecasts before buffers overflow.',
    bonusCredits: 75,
    introBeats: [
      {
        speaker: 'Dr. Arya Pratama',
        role: 'Lead Earth Observation Scientist',
        accent: 'emerald',
        line: 'This is the heart of Project Aegis. We need Atmospheric Chemistry, Surface Imaging, and Climate Balance instruments working together on one bus.',
      },
      {
        speaker: 'NOVA',
        role: 'Onboard Flight Guidance System',
        accent: 'violet',
        line: 'Warning: High-resolution imagers generate 40+ GB/day. Upgrade to an X-Band or Ka-Band dish and a 128 GB recorder—then beam scans down whenever you fly over Svalbard, Goldstone, Biak, or Canberra.',
      },
    ],
    outroBeats: [
      {
        speaker: 'Dr. Arya Pratama',
        role: 'Lead Earth Observation Scientist',
        accent: 'emerald',
        line: 'Every coastal meteorology center now has high-precision cyclone eyewall temperatures and wildfire aerosol altitudes. Millions received 72-hour early storm warnings!',
      },
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        accent: 'cyan',
        line: 'Hold everything—our solar observatories just flagged a massive X-class flare rotating toward Earth. If a CME hits without warning, our entire Earth-sensing constellation is at risk.',
      },
    ],
  },
  {
    id: 'ch4',
    chapterNum: 4,
    title: 'The Carrington Echo',
    actLabel: 'Act IV · Deep-Space Shield',
    mode: 'satellite',
    missionId: 'sun',
    synopsis:
      'Station the Solar Storm Sentinel 1.5 million km sunward at the Sun–Earth L1 Lagrange point to catch incoming Coronal Mass Ejections 45 minutes before they strike Earth.',
    bonusCredits: 95,
    introBeats: [
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        accent: 'cyan',
        line: 'The Sun–Earth L1 point stays in 100% continuous sunlight between Earth and the Sun. Station a sentinel there with a Coronagraph, Particle Detector, and Magnetometer.',
      },
      {
        speaker: 'Cmdr. Leo Reyes',
        role: 'Launch Complex Flight Boss',
        accent: 'amber',
        line: 'L1 sits outside Earth’s protective magnetosphere. Equip Radiation Hardened Shielding and Level 2+ Thermal Control—and check Low-Energy Transfer if your Δv budget gets tight.',
      },
    ],
    outroBeats: [
      {
        speaker: 'NOVA',
        role: 'Onboard Flight Guidance System',
        accent: 'violet',
        line: 'L1 Halo orbit stabilized! Solar Storm Sentinel detected the incoming CME shockwave 48 minutes ahead of impact, allowing power grids and Earth satellites to enter safe posture cleanly.',
      },
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        accent: 'cyan',
        line: 'Earth’s orbital shield is complete. Now NASA authorizes the final chapter of Project Aegis: opening our interplanetary bridge to Mars.',
      },
    ],
  },
  {
    id: 'ch5',
    chapterNum: 5,
    title: 'Red Horizon: The Mars Bridge',
    actLabel: 'Act V · Interplanetary Finale',
    mode: 'rocket',
    rocketDest: 'MARS',
    synopsis:
      'Execute a high-energy 3-stage Trans-Mars Injection rocket launch during the Hohmann alignment window to place Project Aegis’s deep-space relay into interplanetary trajectory.',
    bonusCredits: 140,
    introBeats: [
      {
        speaker: 'Cmdr. Leo Reyes',
        role: 'Launch Complex Flight Boss',
        accent: 'amber',
        line: 'This is the ultimate engineering test: 13,450 m/s of Δv to escape Earth’s gravity well on a Trans-Mars Hohmann transfer!',
      },
      {
        speaker: 'Dr. Arya Pratama',
        role: 'Lead Earth Observation Scientist',
        accent: 'emerald',
        line: 'Use Anvil heavy boosters on Stage 1, add a Stage 3 kick motor with high-efficiency Whisper-LH2 vacuum engines, jettison your fairing above 75 km, and carry Project Aegis to Mars!',
      },
    ],
    outroBeats: [
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        accent: 'cyan',
        line: 'Trans-Mars Injection burn complete! From protecting Borneo forests and tracking Pacific cyclones to safeguarding Earth from solar storms and bridging worlds—Project Aegis stands complete.',
      },
      {
        speaker: 'NOVA',
        role: 'Onboard Flight Guidance System',
        accent: 'violet',
        line: 'Campaign Mastery achieved, Flight Director. All modes and destinations remain open for record-breaking replays and R&D optimization.',
      },
    ],
  },
];
