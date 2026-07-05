/**
 * sounds.ts — Minimal Web Audio API sound effects for Thanni.
 *
 * Generates short synthesized tones (no external audio files needed).
 * Sounds only fire when the human player needs to take action.
 *
 * Usage:
 *   import { initAudio, playSound, isMuted, toggleMute } from './src/sounds';
 *   // Call initAudio() on a user gesture (e.g. "New Game" click)
 *   // Call playSound('yourTurn') when it's the human's turn
 */

const MUTE_KEY = 'thanni_muted';

let ctx: AudioContext | null = null;
let muted: boolean = localStorage.getItem(MUTE_KEY) === 'true';

/** Initialize the AudioContext. Must be called from a user gesture. */
export function initAudio(): void {
  if (ctx) return;
  try {
    ctx = new AudioContext();
  } catch {
    // Web Audio not supported — sounds silently disabled
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, String(muted));
  return muted;
}

// ── Tone helpers ──────────────────────────────────────────────────────

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15): void {
  if (muted || !ctx) return;
  // Resume context if suspended (autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playChord(notes: Array<{ freq: number; delay?: number }>, duration: number, type: OscillatorType = 'sine', gain = 0.1): void {
  notes.forEach(({ freq, delay = 0 }) => {
    setTimeout(() => playTone(freq, duration, type, gain), delay);
  });
}

// ── Named sounds ──────────────────────────────────────────────────────

const sounds = {
  /** Gentle two-note ascending chime — "it's your turn to play a card" */
  yourTurn: () => {
    playChord([
      { freq: 660, delay: 0 },    // E5
      { freq: 880, delay: 120 },   // A5
    ], 0.25, 'sine', 0.12);
  },

  /** Slightly different tone — "it's your turn to bid" */
  yourBid: () => {
    playChord([
      { freq: 523, delay: 0 },    // C5
      { freq: 659, delay: 100 },   // E5
      { freq: 784, delay: 200 },   // G5
    ], 0.2, 'triangle', 0.1);
  },

  /** Bright rising arpeggio — "you won the bid, pick trump" */
  pickTrump: () => {
    playChord([
      { freq: 440, delay: 0 },    // A4
      { freq: 554, delay: 80 },    // C#5
      { freq: 659, delay: 160 },   // E5
      { freq: 880, delay: 240 },   // A5
    ], 0.3, 'sine', 0.12);
  },

  /** Short success fanfare — round/match end */
  roundEnd: () => {
    playChord([
      { freq: 523, delay: 0 },    // C5
      { freq: 659, delay: 100 },   // E5
      { freq: 784, delay: 200 },   // G5
      { freq: 1047, delay: 350 },  // C6
    ], 0.4, 'triangle', 0.1);
  },
} as const;

export type SoundName = keyof typeof sounds;

/** Play a named sound effect. No-op if muted or AudioContext unavailable. */
export function playSound(name: SoundName): void {
  sounds[name]?.();
}
