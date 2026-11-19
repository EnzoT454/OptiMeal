import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { RecipeButton, recipeColors, recipeStyles as s } from '../recipes';
import { fetchPriceOptions, recalculatePricesCommand } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import type { ShoppingDraftProduct, ShoppingListRead } from '../../types/shoppingLists';
import { storeLabel } from './courseQuantities';

export default function ListProductAlternatives({ list, itemId, disabled, onCommand, onClose }: {
  list: ShoppingListRead; itemId: string; disabled: boolean;
  onCommand: (intent: ListCommand) => Promise<boolean>; onClose: () => void;
}) {
  const { session } = useAuth();
  const user = session?.user.id;
  const identity = `${user}:${list.id}:${list.revision}:${itemId}`;
  const current = useRef(identity); current.current = identity;
  const generation = useRef(0), inFlight = useRef<number | null>(null);
  const [state, setState] = useState<{ identity: string; products: ShoppingDraftProduct[] } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selecting = useRef(false);
  const load = useCallback(async () => {
    if (!user || inFlight.current === generation.current) return;
    const version = generation.current; inFlight.current = version;
    setLoading(true); setError('');
    try {
      const quote = await fetchPriceOptions(list.id, user);
      if (current.current !== identity || generation.current !== version) return;
      const need = quote.scenarios.find(scenario => scenario.scenario === 'cheapest')?.needs.find(value => value.item_ids.includes(itemId));
      setState({ identity, products: need ? quote.candidates.filter(product => product.item_id === need.item_ids[0]) : [] });
    } catch (failure) {
      if (current.current === identity && generation.current === version) setError(failure instanceof Error ? failure.message : 'Produits indisponibles.');
    } finally {
      if (current.current === identity && generation.current === version) { inFlight.current = null; setLoading(false); }
    }
  }, [identity]);
  useEffect(() => {
    generation.current++; inFlight.current = null; setState(null); setSaving(false);
    void load();
    return () => { generation.current++; };
  }, [load]);
  const products = state?.identity === identity ? state.products : [];
  return <View style={[s.notice, { gap: 12 }]}>
    <Text style={s.sectionTitle}>Choisir où l’acheter</Text>
    {loading && <ActivityIndicator color={recipeColors.green} accessibilityLabel="Chargement des produits" />}
    {!!error && <Text accessibilityRole="alert" style={s.requiredItem}>{error}</Text>}
    {!!error && <RecipeButton title="Réessayer" variant="neutral" disabled={loading || disabled} onPress={() => void load()} />}
    {!loading && !error && !products.length && <Text style={s.note}>Aucun achat supplémentaire chiffré pour cet article.</Text>}
    {products.map(product => <View key={product.product_id}>
      <RecipeButton title={`${storeLabel(product.retailer)} · ${product.name}${product.amount !== null ? ` · ${product.amount.replace('.', ',')} $` : ''}`}
        variant="neutral" disabled={disabled || loading || saving || product.amount === null || !product.units} onPress={() => {
          if (selecting.current || disabled) return;
          selecting.current = true; setSaving(true);
          void onCommand(recalculatePricesCommand(list, { scenario: 'cheapest', choices: [{ item_id: itemId, product_id: product.product_id }] }))
            .then(saved => { if (saved) onClose(); })
            .finally(() => { selecting.current = false; if (current.current === identity) setSaving(false); });
        }} />
      <Text style={s.note}>{product.issue ?? `${product.units} produit(s)${product.format ? ` · ${product.format}` : ''}`}</Text>
    </View>)}
    <RecipeButton title="Fermer les produits" variant="neutral" disabled={saving} onPress={onClose} />
  </View>;
}
