import { Image, StyleSheet, View } from 'react-native';

import { illustrations } from '../data/illustrations';
import { cardStatus, packInfo, packProgress, type CardStatus, type PackState } from '../lib/packs';
import type { Review } from '../lib/srs';
import { colors, PAPER } from '../theme';
import { Icon, Txt } from './ui';

export const STATUS_COLOR: Record<CardStatus, string> = {
  new: '#2E322A',
  learning: colors.orange,
  known: colors.lime,
  mastered: colors.text,
};

/** One segment per card, so "how close am I" never needs explaining. */
export function PackBar({ packId, reviews, height = 8 }: { packId: string; reviews: Record<string, Review>; height?: number }) {
  const ids = packInfo[packId]?.pack.cardIds ?? [];
  const p = packProgress(packId, reviews);
  const gap = ids.length > 16 ? 2 : 4;
  return (
    <View
      style={[styles.bar, { gap }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${p.known} of ${p.total} known, ${p.learning} still learning, ${p.fresh} new`}
    >
      {ids.map((id) => (
        <View key={id} style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: STATUS_COLOR[cardStatus(reviews[id])] }} />
      ))}
    </View>
  );
}

export function PackLegend({ packId, reviews }: { packId: string; reviews: Record<string, Review> }) {
  const p = packProgress(packId, reviews);
  const items: [string, string][] = [
    [STATUS_COLOR.known, `${p.known} known`],
    [STATUS_COLOR.learning, `${p.learning} learning`],
    ['#3A3E35', `${p.fresh} new`],
  ];
  return (
    <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {items.map(([c, label]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: c }]} />
          <Txt size={12} color={colors.textMuted}>
            {label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** The pack's own card pictures, as its cover. Packs whose cards have no pictures show nothing. */
export function PackThumbs({ packId, count = 3, width = 58, height = 44, overlap = 18 }: { packId: string; count?: number; width?: number; height?: number; overlap?: number }) {
  const arts = (packInfo[packId]?.pack.cardIds ?? []).map((id) => illustrations[id]).filter(Boolean).slice(0, count);
  if (!arts.length) return null;
  const tilt = [-5, 3, -2, 4, -3];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {arts.map((src, i) => (
        <Image
          key={i}
          source={src}
          resizeMode="cover"
          style={[
            styles.thumb,
            { width, height, marginLeft: i && overlap ? -overlap : i ? 8 : 0 },
            overlap ? { transform: [{ rotate: `${tilt[i % tilt.length]}deg` }] } : null,
          ]}
        />
      ))}
    </View>
  );
}

/** Done, current, started early, open or locked, as a node on the path. */
export function PackNode({ state, size = 32 }: { state: PackState; size?: number }) {
  if (state === 'done')
    return (
      <View style={[styles.node, { width: size, height: size, backgroundColor: colors.lime }]}>
        <Icon name="check" size={size * 0.47} color={colors.ink} />
      </View>
    );
  if (state === 'current')
    return (
      <View style={[styles.node, { width: size, height: size, borderWidth: 2, borderColor: colors.lime }]}>
        <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size, backgroundColor: colors.lime }} />
      </View>
    );
  if (state === 'early') return <View style={[styles.node, { width: size, height: size, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.limeSoft }]} />;
  if (state === 'open') return <View style={[styles.node, { width: size, height: size, borderWidth: 2, borderColor: '#5A5F52' }]} />;
  return (
    <View style={[styles.node, { width: size, height: size, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }]}>
      <Icon name="lock" size={size * 0.4} color={colors.textFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row' },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  thumb: { borderRadius: 10, backgroundColor: PAPER, borderWidth: 2, borderColor: colors.surface2 },
  node: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
