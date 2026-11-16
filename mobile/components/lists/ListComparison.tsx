import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { RecipeButton, recipeStyles as s } from '../recipes';
import { applyComparisonCommand, compareList, listCommand, listsPath } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import type { ShoppingComparisonRead, ShoppingListRead, ShoppingScenarioName } from '../../types/shoppingLists';

const labels: Record<ShoppingScenarioName, string> = { maxi: 'Maxi', metro: 'Metro', superc: 'Super C', cheapest: 'Moins cher' };
const money = (amount: string) => `${amount.replace('.', ',')} $`;
const descriptions = {
  complete: 'Achat proposé', owned: 'Déjà disponible', purchased: 'Déjà acheté · prix inconnu',
  unpriced: 'Prix ou produit à vérifier', unquantified: 'Quantité ou ingrédient à préciser',
  incompatible_units: 'Unités incompatibles à vérifier', search_limit: 'Calcul trop grand · à vérifier',
  manual_unavailable: 'Choix manuel conservé · achat à vérifier',
};

export default function ListComparison({ list, disabled, onCommand }: {
  list: ShoppingListRead; disabled: boolean; onCommand: (command: ListCommand) => Promise<boolean>;
}) {
  const { session } = useAuth();
  const [comparison, setComparison] = useState<ShoppingComparisonRead | null>(null);
  const [selected, setSelected] = useState<ShoppingScenarioName>('cheapest');
  const [choosing, setChoosing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(false);
  const userId = session?.user.id;
  useEffect(() => {
    generation.current += 1; setComparison(null); setChoosing(null); setError(''); setLoading(false);
    return () => { generation.current += 1; };
  }, [list.id, list.revision, userId]);
  async function compare() {
    if (!userId || disabled || inFlight.current) return;
    const attempt = generation.current;
    inFlight.current = true; setLoading(true); setError(''); setComparison(null);
    try {
      const value = await compareList(list.id, userId);
      if (generation.current === attempt) {
        if (value.source_revision !== list.revision) throw new Error('La liste a changé. Actualise la liste avant de comparer.');
        setComparison(value);
      }
    } catch (failure) {
      if (generation.current === attempt) setError(failure instanceof Error ? failure.message : 'Comparaison indisponible.');
    } finally {
      inFlight.current = false;
      if (generation.current === attempt) setLoading(false);
    }
  }
  const scenario = comparison?.scenarios.find(value => value.scenario === selected);
  function apply() {
    if (!comparison || !scenario || disabled || loading) return;
    const send = () => void onCommand(applyComparisonCommand(comparison, selected, !scenario.complete));
    if (!scenario.complete) Alert.alert('Appliquer une proposition partielle ?',
      'Certains besoins ou achats restent sans estimation. Le montant affiché est un sous-total connu.',
      [{ text: 'Annuler', style: 'cancel' }, { text: 'Appliquer la partie connue', onPress: send }]);
    else send();
  }
  return <View style={[s.notice, { gap: 12 }]}>
    <Text style={s.sectionTitle}>Comparer les magasins</Text>
    <Text style={s.body}>Consulter un scénario ne modifie pas ta liste. Les choix manuels restent conservés.</Text>
    <RecipeButton title={comparison ? 'Actualiser la comparaison' : 'Comparer les achats'} disabled={disabled || loading} onPress={() => void compare()} />
    {loading && <ActivityIndicator accessibilityLabel="Comparaison des achats" />}
    {!!error && <Text accessibilityRole="alert" style={s.requiredItem}>{error}</Text>}
    {comparison && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {comparison.scenarios.map(value => <RecipeButton key={value.scenario}
          title={`${labels[value.scenario]}${selected === value.scenario ? ' · sélectionné' : ''}`}
          variant={selected === value.scenario ? 'primary' : 'neutral'} disabled={disabled || loading}
          onPress={() => setSelected(value.scenario)} />)}
      </View>
      <Text style={s.note}>Moins cher compare les achats complets vérifiables par magasin. Peut nécessiter plusieurs magasins ; déplacements, taxes et consignes non documentées exclus.</Text>
      {scenario && <>
        <Text style={s.sectionTitle}>{scenario.complete ? 'Estimation des achats' : 'Sous-total connu'} : {money(scenario.known_amount)}</Text>
        <Text style={s.body}>{scenario.store_count} magasin(s) · {scenario.needs.filter(need => !['complete', 'owned'].includes(need.status)).length} besoin(s) à vérifier</Text>
        {scenario.store_totals.map(store => <Text key={`${store.retailer}:${store.store_id}`} style={s.body}>
          {labels[store.retailer]}{store.store_id ? ` · ${store.store_id}` : ''} : {money(store.amount)}
        </Text>)}
        {scenario.needs.map(need => <View key={need.item_ids.join(',')} style={{ gap: 8 }}>
          <Text style={s.sectionTitle}>{need.name}</Text>
          <Text style={s.body}>{descriptions[need.status]}{need.manual ? ' · choix manuel' : ''}</Text>
          {need.warnings.includes('MANUAL_CHOICE_OUTSIDE_SCENARIO') && <Text style={s.note}>Le magasin choisi manuellement est conservé en dehors de cette enseigne.</Text>}
          {need.warnings.includes('PURCHASED_PRICE_UNKNOWN') && <Text style={s.note}>Le prix des achats déjà effectués reste inconnu.</Text>}
          {need.lines.map(line => <Text key={line.sale.product_id} style={s.body}>
            {line.sale.raw_source.name} · {labels[line.sale.raw_source.retailer]} · {line.sale.price_basis === 'package' ? `${line.sale_units} paquet(s)` : `${line.quantity} ${need.unit}`}
            {' · '}{money(line.amount)}{line.estimated_weight ? ' · poids estimé' : ''}
          </Text>)}
          {need.ingredient_id && <RecipeButton title={`Choisir le produit pour ${need.name}`} variant="neutral" disabled={disabled}
            onPress={() => setChoosing(choosing === need.item_ids[0] ? null : need.item_ids[0])} />}
          {need.item_ids.map(itemId => list.choices.some(choice => choice.item_id === itemId) && <RecipeButton
            key={itemId} title={`Revenir au choix automatique pour ${need.name}`} variant="neutral" disabled={disabled}
            onPress={() => void onCommand(listCommand(`${listsPath}/${list.id}/items/${itemId}/choice`,
              { expected_revision: list.revision, product_id: null }, 'PUT'))} />)}
          {choosing === need.item_ids[0] && comparison.candidates.filter(candidate => candidate.ingredient_id === need.ingredient_id).map(candidate =>
            <View key={candidate.product_id}>
              <Text style={s.note}>{candidate.eligible ? 'Référence vérifiée pour le calcul' : 'Référence à vérifier · estimation indisponible'}</Text>
              <RecipeButton title={`${candidate.name} · ${labels[candidate.retailer]}${candidate.store_id ? ` · ${candidate.store_id}` : ''}`} variant="neutral" disabled={disabled}
                onPress={() => void onCommand(listCommand(`${listsPath}/${list.id}/items/${need.item_ids[0]}/choice`,
                  { expected_revision: list.revision, product_id: candidate.product_id }, 'PUT'))} />
            </View>)}
        </View>)}
        <RecipeButton title="Appliquer cette proposition" disabled={disabled || loading} onPress={apply} />
      </>}
    </>}
  </View>;
}
