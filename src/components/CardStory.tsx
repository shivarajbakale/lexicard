import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { Scene } from '../data/scenes';
import type { Card } from '../lib/types';
import { colors, confidenceStyle, radius } from '../theme';
import { SpeakerGlyph } from './Speaker';
import { SETTING_LABEL } from './UsedItSheet';
import { Highlighted, Icon, Label, Pill, PressScale, Txt } from './ui';

/** "[1]" markers in a scene line become the same ink badges the picture draws on its bubbles. */
export function SceneText({ text, size = 15, color = colors.text }: { text: string; size?: number; color?: string }) {
  const parts = text.split(/(\[\d+\])/);
  return (
    <Txt size={size} color={color} style={{ lineHeight: Math.round(size * 1.47) }}>
      {parts.map((p, i) => {
        const m = /^\[(\d+)\]$/.exec(p);
        return m ? (
          <Txt key={i} weight="bold" size={size - 3} color={colors.lime} style={styles.badge}>
            {` ${m[1]} `}
          </Txt>
        ) : (
          p
        );
      })}
    </Txt>
  );
}

interface Props {
  card: Card;
  art?: ImageSourcePropType;
  scene?: Scene;
  /** picture box size on the card */
  artW: number;
  artH: number;
  /** 0 = card, 1 = story mode */
  progress: SharedValue<number>;
  onFullPage: () => void;
}

/**
 * Everything on the back of the card, top to bottom. The first screenful is the card back
 * (picture, what's happening, meaning); scrolling on carries straight on into the story.
 */
export function CardStory({ card, art, scene, artW, artH, progress, onFullPage }: Props) {
  const daily = card.uses.find((u) => u.setting === 'social') ?? card.uses[0];
  const conf = confidenceStyle[card.origin.confidence];
  const cueStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - progress.value * 3) }));
  const numbered = (scene?.bubbles.length ?? 0) > 1;

  return (
    <View style={{ gap: 14 }}>
      {art ? (
        <View style={[styles.art, { width: artW, height: artH }]}>
          <Image
            source={art}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            accessible
            accessibilityLabel={scene ? scene.scene.replace(/\s*\[\d+\]/g, '') : `Cartoon of ${card.term}`}
          />
          <SpeakerGlyph cardId={card.id} slot="social" style={styles.speaker} />
        </View>
      ) : (
        <View style={{ height: 30 }}>
          <SpeakerGlyph cardId={card.id} slot="social" style={[styles.speaker, { top: -4, right: -4 }]} />
        </View>
      )}

      <View style={styles.body}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <Txt weight="semibold" size={24} style={{ letterSpacing: -0.6 }}>
            {card.term}
          </Txt>
          <Txt size={13} color={colors.textMuted}>
            {card.pos}
          </Txt>
        </View>

        {scene && (
          <View style={{ gap: 6 }}>
            <Label>What’s happening</Label>
            <SceneText text={numbered ? scene.scene : scene.scene.replace(/\s*\[\d+\]/g, '')} />
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Label color={colors.textMuted}>Meaning</Label>
          <Txt size={15} color={colors.textSoft} style={{ lineHeight: 22 }}>
            {card.meaning}
          </Txt>
        </View>

        {!art && (
          <View style={styles.daily}>
            <Label color={colors.textMuted}>In daily life</Label>
            <Txt size={15} style={{ lineHeight: 21 }}>
              “{daily.sentence}”
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              {daily.where}
            </Txt>
          </View>
        )}

        <Animated.View style={[styles.cue, cueStyle]} pointerEvents="none">
          <Icon name="chevron-up" size={18} color={colors.limeSoft} />
          <Txt weight="medium" size={13} color={colors.limeSoft}>
            Scroll for the story
          </Txt>
        </Animated.View>

        {/* ── Story mode ── */}
        <View style={{ gap: 28, paddingTop: 6 }}>
          {scene && numbered && (
            <Section label="In the picture" color={colors.lime}>
              {scene.bubbles.map((b, i) => (
                <View key={i} style={styles.bubbleRow}>
                  <View style={styles.bubbleNum}>
                    <Txt weight="bold" size={12} color={colors.lime}>
                      {i + 1}
                    </Txt>
                  </View>
                  <Txt size={15} color={colors.textSoft} style={{ flex: 1, lineHeight: 22 }}>
                    {b}
                  </Txt>
                </View>
              ))}
            </Section>
          )}

          <Section label="How it feels">
            <Txt size={16} color={colors.textSoft} style={{ lineHeight: 24 }}>
              {card.nuance}
            </Txt>
            {card.literal && (
              <View style={styles.literal}>
                <Txt size={12} color={colors.textMuted}>
                  Literally
                </Txt>
                <Txt size={15} color={colors.textSoft} style={{ lineHeight: 22 }}>
                  {card.literal}
                </Txt>
              </View>
            )}
          </Section>

          <Section label="In use">
            {card.uses.map((u) => (
              <View key={u.setting} style={styles.use}>
                <Txt size={12} color={colors.textMuted}>
                  {SETTING_LABEL[u.setting]} · {u.where}
                </Txt>
                <Highlighted sentence={u.sentence} highlight={u.highlight} size={16} />
              </View>
            ))}
          </Section>

          {(card.pitfall || card.similar?.length || card.opposite) && (
            <Section label="Watch out" color={colors.orangeSoft}>
              {card.pitfall && (
                <View style={styles.pitfall}>
                  <Txt size={15} color={colors.orangeText} style={{ lineHeight: 22 }}>
                    {card.pitfall}
                  </Txt>
                </View>
              )}
              {(card.similar?.length || card.opposite) && (
                <View style={styles.chips}>
                  {card.similar?.map((s) => (
                    <View key={s} style={styles.chip}>
                      <Txt size={13} color={colors.textSoft}>
                        {s}
                      </Txt>
                    </View>
                  ))}
                  {card.opposite && (
                    <View style={[styles.chip, { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'transparent' }]}>
                      <Txt size={13} color={colors.textMuted}>
                        Opposite: {card.opposite}
                      </Txt>
                    </View>
                  )}
                </View>
              )}
            </Section>
          )}

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Label color={colors.textMuted}>Origin</Label>
              <Pill label={conf.label} bg={conf.bg} fg={conf.fg} style={{ paddingVertical: 2, paddingHorizontal: 8 }} />
            </View>
            <Txt size={15} color={colors.textSoft} style={{ lineHeight: 23 }}>
              {card.origin.summary}
            </Txt>
          </View>

          <PressScale style={styles.more} scaleTo={0.97} onPress={onFullPage} accessibilityRole="button">
            <Txt weight="medium" size={14}>
              Roots, timeline and practice
            </Txt>
            <Icon name="arrow-up-right" size={15} color={colors.textMuted} />
          </PressScale>
        </View>
      </View>
    </View>
  );
}

function Section({ label, color = colors.textMuted, children }: { label: string; color?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Label color={color}>{label}</Label>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#F3F2EC' },
  speaker: { position: 'absolute', top: 10, right: 10 },
  body: { gap: 14, paddingHorizontal: 8 },
  badge: { backgroundColor: colors.ink, borderRadius: 9, overflow: 'hidden' },
  daily: { gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.cardInner },
  cue: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  bubbleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.cardInner },
  bubbleNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  literal: { gap: 4, padding: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  use: { gap: 8, padding: 16, borderRadius: radius.lg, backgroundColor: colors.cardInner },
  pitfall: { padding: 14, borderRadius: radius.md, backgroundColor: colors.orangeDeep },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.chip },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
