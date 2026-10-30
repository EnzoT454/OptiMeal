import { useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { recipeColors } from './recipes';

// Photo d'un produit à partir de son lien (image_url).
// Sans lien, ou si l'image ne se charge pas, une icône de panier la remplace.
export function ProductImage({ uri, size, style }: { uri: string | null; size: number; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState(false);
  const show = !!uri && !failed;
  return <View style={[styles.box, { width: size, height: size }, style]}>
    {show
      ? <Image source={{ uri }} style={styles.image} resizeMode="contain"
          onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      : <Ionicons name="basket-outline" size={Math.round(size * 0.45)} color={recipeColors.green} />}
  </View>;
}

const styles = StyleSheet.create({
  box: { backgroundColor: 'white', borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});