import { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';

export function Screen({ children, contentStyle }: PropsWithChildren<{ contentStyle?: StyleProp<ViewStyle> }>) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.screen, contentStyle]}>{children}</ScrollView>;
}
export function Heading({ children }: PropsWithChildren) { return <Text style={styles.heading}>{children}</Text>; }
export function Message({ text }: { text: string }) { return text ? <Text accessibilityLiveRegion="polite" style={styles.message}>{text}</Text> : null; }
export function Field({ label, labelStyle, containerStyle, style, ...props }: TextInputProps & { label: string; labelStyle?: StyleProp<TextStyle>; containerStyle?: StyleProp<ViewStyle> }) {
  return <View style={containerStyle}><Text style={[styles.label, labelStyle]}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input, style]} {...props} /></View>;
}
export function Button({ title, onPress, disabled = false, style, textStyle }: { title: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, style, disabled && { opacity: 0.5 }]}><Text style={[styles.buttonText, textStyle]}>{title}</Text></Pressable>;
}
export const styles = StyleSheet.create({
  screen: { padding: 22, paddingBottom: 48, gap: 14, backgroundColor: '#f5f8f4', flexGrow: 1 },
  heading: { fontSize: 27, fontWeight: '700', color: '#173d29', marginVertical: 8 },
  label: { fontSize: 15, marginBottom: 6, color: '#263a2d' },
  input: { padding: 13, borderWidth: 1, borderColor: '#b7c9bb', borderRadius: 10, backgroundColor: 'white', fontSize: 16 },
  button: { padding: 14, borderRadius: 10, backgroundColor: '#25603c', alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  message: { color: '#7c3021', fontSize: 15, lineHeight: 22 },
  card: { padding: 18, borderRadius: 12, backgroundColor: 'white', gap: 8, borderWidth: 1, borderColor: '#dce5db' },
});
