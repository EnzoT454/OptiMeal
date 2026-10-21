import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Heading, Screen } from './components/ui';
import AuthScreen from './app/AuthScreen';
import ProfileScreen from './app/ProfileScreen';
import RecipeListScreen from './app/RecipeListScreen';
import RecipeDetailScreen from './app/RecipeDetailScreen';
import RecipeEditorScreen from './app/RecipeEditorScreen';
import { RecipeStackParams } from './types/navigation';

const Tabs = createBottomTabNavigator();
const Recipes = createNativeStackNavigator<RecipeStackParams>();
function RecipeNavigator() {
  return <Recipes.Navigator screenOptions={{ headerTintColor: '#25603c' }}>
    <Recipes.Screen name="List" component={RecipeListScreen} options={{ title: 'Recettes' }} />
    <Recipes.Screen name="Detail" component={RecipeDetailScreen} options={{ title: 'La recette' }} />
    <Recipes.Screen name="Editor" component={RecipeEditorScreen} options={{ title: 'Recette manuelle' }} />
  </Recipes.Navigator>;
}
function Home() { return <Screen><Heading>Bienvenue dans OptiMeal</Heading><Text>Retrouve tes recettes et crée tes propres plats dans l’onglet Recettes.</Text></Screen>; }
function Calendar() { return <Screen><Heading>Calendrier</Heading><Text>La planification des repas sera disponible prochainement.</Text></Screen>; }
function Promotions() { return <Screen><Heading>Promos</Heading><Text>Les offres des magasins seront disponibles prochainement.</Text></Screen>; }
function Content() {
  const { session, loading } = useAuth();
  if (loading) return <Screen><Heading>OptiMeal</Heading><Text>Ouverture de ta session…</Text></Screen>;
  if (!session) return <SafeAreaView style={{ flex: 1 }}><AuthScreen /></SafeAreaView>;
  return <NavigationContainer key={session.user.id}><Tabs.Navigator screenOptions={{ tabBarActiveTintColor: '#25603c' }}>
    <Tabs.Screen name="Accueil" component={Home} />
    <Tabs.Screen name="Recettes" component={RecipeNavigator} options={{ headerShown: false }} />
    <Tabs.Screen name="Calendrier" component={Calendar} />
    <Tabs.Screen name="Promos" component={Promotions} />
    <Tabs.Screen name="Paramètres" component={ProfileScreen} />
  </Tabs.Navigator></NavigationContainer>;
}
export default function App() {
  return <SafeAreaProvider><AuthProvider><StatusBar style="dark" /><Content /></AuthProvider></SafeAreaProvider>;
}
