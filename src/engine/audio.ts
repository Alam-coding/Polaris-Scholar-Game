export type MusicTrackId = 'orbital' | 'launch' | 'earth' | 'victory';

export type SfxType =
  | 'click'
  | 'snap'
  | 'beep'
  | 'countdown'
  | 'ignition'
  | 'stage'
  | 'scan'
  | 'downlink'
  | 'warning'
  | 'success';

// Lookahead Web Audio procedural music & SFX synthesizer — zero external audio files required.
class SpaceSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private musicEnabled = true;
  private musicVol = 0.38;
  private sfxVol = 0.45;
  private currentTrack: MusicTrackId = 'orbital';

  private schedulerTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) {
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.masterGain.gain.value = this.muted ? 0 : 1;
        this.musicGain.gain.value = this.musicEnabled ? this.musicVol : 0;
        this.sfxGain.gain.value = this.sfxVol;

        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // Pre-bake 1.5s white noise buffer for rocket thrusters & staging vents
        const sr = this.ctx.sampleRate;
        const len = Math.floor(sr * 1.5);
        this.noiseBuffer = this.ctx.createBuffer(1, len, sr);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public unlockAndStart() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.musicEnabled && this.schedulerTimer === null) {
      this.startSequencer();
    }
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 1, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    const ctx = this.ensureContext();
    if (this.musicGain && ctx) {
      this.musicGain.gain.setTargetAtTime(enabled ? this.musicVol : 0, ctx.currentTime, 0.08);
    }
    if (enabled && ctx && this.schedulerTimer === null) {
      this.startSequencer();
    } else if (!enabled && this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public setTrack(track: MusicTrackId) {
    if (this.currentTrack === track) return;
    this.currentTrack = track;
    this.step = 0;
  }

  public getTrack(): MusicTrackId {
    return this.currentTrack;
  }

  public setVolumes(music: number, sfx: number) {
    this.musicVol = Math.max(0, Math.min(1, music));
    this.sfxVol = Math.max(0, Math.min(1, sfx));
    if (this.ctx && this.musicGain && this.sfxGain) {
      this.musicGain.gain.setTargetAtTime(
        this.musicEnabled ? this.musicVol : 0,
        this.ctx.currentTime,
        0.04,
      );
      this.sfxGain.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.04);
    }
  }

  private startSequencer() {
    if (!this.ctx || this.schedulerTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicEnabled || this.muted) return;
      if (this.ctx.state === 'suspended') return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.16) {
        this.scheduleStep(this.step, this.nextNoteTime);
        const stepDuration =
          this.currentTrack === 'launch' ? 0.16 : this.currentTrack === 'victory' ? 0.19 : 0.24;
        this.nextNoteTime += stepDuration;
        this.step = (this.step + 1) % 32;
      }
    }, 45);
  }

  private playTone(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gainPeak: number,
    dest: AudioNode,
    cutoff = 1800,
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainPeak, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private scheduleStep(step: number, time: number) {
    if (!this.ctx || !this.musicGain) return;

    // 4 distinct musical moods inspired by atmospheric space cinema & mission control
    const progressions: Record<
      MusicTrackId,
      { bass: number[]; arp: number[]; pad: number[][]; arpCutoff: number }
    > = {
      orbital: {
        // Warm D minor / F major / C major / G sus4 space synthwave
        bass: [73.42, 73.42, 87.31, 87.31, 65.41, 65.41, 98.0, 98.0],
        arp: [293.66, 349.23, 440.0, 523.25, 440.0, 349.23, 392.0, 587.33],
        pad: [
          [146.83, 220.0, 261.63],
          [174.61, 261.63, 329.63],
          [130.81, 196.0, 246.94],
          [196.0, 246.94, 293.66],
        ],
        arpCutoff: 1400,
      },
      launch: {
        // Driving A minor / F / G / E phrygian launch sequence pulse
        bass: [55.0, 55.0, 43.65, 43.65, 49.0, 49.0, 41.2, 49.0],
        arp: [220.0, 261.63, 329.63, 440.0, 329.63, 261.63, 392.0, 493.88],
        pad: [
          [110.0, 164.81, 220.0],
          [87.31, 130.81, 174.61],
          [98.0, 146.83, 196.0],
          [82.41, 123.47, 164.81],
        ],
        arpCutoff: 2400,
      },
      earth: {
        // Serene Lydian C major 7 / D major / E minor / G6 Earth-observation theme
        bass: [65.41, 65.41, 73.42, 73.42, 82.41, 82.41, 98.0, 98.0],
        arp: [261.63, 329.63, 392.0, 493.88, 587.33, 493.88, 392.0, 329.63],
        pad: [
          [130.81, 196.0, 246.94],
          [146.83, 220.0, 293.66],
          [164.81, 246.94, 329.63],
          [196.0, 293.66, 369.99],
        ],
        arpCutoff: 1150,
      },
      victory: {
        // Uplifting F major / G / Am / C anthem
        bass: [87.31, 87.31, 98.0, 98.0, 110.0, 110.0, 130.81, 130.81],
        arp: [349.23, 440.0, 523.25, 698.46, 587.33, 523.25, 440.0, 523.25],
        pad: [
          [174.61, 261.63, 349.23],
          [196.0, 293.66, 392.0],
          [220.0, 329.63, 440.0],
          [261.63, 392.0, 523.25],
        ],
        arpCutoff: 2000,
      },
    };

    const p = progressions[this.currentTrack];
    const barIdx = Math.floor(step / 8) % 4;
    const stepInBar = step % 8;

    // Warm pad chord at the start of every 8-step bar
    if (stepInBar === 0) {
      const chord = p.pad[barIdx];
      chord.forEach((hz) => this.playTone(hz, time, 1.85, 'sine', 0.08, this.musicGain!, 720));
    }

    // Bass pulse
    if (step % 2 === 0 || this.currentTrack === 'launch') {
      const bFreq = p.bass[Math.floor(step / 4) % p.bass.length];
      this.playTone(
        bFreq,
        time,
        this.currentTrack === 'launch' ? 0.14 : 0.34,
        'triangle',
        this.currentTrack === 'launch' ? 0.2 : 0.14,
        this.musicGain,
        420,
      );
    }

    // Melodic arpeggio shimmer
    const arpFreq = p.arp[(step + barIdx * 2) % p.arp.length];
    if (this.currentTrack !== 'earth' || step % 2 === 0) {
      this.playTone(
        arpFreq,
        time,
        this.currentTrack === 'launch' ? 0.15 : 0.28,
        this.currentTrack === 'earth' ? 'sine' : 'triangle',
        0.065,
        this.musicGain,
        p.arpCutoff,
      );
    }

    // Soft rhythmic pulse on launch track
    if (this.currentTrack === 'launch' && this.noiseBuffer && (step % 4 === 0 || step % 4 === 2)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = step % 4 === 0 ? 'lowpass' : 'highpass';
      bp.frequency.value = step % 4 === 0 ? 150 : 6500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(step % 4 === 0 ? 0.12 : 0.035, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.musicGain);
      src.start(time);
      src.stop(time + 0.09);
    }
  }

  public playSfx(type: SfxType) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;

    switch (type) {
      case 'click':
        this.playTone(1350, t, 0.035, 'sine', 0.12, this.sfxGain, 3200);
        break;
      case 'snap':
        this.playTone(520, t, 0.06, 'triangle', 0.18, this.sfxGain, 2400);
        this.playTone(880, t + 0.04, 0.07, 'sine', 0.14, this.sfxGain, 3200);
        break;
      case 'beep':
        this.playTone(980, t, 0.09, 'sine', 0.15, this.sfxGain, 2600);
        break;
      case 'countdown':
        this.playTone(880, t, 0.14, 'square', 0.08, this.sfxGain, 1500);
        break;
      case 'ignition': {
        if (this.noiseBuffer) {
          const src = ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(220, t);
          lp.frequency.exponentialRampToValueAtTime(680, t + 0.8);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.01, t);
          g.gain.linearRampToValueAtTime(0.35, t + 0.15);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
          src.connect(lp);
          lp.connect(g);
          g.connect(this.sfxGain);
          src.start(t);
          src.stop(t + 1.15);
        }
        this.playTone(62, t, 1.0, 'sawtooth', 0.14, this.sfxGain, 280);
        break;
      }
      case 'stage': {
        if (this.noiseBuffer) {
          const src = ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const hp = ctx.createBiquadFilter();
          hp.type = 'bandpass';
          hp.frequency.value = 1200;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.22, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          src.connect(hp);
          hp.connect(g);
          g.connect(this.sfxGain);
          src.start(t);
          src.stop(t + 0.27);
        }
        this.playTone(180, t, 0.16, 'triangle', 0.2, this.sfxGain, 600);
        this.playTone(640, t + 0.06, 0.12, 'sine', 0.12, this.sfxGain, 2400);
        break;
      }
      case 'scan':
        this.playTone(660, t, 0.12, 'sine', 0.16, this.sfxGain, 3200);
        this.playTone(990, t + 0.07, 0.16, 'sine', 0.15, this.sfxGain, 3600);
        this.playTone(1320, t + 0.14, 0.22, 'sine', 0.12, this.sfxGain, 4000);
        break;
      case 'downlink':
        for (let i = 0; i < 4; i++) {
          this.playTone(1100 + i * 240, t + i * 0.045, 0.06, 'triangle', 0.12, this.sfxGain, 3600);
        }
        break;
      case 'warning':
        this.playTone(420, t, 0.15, 'sawtooth', 0.11, this.sfxGain, 900);
        this.playTone(340, t + 0.18, 0.2, 'sawtooth', 0.11, this.sfxGain, 900);
        break;
      case 'success':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          this.playTone(f, t + idx * 0.09, 0.45, 'triangle', 0.16, this.sfxGain!, 3200);
        });
        break;
    }
  }
}

export const soundEngine = new SpaceSoundEngine();
