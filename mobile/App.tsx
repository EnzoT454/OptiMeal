import { Text } from 'react-native';
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
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
import AddRecipeScreen from './app/AddRecipeScreen';
import ManualEntryScreen from './app/ManualEntryScreen';
import PromotionsScreen from './app/PromotionsScreen';
import PromoDetailScreen from './app/PromoDetailScreen';
import CircularsScreen from './app/CircularsScreen';
import CircularScreen from './app/CircularScreen';
import { MainTabParams, PromoStackParams, RecipeStackParams } from './types/navigation';

const Tabs = createBottomTabNavigator<MainTabParams>();
const Recipes = createNativeStackNavigator<RecipeStackParams>();
const Promos = createNativeStackNavigator<PromoStackParams>();
type IconName = ComponentProps<typeof Ionicons>['name'];
const tabIcons: Record<keyof MainTabParams, { active: IconName; inactive: IconName }> = {
  Accueil: { active: 'home', inactive: 'home-outline' },
  Recettes: { active: 'restaurant', inactive: 'restaurant-outline' },
  Calendrier: { active: 'calendar', inactive: 'calendar-outline' },
  Promos: { active: 'pricetag', inactive: 'pricetag-outline' },
  Paramètres: { active: 'settings', inactive: 'settings-outline' },
};
function RecipeNavigator() {
  return <Recipes.Navigator screenOptions={{ headerTintColor: '#25603c' }}>
    <Recipes.Screen name="List" component={RecipeListScreen} options={{ headerShown: false }} />
    <Recipes.Screen name="Add" component={AddRecipeScreen} options={{ headerShown: false }} />
    <Recipes.Screen name="ManualEntry" component={ManualEntryScreen} options={{ headerShown: false }} />
    <Recipes.Screen name="Detail" component={RecipeDetailScreen} options={{ title: 'La recette' }} />
    <Recipes.Screen name="Editor" component={RecipeEditorScreen} options={{ headerShown: false }} />
  </Recipes.Navigator>;
}
function PromoNavigator() {
  return <Promos.Navigator screenOptions={{ headerShown: false }}>
    <Promos.Screen name="List" component={PromotionsScreen} />
    <Promos.Screen name="Detail" component={PromoDetailScreen} />
    <Promos.Screen name="Circulars" component={CircularsScreen} />
    <Promos.Screen name="Circular" component={CircularScreen} />
  </Promos.Navigator>;
}
function Home() { return <Screen><Heading>Bienvenue dans OptiMeal</Heading><Text>Retrouve tes recettes et crée tes propres plats dans l’onglet Recettes.</Text></Screen>; }
function Calendar() { return <Screen><Heading>Calendrier</Heading><Text>La planification des repas sera disponible prochainement.</Text></Screen>; }
function Content() {
  const { session, loading } = useAuth();
  if (loading) return <Screen><Heading>OptiMeal</Heading><Text>Ouverture de ta session…</Text></Screen>;
  if (!session) return <SafeAreaView style={{ flex: 1 }}><AuthScreen /></SafeAreaView>;
  return <NavigationContainer key={session.user.id}><Tabs.Navigator screenOptions={({ route }) => ({
    tabBarActiveTintColor: '#25603c',
    tabBarInactiveTintColor: '#65746a',
    tabBarIcon: ({ focused, color, size }) => <Ionicons
      name={tabIcons[route.name][focused ? 'active' : 'inactive']} size={size} color={color} />,
  })}>
    <Tabs.Screen name="Accueil" component={Home} />
    <Tabs.Screen name="Promos" component={PromoNavigator} options={{ headerShown: false }} />
    <Tabs.Screen name="Recettes" component={RecipeNavigator} options={{ headerShown: false }} />
    <Tabs.Screen name="Calendrier" component={Calendar} />
    <Tabs.Screen name="Paramètres" component={ProfileScreen} />
  </Tabs.Navigator></NavigationContainer>;
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  if (!fontsLoaded && !fontError) return <SafeAreaProvider><Screen><Text>Chargement…</Text></Screen></SafeAreaProvider>;
  return <SafeAreaProvider><AuthProvider><StatusBar style="dark" /><Content /></AuthProvider></SafeAreaProvider>;
}