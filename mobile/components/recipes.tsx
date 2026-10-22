import { ComponentProps, PropsWithChildren } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Screen } from './ui';

export const recipeColors = { background: '#fafbf8', ink: '#192d23', muted: '#617068', green: '#216b48', light: '#edf5ec', border: '#e1e8df' };
const icons = {
  book: require('../assets/figma/book.svg'), search: require('../assets/figma/search.svg'),
  leaf: require('../assets/figma/leaf.svg'), back: require('../assets/figma/back.svg'),
};

export function FigmaRecipeIcon({ name }: { name: keyof typeof icons }) {
  return <Image source={icons[name]} style={{ width: 24, height: 24 }} contentFit="contain" accessible={false} />;
}
export function RecipeScreen({ children, compact = false }: PropsWithChildren<{ compact?: boolean }>) {
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: recipeColors.background }}>
    <Screen contentStyle={[recipeStyles.screen, compact && { gap: 12 }]}>{children}</Screen>
  </SafeAreaView>;
}
export function RecipeTitle({ children, onBack }: PropsWithChildren<{ onBack?: () => void }>) {
  return <View style={recipeStyles.titleRow}>
    {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={10} onPress={onBack}><FigmaRecipeIcon name="back" /></Pressable>}
    <Text accessibilityRole="header" style={recipeStyles.title}>{children}</Text>
  </View>;
}
export function RecipeField(props: ComponentProps<typeof Field>) {
  return <Field {...props} labelStyle={[recipeStyles.label, props.labelStyle]}
    style={[recipeStyles.input, props.multiline && { minHeight: 68, textAlignVertical: 'top' }, props.style]} />;
}
export function RecipeButton({ variant = 'primary', ...props }: ComponentProps<typeof Button> & { variant?: 'primary' | 'neutral' }) {
  return <Button {...props} style={[recipeStyles.button, variant === 'neutral' && recipeStyles.neutralButton, props.style]}
    textStyle={[recipeStyles.buttonText, variant === 'neutral' && { color: recipeColors.ink }, props.textStyle]} />;
}
export function RecipeChip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const content = <Text style={[recipeStyles.chipText, selected && { color: 'white' }]}>{label}</Text>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }}
    onPress={onPress} hitSlop={4} style={[recipeStyles.chip, selected && { backgroundColor: recipeColors.green }]}>{content}</Pressable>
    : <View style={recipeStyles.chip}>{content}</View>;
}
export function showRecipeComingSoon(title: string) {
  Alert.alert(title, 'Disponible prochainement.');
}
export function RecipeChoice({ title, description, icon, onPress, spacious = false }: {
  title: string; description: string; icon: 'book' | 'search' | 'leaf'; onPress: () => void; spacious?: boolean;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[recipeStyles.choice, spacious && { paddingVertical: 20, gap: 12 }]}>
    <FigmaRecipeIcon name={icon} />
    <Text style={recipeStyles.sectionTitle}>{title}</Text><Text style={recipeStyles.body}>{description}</Text>
  </Pressable>;
}

export const recipeStyles = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 32, gap: 20, backgroundColor: recipeColors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 26, lineHeight: 35, color: recipeColors.ink },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 19, color: recipeColors.muted },
  intro: { fontFamily: 'DMSans_400Regular', fontSize: 17, lineHeight: 23, color: recipeColors.muted },
  body: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 19, color: recipeColors.muted },
  note: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, color: recipeColors.muted },
  sectionTitle: { fontFamily: 'DMSans_700Bold', fontSize: 19, lineHeight: 26, color: recipeColors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { padding: 10, minHeight: 36, borderRadius: 10, backgroundColor: recipeColors.light },
  chipText: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: recipeColors.green },
  count: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, color: recipeColors.green },
  label: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, color: recipeColors.ink, marginBottom: 7 },
  input: { fontFamily: 'DMSans_400Regular', fontSize: 15, lineHeight: 20, color: recipeColors.ink,
    padding: 14, minHeight: 48, borderRadius: 10, borderColor: recipeColors.border, backgroundColor: 'white' },
  button: { minHeight: 50, justifyContent: 'center', padding: 14, borderRadius: 12, backgroundColor: recipeColors.green },
  buttonText: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20 },
  neutralButton: { backgroundColor: 'white', borderWidth: 1, borderColor: recipeColors.border },
  choice: { borderRadius: 16, backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  notice: { backgroundColor: recipeColors.light, padding: 16, borderRadius: 14, gap: 5 },
  remove: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18, color: recipeColors.green, paddingVertical: 8 },
});
