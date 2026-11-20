import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../components/recipes';
import { ProductImage } from '../components/ProductImage';
import { useListCommand } from '../components/lists/useListCommand';
import { fetchList, fetchPriceOptions, recalculatePricesCommand } from '../services/shoppingLists';
import { dateLabel } from '../services/shoppingLists';
import { storeLabel } from '../components/lists/courseQuantities';
import type { ShoppingDraftPricingRead, ShoppingListRead, ShoppingScenarioName } from '../types/shoppingLists';
import type { ListStackParams } from '../types/navigation';

export default function ShoppingComparisonScreen({ route, navigation }: NativeStackScreenProps<ListStackParams, 'Comparison'>) {
  const { id } = route.params;
  const { session } = useAuth();
  const user = session?.user.id;
  const context = `${user}:${id}`, current = useRef(context); current.current = context;
  const [list, setList] = useState<ShoppingListRead | null>(null);
  const [quote, setQuote] = useState<ShoppingDraftPricingRead | null>(null);
  const [selected, setSelected] = useState<ShoppingScenarioName>('cheapest');
  const [products, setProducts] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const command = useListCommand(`comparison:${id}`);
  const version = useRef(0);
  async function load() {
    if (!user) return;
    const generation = ++version.current; setLoading(true); setError(''); setQuote(null);
    try {
      const resource = await fetchList(id, user);
      const pricing = await fetchPriceOptions(id, user);
      if (current.current === context && version.current === generation) { setList(resource); setQuote(pricing); }
    } catch (failure) {
      if (current.current === context && version.current === generation) setError(failure instanceof Error ? failure.message : 'Comparaison indisponible.');
    } finally { if (current.current === context && version.current === generation) setLoading(false); }
  }
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [context]));
  const scenario = quote?.scenarios.find(value => value.scenario === selected);
  const groupedProducts = new Map<string, { need: string; line: NonNullable<typeof scenario>['needs'][number]['lines'][number] }[]>();
  for (const need of scenario?.needs ?? []) for (const line of need.lines) {
    const store = storeLabel(line.sale.raw_source.retailer);
    groupedProducts.set(store, [...(groupedProducts.get(store) ?? []), { need: need.name, line }]);
  }
  async function apply() {
    if (!command.pending && (!list || !quote || !scenario)) return;
    const result = await command.run(command.pending ?? recalculatePricesCommand(list!, {
      scenario: selected, expected_fingerprint: quote!.fingerprint, accept_partial: !scenario!.complete,
    }));
    if (result && current.current === context) navigation.goBack();
  }
  const locked = command.locked || loading;
  return <RecipeScreen>
    <RecipeTitle>Comparer les prix</RecipeTitle>
    <Text style={s.body}>Comparer ne modifie pas ta liste. Applique une proposition seulement si elle te convient.</Text>
    {loading && <ActivityIndicator color={recipeColors.green} accessibilityLabel="Comparaison des prix" />}
    {!!(error || command.error) && <Text accessibilityRole="alert" style={s.requiredItem}>{error || command.error}</Text>}
    {!!(error || command.error) && !command.pending && <RecipeButton title="Actualiser la comparaison" disabled={loading} variant="neutral" onPress={() => void load()} />}
    {command.pending ? <RecipeButton title="Reprendre l’application" disabled={command.busy} onPress={() => void apply()} /> : quote && list && <>
      <Text style={s.note}>Prix applicables aux courses du {dateLabel(list.purchase_date)}. Prix en caisse et disponibilité à vérifier ; déplacements, taxes et consignes non documentées exclus.</Text>
      {(['cheapest', 'maxi', 'metro', 'superc'] as ShoppingScenarioName[]).map(name => {
        const value = quote.scenarios.find(candidate => candidate.scenario === name);
        if (!value) return null;
        const missing = value.needs.filter(need => !['complete', 'owned', 'purchased'].includes(need.status)).length;
        const priced = value.needs.some(need => need.lines.length > 0) || Number(value.purchased_known_amount ?? '0') > 0;
        return <View key={name} style={{ gap: 6 }}>
          {name === 'maxi' && <Text accessibilityRole="header" style={s.sectionTitle}>Un seul magasin</Text>}
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected === name, disabled: locked }} disabled={locked}
            onPress={() => { setSelected(name); setProducts(false); }} style={[s.choice, selected === name && { borderColor: recipeColors.green }]}>
            <Text style={s.sectionTitle}>{selected === name ? '✓ ' : ''}{name === 'cheapest' ? 'Le moins cher' : storeLabel(name)}</Text>
            <Text style={s.body}>{priced ? `${value.complete ? 'Total estimé' : 'Sous-total connu'} : ${value.known_amount.replace('.', ',')} $` : 'Prix indisponible'}</Text>
            {!!missing && <Text style={s.note}>{missing} article(s) : prix indisponible</Text>}
            <Text style={s.note}>{name === 'cheapest' ? 'Peut combiner plusieurs magasins.' : 'Les choix explicites et les achats passés peuvent provenir d’un autre magasin.'}</Text>
          </Pressable>
        </View>;
      })}
      <RecipeButton title={products ? 'Masquer les produits' : 'Voir les produits'} variant="neutral" onPress={() => setProducts(!products)} />
      {products && [...groupedProducts].map(([store, entries]) => <View key={store} style={s.notice}>
        <Text accessibilityRole="header" style={s.sectionTitle}>{store}</Text>
        {entries.map(({ need, line }, index) => <View key={`${line.sale.product_id}:${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {typeof line.sale.raw_source.image_url === 'string' && <ProductImage uri={line.sale.raw_source.image_url} size={48} />}
          <View style={{ flex: 1 }}><Text style={s.body}>{line.sale.raw_source.name}</Text>
            <Text style={s.note}>Pour : {need}</Text>
            <Text style={s.note}>{storeLabel(line.sale.raw_source.retailer)} · {line.sale_units} produit(s) · {line.amount.replace('.', ',')} $</Text>
            <Text style={s.note}>{line.sale.format?.raw ?? 'Format à vérifier'}</Text>
            {line.sale.raw_source.quantity_limit != null && <Text style={s.note}>Promotion limitée à {String(line.sale.raw_source.quantity_limit)} ; prix après limite inclus.</Text>}
          </View>
        </View>)}
      </View>)}
      {products && scenario?.needs.filter(need => !need.lines.length).map(need => <View key={need.item_ids[0]} style={s.notice}>
        <Text style={s.body}>{need.name}</Text>
        <Text style={s.note}>{need.status === 'owned' ? 'Déjà disponible' : need.status === 'purchased' ? 'Achat conservé' : 'Prix indisponible'}</Text>
      </View>)}
      <RecipeButton title="Appliquer cette proposition" disabled={locked || !scenario} onPress={() => Alert.alert('Appliquer cette proposition ?',
        `${scenario?.complete ? '' : 'Certains articles restent sans prix. Le montant est un sous-total. '}Les produits proposés pour le complément seront enregistrés. Tes achats passés sont conservés.`, [
          { text: 'Annuler', style: 'cancel' }, { text: 'Appliquer', onPress: () => void apply() },
        ])} />
    </>}
    <RecipeButton title="Retour à ma liste" variant="neutral" disabled={command.busy} onPress={() => navigation.goBack()} />
  </RecipeScreen>;
}
