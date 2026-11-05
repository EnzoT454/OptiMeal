import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecipeUnit } from '../types/api';
import { recipeUnits } from '../services/recipeForm';
import { RecipeButton, recipeColors, recipeStyles } from './recipes';

export default function RecipeUnitPicker({ value, onChange, ingredientLabel, disabled = false }: {
  value: RecipeUnit | null; onChange: (unit: RecipeUnit) => void; ingredientLabel: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = recipeUnits.find(option => option.value === value);
  const close = () => setOpen(false);

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Unité, ${ingredientLabel}, ${selected?.accessibilityLabel ?? 'aucune unité sélectionnée'}`}
      accessibilityHint="Ouvre la liste des unités." accessibilityState={{ expanded: open, disabled }} disabled={disabled}
      onPress={() => { if (!disabled) { Keyboard.dismiss(); setOpen(true); } }}
      style={({ pressed }) => [recipeStyles.input, styles.selector, pressed && styles.pressed, disabled && { opacity: 0.5 }]}>
      <Text style={[recipeStyles.body, styles.value, { color: selected ? recipeColors.ink : recipeColors.muted }]}>
        {selected?.label ?? 'Choisir une unité'}
      </Text>
      <MaterialCommunityIcons name="chevron-down" size={22} color={recipeColors.muted} accessible={false} />
    </Pressable>
    {open && <Modal transparent animationType="slide" visible onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} accessible={false} focusable={false} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}
          accessibilityViewIsModal onAccessibilityEscape={close}>
          <Text accessibilityRole="header" style={recipeStyles.sectionTitle}>Choisir une unité</Text>
          <Text style={recipeStyles.note}>{ingredientLabel}</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            <View accessibilityRole="radiogroup" accessibilityLabel="Unités disponibles">
              {recipeUnits.map(option => <Pressable key={option.value} accessibilityRole="radio"
                accessibilityLabel={option.accessibilityLabel} accessibilityState={{ checked: value === option.value }}
                onPress={() => { onChange(option.value); close(); }}
                style={({ pressed }) => [styles.option, value === option.value && styles.selected, pressed && styles.pressed]}>
                <Text style={[recipeStyles.body, styles.optionLabel, value === option.value && styles.selectedLabel]}>
                  {option.value === 'g' ? 'Grammes (g)' : option.value === 'ml' ? 'Millilitres (ml)' : option.label}
                </Text>
                {value === option.value && <MaterialCommunityIcons name="check" size={22} color={recipeColors.green} accessible={false} />}
              </Pressable>)}
            </View>
          </ScrollView>
          <RecipeButton title="Fermer" variant="neutral" onPress={close} />
        </SafeAreaView>
      </View>
    </Modal>}
  </>;
}

const styles = StyleSheet.create({
  selector: { minHeight: 52, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { flex: 1, fontSize: 15, lineHeight: 21 },
  pressed: { backgroundColor: recipeColors.light },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '85%', alignSelf: 'center', padding: 20, gap: 12,
    backgroundColor: recipeColors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  list: { flexShrink: 1 },
  option: { minHeight: 56, padding: 14, marginBottom: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionLabel: { flex: 1, fontSize: 16, lineHeight: 23, color: recipeColors.ink },
  selected: { backgroundColor: recipeColors.light },
  selectedLabel: { fontFamily: 'DMSans_700Bold', color: recipeColors.green },
});
