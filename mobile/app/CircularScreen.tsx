import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeScreen, RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { longDate, storeName, todayText } from '../components/promos';
import { PromoStackParams } from '../types/navigation';

// La vraie circulaire d'un magasin, page par page (images envoyées par backend.cli.import_circulars).
export default function CircularScreen({ navigation, route }: NativeStackScreenProps<PromoStackParams, 'Circular'>) {
  const { circular } = route.params;
  const store = storeName(circular.retailer);
  const expired = circular.valid_to < todayText();

  return <RecipeScreen>
    <RecipeTitle onBack={() => navigation.goBack()}>Circulaire {store}</RecipeTitle>
    <Text style={recipeStyles.body}>
      Du {longDate(circular.valid_from)} au {longDate(circular.valid_to)} · {circular.page_count} page{circular.page_count > 1 ? 's' : ''}
    </Text>
    {expired && <Text style={styles.expired}>Cette circulaire est terminée : les prix ne sont peut-être plus valables.</Text>}
    <Text style={recipeStyles.note}>Touche une page pour l’agrandir.</Text>

    {circular.pages.map((uri, index) => <CircularPage key={uri} uri={uri} number={index + 1} />)}

    <Text style={recipeStyles.note}>Source : circulaire {store}. Les prix en magasin peuvent varier.</Text>
  </RecipeScreen>;
}

// Une page : on lit la taille de l'image pour l'afficher sur toute la largeur sans la déformer.
function CircularPage({ uri, number }: { uri: string; number: number }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Image.getSize(uri, (width, height) => { if (active) setRatio(width / height); },
      () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [uri]);

  if (failed) return <View style={[styles.page, styles.missing]}>
    <Text style={recipeStyles.body}>Page {number} indisponible.</Text>
  </View>;
  if (ratio == null) return <View style={[styles.page, styles.missing]}>
    <ActivityIndicator color={recipeColors.green} />
  </View>;
  return <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Page ${number}, toucher pour agrandir`}
    onPress={() => Linking.openURL(uri)}>
    <Image source={{ uri }} style={[styles.page, { aspectRatio: ratio }]} resizeMode="contain" />
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { width: '100%', borderRadius: 12, backgroundColor: 'white' },
  missing: { height: 240, alignItems: 'center', justifyContent: 'center' },
  expired: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 19, color: '#a5442b' },
});