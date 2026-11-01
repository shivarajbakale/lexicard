// Plays the pre-generated Kokoro TTS clips (assets/audio/<voice>/<card>/<slot>.mp3) in the chosen voice.
// Falls back to the device voice when a clip hasn't been generated yet.
import { Asset } from 'expo-asset';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';

import { audioClips } from '../data/audio';
import { useStore } from './store';
import type { VoiceId } from './voices';

export type AudioSlot = 'term' | 'meaning' | 'work' | 'social' | 'writing';

let player: AudioPlayer | null = null;
let current: string | null = null; // "<cardId>/<slot>" while playing
const listeners = new Set<() => void>();

/** Clips for the selected voice (or a given one). */
function clips(voice: VoiceId = useStore.getState().voice) {
  return audioClips[voice] ?? {};
}

function setCurrent(key: string | null) {
  current = key;
  listeners.forEach((l) => l());
}

function getPlayer(source: number) {
  if (!player) {
    player = createAudioPlayer(source);
    player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) setCurrent(null);
    });
  } else {
    player.replace(source);
  }
  return player;
}

export function hasClip(cardId: string, slot: AudioSlot) {
  return clips()[cardId]?.[slot] != null;
}

export function stopAudio() {
  player?.pause();
  Speech.stop();
  setCurrent(null);
}

/** Toggle-play a clip. `fallback` is spoken with the device voice if the clip is missing. */
export function playClip(cardId: string, slot: AudioSlot, fallback?: string, voice?: VoiceId) {
  const key = `${cardId}/${slot}`;
  if (current === key) {
    stopAudio();
    return;
  }
  stopAudio();
  const source = clips(voice)[cardId]?.[slot];
  if (source == null) {
    if (!fallback) return;
    setCurrent(key);
    Speech.speak(fallback, { language: 'en-US', rate: 0.9, onDone: () => setCurrent(null), onStopped: () => setCurrent(null) });
    return;
  }
  const p = getPlayer(source);
  setCurrent(key);
  p.seekTo(0).finally(() => p.play());
}

/** True while this clip is playing — drives the speaker button animation. */
export function useIsPlaying(cardId: string, slot: AudioSlot) {
  const key = `${cardId}/${slot}`;
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current === key,
    () => false,
  );
}

/** Web: fetch every clip of these cards so the service worker caches them for offline use. */
export async function downloadClips(cardIds: string[], onProgress?: (done: number, total: number) => void) {
  const all = clips();
  const sources = cardIds.flatMap((id) => Object.values(all[id] ?? {})).filter((s): s is number => s != null);
  let done = 0;
  for (const s of sources) {
    try {
      const uri = Asset.fromModule(s).uri;
      await fetch(uri);
    } catch {
      // keep going; a later play will fetch it again
    }
    onProgress?.(++done, sources.length);
  }
  return sources.length;
}

export function clipCount(cardIds: string[]) {
  const all = clips();
  return cardIds.reduce((n, id) => n + Object.keys(all[id] ?? {}).length, 0);
}
