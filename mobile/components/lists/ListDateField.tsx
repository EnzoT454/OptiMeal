import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecipeButton, recipeColors, recipeStyles as s } from '../recipes';
import { dateLabel, localDate } from '../../services/shoppingLists';

export function ListDateField({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (date: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value + 'T12:00:00'));
  const close = () => setOpen(false);
  const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() },
    (_, i) => localDate(new Date(month.getFullYear(), month.getMonth(), i + 1)));
  return <View><Text style={s.label}>{label}</Text>
    <RecipeButton title={dateLabel(value)} variant="neutral" disabled={disabled}
      onPress={() => { setMonth(new Date(value + 'T12:00:00')); setOpen(true); }} />
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}>
        <Pressable onPress={close} accessible={false} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal onAccessibilityEscape={close}
          style={{ maxHeight: '80%', backgroundColor: recipeColors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 12 }}>
          <Text style={s.sectionTitle} accessibilityRole="header">{label}</Text>
          <Text style={s.sectionTitle}>{month.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })}</Text>
          <View style={s.row}>
            <RecipeButton title="Mois précédent" variant="neutral" style={{ flex: 1 }}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
            <RecipeButton title="Mois suivant" variant="neutral" style={{ flex: 1 }}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {days.map(day => <Pressable key={day} accessibilityRole="radio" accessibilityState={{ checked: day === value }}
              onPress={() => { onChange(day); close(); }}
              style={{ minHeight: 52, padding: 14, backgroundColor: day === value ? recipeColors.light : 'transparent' }}>
              <Text style={s.body}>{day === value ? '✓ ' : ''}{dateLabel(day)}</Text>
            </Pressable>)}
          </ScrollView>
          <RecipeButton title="Aujourd’hui" variant="neutral" onPress={() => { onChange(localDate()); close(); }} />
          <RecipeButton title="Fermer" variant="neutral" onPress={close} />
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
