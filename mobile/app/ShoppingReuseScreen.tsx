import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeButton, RecipeField, RecipeScreen, RecipeTitle, recipeStyles as s } from '../components/recipes';
import { ListDateField } from '../components/lists/ListDateField';
import { useListCommand } from '../components/lists/useListCommand';
import { templateIcons, templatesPath } from '../services/shoppingReuse';
import { fetchList, listCommand, listsPath, localDate, quantityLabel } from '../services/shoppingLists';
import type { ShoppingListRead, ShoppingTemplateIcon, ShoppingTemplateRead } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingReuseScreen({ route, navigation }: NativeStackScreenProps<ListStackParams, 'ReuseList'>) {
  const { id, revision, mode } = route.params;
  const [source, setSource] = useState<ShoppingListRead | null>(null);
  const [name, setName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(localDate);
  const [icon, setIcon] = useState<ShoppingTemplateIcon>('basket');
  const [choices, setChoices] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const mounted = useRef(false);
  const command = useListCommand<ShoppingListRead | ShoppingTemplateRead>(`reuse:${mode}:${id}:${revision}`);
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    let active = true; setLoading(true);
    fetchList(id).then(value => { if (active) { if (value.revision !== revision) throw new Error('La liste a changé. Rouvre-la avant de continuer.'); setSource(value); setName(value.name); setError(''); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Liste indisponible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, [id, revision]));
  async function save() {
    const intent = mode === 'copy'
      ? listCommand(`${listsPath}/${id}/duplicate`, { source_revision: revision, name: name.trim(), purchase_date: purchaseDate, include_choices: choices })
      : listCommand(templatesPath, { source_list_id: id, source_revision: revision, name: name.trim(), icon, include_choices: choices });
    const result = await command.run(command.pending ?? intent);
    if (!result || !mounted.current) return;
    if ('status' in result) navigation.replace('ShoppingDetail', { id: result.id });
    else navigation.replace('TemplateDetail', { id: result.id });
  }
  const locked = command.locked || loading;
  return <RecipeScreen><RecipeTitle>{mode === 'copy' ? 'Copier les besoins' : 'Enregistrer un modèle'}</RecipeTitle>
    <Text style={s.body}>Les achats, la possession et les prix ne seront pas repris. Les articles retirés sont ignorés.</Text>
    {!!(error || command.error) && <Text accessibilityRole="alert" style={s.requiredItem}>{error || command.error}</Text>}
    {loading && <ActivityIndicator accessibilityLabel="Chargement de la liste" />}
    {command.pending ? <View style={s.notice}><Text style={s.body}>Une demande attend sa confirmation. Reprends-la sans créer de doublon.</Text>
      <RecipeButton title="Reprendre l’enregistrement" disabled={command.busy} onPress={() => void save()} /></View> : source && <>
      <RecipeField label={mode === 'copy' ? 'Nom de la nouvelle liste' : 'Nom du modèle'} placeholder={mode === 'template' ? 'Ex. Fête, barbecue, voyage' : undefined} value={name} onChangeText={setName} editable={!locked} maxLength={120} />
      {mode === 'copy' ? <ListDateField label="Date prévue des courses" value={purchaseDate} onChange={setPurchaseDate} disabled={locked} /> : <View style={s.chips}>
        {(Object.keys(templateIcons) as ShoppingTemplateIcon[]).map(value => <RecipeButton key={value} title={`${templateIcons[value]} ${value === 'basket' ? 'Panier' : value === 'cart' ? 'Chariot' : value === 'leaf' ? 'Feuille' : value === 'home' ? 'Maison' : 'Repas'}`}
          variant={value === icon ? 'primary' : 'neutral'} accessibilityState={{ selected: value === icon }} disabled={locked} onPress={() => setIcon(value)} />)}
      </View>}
      {source.choices.length > 0 && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: choices, disabled: locked }} disabled={locked}
        style={[s.notice, { minHeight: 52 }]} onPress={() => setChoices(!choices)}>
        <Text style={s.body}>{choices ? '☑' : '☐'} Conserver les choix explicites de produits</Text>
        <Text style={s.note}>Leur disponibilité et leurs prix devront être vérifiés dans une nouvelle comparaison.</Text>
      </Pressable>}
      <Text style={s.sectionTitle}>Besoins à reprendre</Text>
      {source.items.filter(item => !item.removed).map(item => <View key={item.id} style={s.choice}>
        <Text style={s.sectionTitle}>{item.name}</Text><Text style={s.body}>{quantityLabel(item.required)}</Text>
      </View>)}
      <RecipeButton title={mode === 'copy' ? 'Créer la copie' : 'Enregistrer le modèle'} disabled={locked || !name.trim()} onPress={() => void save()} />
    </>}
  </RecipeScreen>;
}
