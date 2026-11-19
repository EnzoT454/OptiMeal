import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { recipeColors as c } from './recipes';

export type OngletPromo = 'promos' | 'circulaires' | 'suivis';

const ONGLETS: { id: OngletPromo; label: string; ecran: string }[] = [
  { id: 'promos', label: 'Promos', ecran: 'List' },
  { id: 'circulaires', label: 'Circulaires', ecran: 'Circulars' },
  { id: 'suivis', label: 'Suivis', ecran: 'Follows' },
];

// Sélecteur segmenté de l'onglet Promos : 3 vues de la même page.
// nbSuivis = produits suivis en promo cette semaine (pastille rouge, comme une notification).
export function OngletsPromos({ actif, nbSuivis = 0 }: { actif: OngletPromo; nbSuivis?: number }) {
  const navigation = useNavigation<any>();

  function ouvrir(o: typeof ONGLETS[number]) {
    if (o.id === actif) return;
    if (o.id === 'promos') navigation.popToTop();           // l'écran Promos est la base de la pile
    else if (actif === 'promos') navigation.navigate(o.ecran); // depuis Promos : on ouvre la vue
    else navigation.replace(o.ecran);                         // entre Circulaires et Suivis : on remplace
  }

  return (
    <View style={styles.barre} accessibilityRole="tablist">
      {ONGLETS.map((o) => {
        const estActif = o.id === actif;
        const pastille = o.id === 'suivis' && nbSuivis > 0;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: estActif }}
            accessibilityLabel={pastille ? `${o.label}, ${nbSuivis} en promo` : o.label}
            onPress={() => ouvrir(o)}
            style={[styles.onglet, estActif && styles.ongletActif]}
          >
            <Text style={[styles.texte, estActif && styles.texteActif]} numberOfLines={1}>{o.label}</Text>
            {pastille && (
              <View style={styles.pastille} accessible={false}>
                <Text style={styles.textePastille} maxFontSizeMultiplier={1.3}>{nbSuivis}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { flexDirection: 'row', backgroundColor: '#ECEAE4', borderRadius: 14, padding: 4, gap: 4 },
  onglet: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11 },
  ongletActif: {
    backgroundColor: 'white',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  texte: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 19, color: c.muted },
  texteActif: { fontFamily: 'DMSans_700Bold', color: c.ink },
  pastille: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d1361b' },
  textePastille: { fontFamily: 'DMSans_700Bold', fontSize: 11, lineHeight: 14, color: 'white' },
});