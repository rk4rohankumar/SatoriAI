import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { ToolEventRecord } from '@/src/llm/types';
import { useTheme } from '@/src/theme';
import { Text } from '@/src/ui';

type Props = {
  event: ToolEventRecord;
};

function summaryText(event: ToolEventRecord): string {
  const count = event.count ?? event.results?.length ?? 0;
  const domains = event.domains ?? [];
  if (domains.length === 0) return `Searched web · ${count} sources`;
  if (domains.length === 1) return `Searched web · ${count} sources (${domains[0]}…)`;
  return `Searched web · ${count} sources (${domains[0]}, ${domains[1]}…)`;
}

/** Chip rendering the live/finished state of a single web-search tool call. */
export function ToolChip({ event }: Props) {
  const { c, r, s } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const isRunning = event.status === 'running';
  const isDone = event.status === 'done';
  const isError = event.status === 'error';

  const label = isRunning
    ? `Searching: ${event.query}`
    : isDone
      ? summaryText(event)
      : isError
        ? 'Search failed'
        : 'Search interrupted';

  const canExpand = isDone && !!event.results?.length;

  return (
    <View style={{ marginBottom: s['2'] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Web search: ${event.query}`}
        accessibilityState={{ expanded, disabled: !canExpand }}
        disabled={!canExpand}
        onPress={() => setExpanded((e) => !e)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: s['2'],
          paddingHorizontal: s['3'],
          paddingVertical: s['2'],
          borderRadius: r.pill,
          backgroundColor: c.accentSoft,
          opacity: pressed && canExpand ? 0.7 : 1,
        })}
      >
        {isRunning && <ActivityIndicator size="small" color={c.accent} />}
        <Text variant="meta" style={{ color: c.accent }}>
          {label}
        </Text>
      </Pressable>

      {expanded && canExpand && (
        <View
          style={{
            marginTop: s['1'],
            marginLeft: s['2'],
            borderLeftWidth: 1,
            borderColor: c.border,
            paddingLeft: s['3'],
            gap: s['1'],
          }}
        >
          {event.results!.map((result) => (
            <Pressable
              key={result.url}
              accessibilityRole="link"
              accessibilityLabel={result.title}
              onPress={() => {
                WebBrowser.openBrowserAsync(result.url).catch(() => {});
              }}
              style={{ paddingVertical: s['1'] }}
            >
              <Text variant="meta" style={{ color: c.fg }} numberOfLines={1}>
                {result.title}
              </Text>
              <Text variant="micro" color="fgSubtle" numberOfLines={1} style={{ textTransform: 'none' }}>
                {result.url}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
