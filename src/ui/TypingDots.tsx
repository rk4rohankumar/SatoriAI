import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/src/theme';

/** Three pulsing dots — used as a "thinking" indicator while the model streams. */
export function TypingDots() {
  const { c } = useTheme();

  const a = useSharedValue(0.3);
  const b = useSharedValue(0.3);
  const cval = useSharedValue(0.3);

  useEffect(() => {
    const opts = { duration: 500, easing: Easing.inOut(Easing.quad) };
    const cycle = (sv: typeof a) =>
      withRepeat(
        withTiming(1, opts, () => {
          'worklet';
          sv.value = withTiming(0.3, opts);
        }),
        -1,
        true,
      );
    a.value = cycle(a);
    b.value = withDelay(150, cycle(b));
    cval.value = withDelay(300, cycle(cval));
    return () => {
      cancelAnimation(a);
      cancelAnimation(b);
      cancelAnimation(cval);
    };
  }, [a, b, cval]);

  const sa = useAnimatedStyle(() => ({ opacity: a.value }));
  const sb = useAnimatedStyle(() => ({ opacity: b.value }));
  const sc = useAnimatedStyle(() => ({ opacity: cval.value }));

  return (
    <View
      accessibilityLabel="Assistant is thinking"
      style={styles.row}
    >
      <Animated.View style={[styles.dot, { backgroundColor: c.fgMuted }, sa]} />
      <Animated.View style={[styles.dot, { backgroundColor: c.fgMuted }, sb]} />
      <Animated.View style={[styles.dot, { backgroundColor: c.fgMuted }, sc]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 999 },
});
