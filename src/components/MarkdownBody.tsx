import { memo } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/src/theme';
import { fontFamily, type } from '@/src/theme/typography';

type Props = {
  children: string;
  /** Text color of the enclosing bubble. */
  color: string;
};

/**
 * Markdown renderer themed to the design system, for assistant bubbles.
 * Pure JS (markdown-it under the hood) — safe for hot reload, no natives.
 */
export const MarkdownBody = memo(function MarkdownBody({ children, color }: Props) {
  const { c, r, s } = useTheme();

  const styles: Record<string, TextStyle | ViewStyle> = {
    body: { ...type.body, color },
    paragraph: { marginTop: 0, marginBottom: s['2'] },
    strong: { fontFamily: fontFamily.sansSemibold },
    em: { fontStyle: 'italic' },
    heading1: { ...type.subtitle, color, marginBottom: s['2'], marginTop: s['2'] },
    heading2: { ...type.subtitle, color, marginBottom: s['2'], marginTop: s['2'] },
    heading3: { ...type.h3, color, marginBottom: s['1'], marginTop: s['2'] },
    heading4: { ...type.h3, color, marginBottom: s['1'], marginTop: s['1'] },
    bullet_list: { marginBottom: s['2'] },
    ordered_list: { marginBottom: s['2'] },
    list_item: { flexDirection: 'row', marginBottom: s['1'] },
    code_inline: {
      ...type.mono,
      color,
      backgroundColor: c.surface3,
      borderRadius: r.sm,
      paddingHorizontal: 4,
    },
    code_block: {
      ...type.mono,
      color,
      backgroundColor: c.surface2,
      borderRadius: r.md,
      padding: s['3'],
      marginBottom: s['2'],
      borderWidth: 0,
    },
    fence: {
      ...type.mono,
      color,
      backgroundColor: c.surface2,
      borderRadius: r.md,
      padding: s['3'],
      marginBottom: s['2'],
      borderWidth: 0,
    },
    blockquote: {
      backgroundColor: 'transparent',
      borderLeftWidth: 2,
      borderLeftColor: c.accent,
      paddingLeft: s['3'],
      marginBottom: s['2'],
    },
    link: { color: c.accent, textDecorationLine: 'underline' },
    hr: { backgroundColor: c.border, height: 1, marginVertical: s['3'] },
    table: { borderWidth: 1, borderColor: c.border, borderRadius: r.sm },
    th: { ...type.bodyMedium, color, padding: s['2'] },
    td: { ...type.body, color, padding: s['2'] },
  };

  return (
    <Markdown
      style={styles as never}
      onLinkPress={(url) => {
        WebBrowser.openBrowserAsync(url).catch(() => {});
        return false;
      }}
    >
      {children}
    </Markdown>
  );
});
