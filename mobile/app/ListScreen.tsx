import { StyleSheet, View } from 'react-native';
import { recipeColors } from '../components/recipes';

export default function ListScreen() {
  return <View style={styles.screen} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: recipeColors.background },
});
