import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeChip, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { discount, storeName } from '../components/promos';
import { fetchAllOffers, fetchIngredients, isOnPromo } from '../components/search';
import { Follow, getFollows, unfollow } from '../components/follows';
import { PromoCard, sectionStyle } from '../components/PromoCard';
import { FollowsChip } from '../components/FollowsChip';
import type { Offer } from '../types/api';
import { PromoStackParams } from '../types/navigation';

// Onglet « Suivis » : les ingrédients que l'utilisateur suit.
// En haut, ceux en promo cette semaine (cartes colorées) ; en dessous, ceux qui ne le sont pas encore.
export default function FollowsScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'Follows'>) {
  const [follows, setFollows] = useState<Follow[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [names, setNames] = useState<Record<string, string>>({}); // nom commun de chaque ingrédient
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([getFollows(), fetchAllOffers(), fetchIngredients().catch(() => [])]).then(([list, items, ingredients]) => {
      if (!active) return;
      setFollows(list);
      setOffers(items);
      setNames(Object.fromEntries(ingredients.map(i => [i.id, i.name])));
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Impossible de charger tes produits suivis.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  // Pour chaque ingrédient suivi : ses produits en promo (du plus gros rabais au plus petit) et ses magasins.
  const groups = useMemo(() => follows.map(f => {
    const all = offers.filter(o => o.ingredient_id === f.ingredient_id);
    const promos = all.filter(isOnPromo).sort((a, b) => (discount(b) ?? 0) - (discount(a) ?? 0));
    return { follow: f, name: names[f.ingredient_id] ?? f.name, all, promos };
  }), [follows, offers, names]);
  const onPromo = groups.filter(g => g.promos.length > 0);
  const waiting = groups.filter(g => g.promos.length === 0);

  const stop = async (ingredientId: string) => {
    await unfollow(ingredientId);
    setFollows(list => list.filter(f => f.ingredient_id !== ingredientId));
  };

  return <RecipeScreen>
    <RecipeTitle>Promos</RecipeTitle>

    <View style={recipeStyles.chips}>
      <RecipeChip label="Promotions" onPress={() => navigation.navigate('List')} />
      <RecipeChip label="Circulaires" onPress={() => navigation.navigate('Circulars')} />
      <FollowsChip count={onPromo.length} selected />
    </View>

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : !follows.length ? <View style={recipeStyles.notice}>
        <Ionicons name="notifications-outline" size={32} color={recipeColors.green} />
        <Text style={recipeStyles.sectionTitle}>Tu ne suis aucun produit</Text>
        <Text style={recipeStyles.body}>
          Ouvre un produit et touche « Me prévenir quand il est en promo ». Il apparaîtra ici dès qu’un des 3 magasins le met en promo.
        </Text>
        <RecipeButton title="Voir les promos" onPress={() => navigation.navigate('List')} />
      </View>
      : <>
        <Text style={recipeStyles.body}>
          {onPromo.length ? `${onPromo.length} de tes ${follows.length} produits suivis ${onPromo.length > 1 ? 'sont' : 'est'} en promo cette semaine.`
            : `Aucun de tes ${follows.length} produits suivis n’est en promo cette semaine.`}
        </Text>

        {/* Section 1 : en promo cette semaine, avec les cartes colorées de chaque magasin. */}
        {onPromo.length > 0 && <Text style={sectionStyle}>EN PROMO CETTE SEMAINE · {onPromo.length}</Text>}
        {onPromo.map(g => <View key={g.follow.ingredient_id} style={styles.group}>
          <GroupTitle name={g.name} onStop={() => stop(g.follow.ingredient_id)} />
          {g.promos.map(o => <PromoCard key={o.id} offer={o} followed onToggleFollow={() => stop(g.follow.ingredient_id)}
            onPress={() => navigation.navigate('Detail', { offer: o })} />)}
        </View>)}

        {/* Section 2 : pas encore en promo (carte sobre). */}
        {waiting.length > 0 && <Text style={sectionStyle}>PAS ENCORE EN PROMO · {waiting.length}</Text>}
        {waiting.map(g => <Pressable key={g.follow.ingredient_id} accessibilityRole="button" style={styles.waiting}
          disabled={!g.all.length} onPress={() => g.all[0] && navigation.navigate('Detail', { offer: g.all[0] })}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.waitingName}>{g.name}</Text>
            <Text style={recipeStyles.body}>
              {g.all.length ? `Prix régulier chez ${listStores(g.all)}` : 'Plus vendu dans les 3 magasins'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ne plus suivre ${g.name}`} hitSlop={8}
            onPress={() => stop(g.follow.ingredient_id)} style={styles.stopButton}>
            <Text style={styles.stopText}>Ne plus suivre</Text>
          </Pressable>
        </Pressable>)}

        <Text style={recipeStyles.note}>Les promos sont mises à jour chaque jeudi, avec les nouvelles circulaires.</Text>
      </>}
  </RecipeScreen>;
}

function GroupTitle({ name, onStop }: { name: string; onStop: () => void }) {
  return <View style={styles.groupTitle}>
    <Ionicons name="notifications" size={18} color={recipeColors.green} />
    <Text style={styles.groupName}>{name}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ne plus suivre ${name}`} hitSlop={8} onPress={onStop}>
      <Text style={styles.stopText}>Ne plus suivre</Text>
    </Pressable>
  </View>;
}

// « Maxi, Metro et Super C » : les magasins qui vendent cet ingrédient.
function listStores(offers: Offer[]) {
  const names = [...new Set(offers.map(o => storeName(o.retailer)))];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0];
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  groupName: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 22, color: recipeColors.ink },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: 16, padding: 16 },
  waitingName: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 22, color: recipeColors.ink },
  stopButton: { paddingVertical: 8, paddingHorizontal: 4 },
  stopText: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 19, color: recipeColors.muted, textDecorationLine: 'underline' },
});