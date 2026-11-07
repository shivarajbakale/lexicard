import scenesJson from './scenes.json';

/** What the picture on a card shows, in plain words. Generated from each picture's plan and bubbles. */
export interface Scene {
  /** 2–3 sentences; "[n]" marks where numbered bubble n fits */
  scene: string;
  /** One line per bubble, in number order */
  bubbles: string[];
}

export const scenes = scenesJson as Record<string, Scene>;
