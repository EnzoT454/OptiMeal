import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ingredient } from '../types/api';
import { RecipeButton, RecipeField, recipeColors, recipeStyles } from './recipes';

export default function IngredientPicker({ visible, ingredients, onSelect, onClose }: {
  visible: boolean; ingredients: Ingredient[]; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, padding: 20, backgroundColor: recipeColors.background, gap: 20 }}>
      <Text accessibilityRole="header" style={recipeStyles.sectionTitle}>Choisir un ingrédient</Text>
      <RecipeField label="Rechercher" placeholder="Nom de l’ingrédient" value={search} onChangeText={setSearch} />
      <FlatList data={ingredients.filter(i => [i.name, ...i.aliases].some(name => name.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))))}
        keyExtractor={i => i.id} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text>Aucun ingrédient pour cette recherche.</Text>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => { onSelect(item.id); setSearch(''); }}
          style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: recipeColors.border }}><Text style={[recipeStyles.body, { color: recipeColors.ink }]}>{item.name}</Text></Pressable>} />
      <View><RecipeButton title="Fermer" variant="neutral" onPress={onClose} /></View>
    </SafeAreaView>
  </Modal>;
}
