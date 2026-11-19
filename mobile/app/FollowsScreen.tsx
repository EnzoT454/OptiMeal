import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Message } from '../components/ui';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { discount, storeName } from '../components/promos';
import { fetchAllOffers, isOnPromo } from '../components/search';
import { followKey, followsOffer } from '../components/follows';
import { useFollows } from '../components/useFollows';
import { PromoList, PromoView, ViewToggle, sectionStyle } from '../components/PromoCard';
import { OngletsPromos } from '../components/OngletsPromos';
import type { Offer } from '../types/api';
import { PromoStackParams } from '../types/navigation';

// Onglet « Suivis » : les produits que l'utilisateur suit (un produit précis dans un magasin précis).
// En haut, ceux en promo cette semaine ; en dessous, ceux qui ne le sont pas encore.
export default function FollowsScreen({ navigation }: NativeStackScreenProps<PromoStackParams, 'Follows'>) {
  const { follows, recharger: reloadFollows, toggle: toggleFollow, retirer: unfollow, error: followError } = useFollows();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<PromoView>('list');

  // Même présentation (grille ou liste) que la page Promos.
  useEffect(() => { AsyncStorage.getItem(VIEW_KEY).then(v => { if (v === 'list' || v === 'grid') setView(v); }).catch(() => {}); }, []);
  const changeView = (v: PromoView) => { setView(v); AsyncStorage.setItem(VIEW_KEY, v).catch(() => {}); };

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([reloadFollows(), fetchAllOffers()]).then(async ([, items]) => {
      if (!active) return;
      await reloadFollows(items);
      if (!active) return;
      setOffers(items);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Impossible de charger tes produits suivis.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry, reloadFollows]));

  const followed = offers.filter(o => follows.some(f => followsOffer(f, o)));
  const onPromo = followed.filter(isOnPromo).sort((a, b) => (discount(b) ?? 0) - (discount(a) ?? 0));
  const waiting = followed.filter(o => !isOnPromo(o));
  const gone = follows.filter(f => !offers.some(o => followsOffer(f, o))); // produit retiré du catalogue

  const list = (items: Offer[]) => <PromoList offers={items} view={view}
    onOpen={o => navigation.navigate('Detail', { offer: o })}
    isFollowed={o => follows.some(f => followsOffer(f, o))} onToggleFollow={toggleFollow} />;

  return <RecipeScreen>
    <RecipeTitle>Promos</RecipeTitle>
    {!!followError && <Message text={followError} />}

    <OngletsPromos actif="suivis" nbSuivis={onPromo.length} />

    {loading ? <ActivityIndicator color={recipeColors.green} style={{ marginTop: 24 }} />
      : error ? <View style={recipeStyles.notice}>
        <Message text={error} />
        <RecipeButton title="Réessayer" onPress={() => setRetry(retry + 1)} />
      </View>
      : !follows.length ? <View style={recipeStyles.notice}>
        <Ionicons name="notifications-outline" size={32} color={recipeColors.green} />
        <Text style={recipeStyles.sectionTitle}>Tu ne suis aucun produit</Text>
        <Text style={recipeStyles.body}>
          Touche la cloche d’un produit : il apparaîtra ici, et tu verras tout de suite quand il passe en promo dans son magasin.
        </Text>
        <RecipeButton title="Voir les promos" onPress={() => navigation.popToTop()} />
      </View>
      : <>
        <View style={styles.titleRow}>
          <Text style={[recipeStyles.body, { flex: 1 }]}>
            {onPromo.length ? `${onPromo.length} de tes ${follows.length} produits suivis ${onPromo.length > 1 ? 'sont' : 'est'} en promo cette semaine.`
              : `Aucun de tes ${follows.length} produits suivis n’est en promo cette semaine.`}
          </Text>
          <ViewToggle value={view} onChange={changeView} />
        </View>

        {onPromo.length > 0 && <Text style={sectionStyle}>EN PROMO CETTE SEMAINE · {onPromo.length}</Text>}
        {list(onPromo)}

        {waiting.length > 0 && <Text style={sectionStyle}>PAS ENCORE EN PROMO · {waiting.length}</Text>}
        {list(waiting)}

        {/* Produits suivis qui ne sont plus dans le catalogue : on propose simplement de les retirer. */}
        {gone.map(f => <View key={followKey(f)} style={styles.gone}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.goneName}>{f.name}</Text>
            <Text style={recipeStyles.body}>{f.product_id ? `Plus disponible chez ${storeName(f.retailer)}` : `Ancien suivi à réassocier chez ${storeName(f.retailer)} : retrouve ce produit dans Promos et suis-le à nouveau.`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ne plus suivre ${f.name}`} hitSlop={8}
            onPress={() => { void unfollow(followKey(f)); }}>
            <Text style={styles.stopText}>Ne plus suivre</Text>
          </Pressable>
        </View>)}

        <Text style={recipeStyles.note}>Les promos sont mises à jour chaque jeudi, avec les nouvelles circulaires.</Text>
      </>}
  </RecipeScreen>;
}

const VIEW_KEY = 'optimeal.promosView';

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gone: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: 16, padding: 16 },
  goneName: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 22, color: recipeColors.ink },
  stopText: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 19, color: recipeColors.muted, textDecorationLine: 'underline' },
});