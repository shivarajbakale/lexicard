import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { breakdowns, cardsOfRoot, rootFamilies, rootsById } from '../data';
import type { Card, Part } from '../lib/types';
import { colors, radius } from '../theme';
import { Icon, PressScale, Txt } from './ui';

const hasPage = (rootId?: string) => !!rootId && rootFamilies.some((r) => r.id === rootId);

/**
 * "Built from" strip for the Origin slide: one chip per part, its meaning underneath.
 * Parts that belong to a root family with its own page are dark and open that page.
 */
export function BuiltFrom({ card, phone }: { card: Card; phone: boolean }) {
  const router = useRouter();
  const b = breakdowns[card.id];
  if (!b) return null;
  const languages = [...new Set(b.parts.map((p) => p.rootId && rootsById[p.rootId]?.language).filter(Boolean))];
  const anyLink = b.parts.some((p) => hasPage(p.rootId));

  return (
    <View style={styles.block}>
      <Txt weight="semibold" size={11} color={ORIGIN_SUB} style={styles.caps}>
        Built from
      </Txt>
      <View style={styles.strip}>
        {b.parts.map((p, i) => (
          <Fragment key={`${p.text}-${i}`}>
            {i > 0 && (
              <Txt size={15} color={ORIGIN_SUB} style={styles.plus} importantForAccessibility="no">
                +
              </Txt>
            )}
            <PartChip part={p} phone={phone} onOpen={hasPage(p.rootId) ? () => router.push({ pathname: '/root/[id]', params: { id: p.rootId! } }) : undefined} />
          </Fragment>
        ))}
      </View>
      <Txt size={14} color={colors.ink}>
        <Txt size={14} color={ORIGIN_SUB}>
          Literally{' '}
        </Txt>
        <Txt weight="semibold" size={14} color={colors.ink}>
          “{b.literal}”
        </Txt>
        {languages.length > 0 && (
          <Txt size={14} color={ORIGIN_SUB}>
            {' · '}
            {languages.join(', ')}
          </Txt>
        )}
      </Txt>
      {b.drift && (
        <Txt size={13} color={ORIGIN_SUB} style={{ lineHeight: 19 }}>
          {b.drift}
        </Txt>
      )}
      {anyLink && (
        <Txt size={12} color={ORIGIN_SUB}>
          Tap a dark chip to see its other words
        </Txt>
      )}
    </View>
  );
}

const ORIGIN_SUB = '#3A2A1C';

function PartChip({ part, phone, onOpen }: { part: Part; phone: boolean; onOpen?: () => void }) {
  const dark = part.role !== 'suffix';
  const body = (
    <>
      <Txt weight={dark ? 'semibold' : 'medium'} size={phone ? 17 : 19} color={dark ? colors.orangeText : colors.ink} numberOfLines={1}>
        {part.role === 'suffix' ? `-${part.text}` : part.text}
      </Txt>
      <Txt size={12} color={dark ? colors.textSoft : ORIGIN_SUB} numberOfLines={1}>
        {part.gloss}
      </Txt>
    </>
  );
  if (!dark) return <View style={[styles.chip, styles.suffix]}>{body}</View>;
  if (!onOpen) return <View style={[styles.chip, styles.dark]}>{body}</View>;
  return (
    <PressScale
      style={[styles.chip, styles.dark, styles.linked]}
      scaleTo={0.95}
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={`${part.text}, ${part.gloss}. Open root page`}
    >
      {body}
    </PressScale>
  );
}

/** "Same root" for the last slide: other cards that share each of this card's root families. */
export function SameRoot({ card, phone }: { card: Card; phone: boolean }) {
  const router = useRouter();
  const b = breakdowns[card.id];
  const groups = (b?.parts ?? [])
    .filter((p) => hasPage(p.rootId))
    .map((p) => ({ part: p, root: rootsById[p.rootId!], others: cardsOfRoot[p.rootId!].filter((c) => c.id !== card.id) }))
    .filter((g, i, all) => g.others.length && all.findIndex((x) => x.root.id === g.root.id) === i);
  if (!groups.length) return null;

  return (
    <View style={{ gap: 12 }}>
      <Txt weight="semibold" size={phone ? 20 : 22} style={{ letterSpacing: -0.4 }} accessibilityRole="header">
        Same root
      </Txt>
      {groups.map(({ root, others }) => (
        <View key={root.id} style={{ gap: 8 }}>
          <PressScale
            style={styles.groupHead}
            scaleTo={0.98}
            onPress={() => router.push({ pathname: '/root/[id]', params: { id: root.id } })}
            accessibilityRole="link"
            accessibilityLabel={`Open root ${root.id}, ${root.meaning}`}
          >
            <Txt weight="semibold" size={14} color={colors.orangeSoft}>
              {root.forms.join(' · ')}
            </Txt>
            <Txt size={13} color={colors.textMuted}>
              {root.meaning} · {others.length} more {others.length === 1 ? 'word' : 'words'}
            </Txt>
            <Icon name="chevron-right" size={14} color={colors.textMuted} />
          </PressScale>
          <View style={styles.wrap}>
            {others.map((c) => (
              <PressScale
                key={c.id}
                style={styles.linkChip}
                scaleTo={0.95}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: c.id } })}
                accessibilityRole="link"
                accessibilityLabel={`Open ${c.term}`}
              >
                <Txt size={13}>{c.term.toLowerCase()}</Txt>
                <Icon name="arrow-up-right" size={13} color={colors.lime} />
              </PressScale>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The term with the parts of one root highlighted, e.g. a·PATH·y. */
export function SplitTerm({ card, rootId, size = 15 }: { card: Card; rootId: string; size?: number }) {
  const b = breakdowns[card.id];
  if (!b) return <Txt size={size}>{card.term}</Txt>;
  return (
    <Txt weight="medium" size={size}>
      {b.parts.map((p, i) => (
        <Txt key={i} weight="medium" size={size} color={p.rootId === rootId ? colors.lime : colors.text}>
          {p.text}
        </Txt>
      ))}
    </Txt>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  caps: { letterSpacing: 1.2, textTransform: 'uppercase' },
  strip: { flexDirection: 'row', alignItems: 'stretch', gap: 5 },
  plus: { alignSelf: 'center' },
  chip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 64,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dark: { backgroundColor: colors.ink },
  linked: { borderBottomWidth: 3, borderBottomColor: colors.orange },
  suffix: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(11,12,10,0.35)', flexGrow: 0.7 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.limeDeep,
    backgroundColor: colors.limeDeep,
  },
});
