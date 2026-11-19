import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecipeButton, recipeStyles as s } from '../recipes';
import type { ShoppingComparedNeed, ShoppingDraftPricingRead, ShoppingDraftProduct, ShoppingScenarioName } from '../../types/shoppingLists';

export const creationStoreLabels = { maxi: 'Maxi', metro: 'Metro', superc: 'Super C', cheapest: 'Moins cher' } as const;
const order: ShoppingScenarioName[] = ['maxi', 'metro', 'superc', 'cheapest'];
const money = (value: string) => `${value.replace('.', ',')} $`;

export default function CreationPrices({ quote, selected, disabled, onSelect, onPick }: {
  quote: ShoppingDraftPricingRead; selected: ShoppingScenarioName | null; disabled: boolean;
  onSelect: (scenario: ShoppingScenarioName) => void;
  onPick: (product: ShoppingDraftProduct) => void;
}) {
  const [choosing, setChoosing] = useState<string | null>(null);
  function alternatives(need: ShoppingComparedNeed) {
    const options = quote.candidates.filter(candidate => candidate.item_id === need.item_ids[0]);
    return choosing === need.item_ids[0] && <View style={[s.notice, { gap: 10 }]}>
      <Text style={s.sectionTitle}>Choisir où acheter {need.name}</Text>
      {!options.length && <Text style={s.note}>Aucun produit associé dans le catalogue.</Text>}
      {options.map(candidate => <View key={candidate.product_id}>
        <RecipeButton title={`${creationStoreLabels[candidate.retailer]} · ${candidate.name}${candidate.amount !== null ? ` · ${money(candidate.amount)}` : ''}`}
          variant="neutral" disabled={disabled || candidate.amount === null} onPress={() => { setChoosing(null); onPick(candidate); }} />
        <Text style={s.note}>{candidate.issue ?? `${candidate.units} produit(s)${candidate.format ? ` · ${candidate.format}` : ''}`}</Text>
      </View>)}
      <RecipeButton title="Fermer les produits" variant="neutral" onPress={() => setChoosing(null)} />
    </View>;
  }
  return <View style={{ gap: 14 }}>
    {order.map(name => {
      const scenario = quote.scenarios.find(value => value.scenario === name);
      if (!scenario) return null;
      const expanded = name === selected;
      const missing = scenario.needs.filter(need => !need.lines.length);
      const groups = [...new Set(scenario.needs.flatMap(need => need.lines.map(line => `${line.sale.raw_source.retailer}|${line.sale.raw_source.store_id ?? ''}`)))];
      return <View key={name} style={[s.choice, { gap: 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Voir les produits ${creationStoreLabels[name]}`}
          accessibilityState={{ expanded, selected: expanded, disabled }} disabled={disabled} onPress={() => { setChoosing(null); onSelect(name); }} style={{ minHeight: 48, gap: 6 }}>
          <Text style={s.sectionTitle}>{creationStoreLabels[name]}</Text>
          <Text style={s.body}>{scenario.needs.some(need => need.lines.length) ? `${scenario.complete ? 'Total' : 'Sous-total'} : ${money(scenario.known_amount)}` : 'Prix indisponible'}</Text>
          {!!missing.length && <Text style={s.note}>{missing.length} ingrédient(s) sans prix</Text>}
        </Pressable>
        {expanded && <>
          {groups.map(group => {
            const [retailer, store] = group.split('|');
            return <View key={group} style={{ gap: 10 }}>
              {name === 'cheapest' && <Text accessibilityRole="header" style={s.sectionTitle}>{creationStoreLabels[retailer as 'maxi' | 'metro' | 'superc']}{store ? ` · ${store}` : ''}</Text>}
              {scenario.needs.flatMap(need => need.lines.filter(line => `${line.sale.raw_source.retailer}|${line.sale.raw_source.store_id ?? ''}` === group).map(line => {
                const candidate = quote.candidates.find(value => value.item_id === need.item_ids[0] && value.product_id === line.sale.product_id);
                return <View key={`${need.item_ids[0]}:${line.sale.product_id}`} style={{ gap: 6 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Changer le magasin pour ${need.name}`} disabled={disabled}
                    onPress={() => setChoosing(choosing === need.item_ids[0] ? null : need.item_ids[0])} style={{ minHeight: 56, gap: 4 }}>
                    <Text style={s.sectionTitle}>{need.name} · {line.sale.raw_source.name}</Text>
                    <Text style={s.body}>{line.sale_units} produit(s) · {money(line.amount)}</Text>
                    <Text style={s.note}>{candidate?.format ?? 'Format non précisé'}{candidate?.unit_price != null ? ` · prix affiché ${money(candidate.unit_price)}` : ''}</Text>
                    {line.sale.raw_source.quantity_limit != null && <Text style={s.note}>Prix promotionnel limité à {String(line.sale.raw_source.quantity_limit)} produit(s) ; total calculé avec le prix après limite.</Text>}
                  </Pressable>
                  {alternatives(need)}
                </View>;
              }))}
            </View>;
          })}
          {missing.map(need => <View key={need.item_ids[0]}>
            <RecipeButton title={`${need.name} · Voir les autres magasins`} variant="neutral" disabled={disabled}
              onPress={() => setChoosing(choosing === need.item_ids[0] ? null : need.item_ids[0])} />
            {alternatives(need)}
          </View>)}
        </>}
      </View>;
    })}
  </View>;
}
