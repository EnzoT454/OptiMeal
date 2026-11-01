import { Modal, Text } from 'react-native';
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Heading, Screen } from './components/ui';
import { AccountRequired } from './components/AccountRequired';
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
import CookWithPromosScreen from './app/CookWithPromosScreen';
import CalendarScreen from './app/CalendarScreen';
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
function ProtectedAdd(props: NativeStackScreenProps<RecipeStackParams, 'Add'>) {
  return <AccountRequired reason="Connecte-toi pour ajouter tes propres recettes." onCancel={() => props.navigation.popToTop()}>
    <AddRecipeScreen {...props} />
  </AccountRequired>;
}
function ProtectedManualEntry(props: NativeStackScreenProps<RecipeStackParams, 'ManualEntry'>) {
  return <AccountRequired reason="Connecte-toi pour ajouter tes propres recettes." onCancel={() => props.navigation.popToTop()}>
    <ManualEntryScreen {...props} />
  </AccountRequired>;
}
function ProtectedEditor(props: NativeStackScreenProps<RecipeStackParams, 'Editor'>) {
  return <AccountRequired reason="Connecte-toi pour enregistrer tes recettes." onCancel={() => props.navigation.popToTop()}>
    <RecipeEditorScreen {...props} />
  </AccountRequired>;
}
function RecipeNavigator() {
  return <Recipes.Navigator screenOptions={{ headerTintColor: '#25603c' }}>
    <Recipes.Screen name="List" component={RecipeListScreen} options={{ headerShown: false }} />
    <Recipes.Screen name="Add" component={ProtectedAdd} options={{ headerShown: false }} />
    <Recipes.Screen name="ManualEntry" component={ProtectedManualEntry} options={{ headerShown: false }} />
    <Recipes.Screen name="Detail" component={RecipeDetailScreen} options={{ title: 'La recette' }} />
    <Recipes.Screen name="Editor" component={ProtectedEditor} options={{ headerShown: false }} />
  </Recipes.Navigator>;
}
function PromoNavigator() {
  return <Promos.Navigator screenOptions={{ headerShown: false }}>
    <Promos.Screen name="List" component={PromotionsScreen} />
    <Promos.Screen name="Detail" component={PromoDetailScreen} />
    <Promos.Screen name="Circulars" component={CircularsScreen} />
    <Promos.Screen name="Circular" component={CircularScreen} />
    <Promos.Screen name="Cook" component={CookWithPromosScreen} />
  </Promos.Navigator>;
}
function Home() { return <Screen><Heading>Bienvenue dans OptiMeal</Heading><Text>Découvre les recettes, les promotions et les circulaires. Connecte-toi pour ajouter tes propres recettes et retrouver tes favoris.</Text></Screen>; }
function Calendar() {
  return <AccountRequired reason="Connecte-toi pour planifier tes repas dans ton calendrier.">
    <CalendarScreen />
  </AccountRequired>;
}
function Content() {
  const { session, loading, signInReason, dismissSignIn } = useAuth();
  if (loading) return <Screen><Heading>OptiMeal</Heading><Text>Ouverture de ta session…</Text></Screen>;
  return <><NavigationContainer key={session?.user.id ?? 'visitor'}><Tabs.Navigator screenOptions={({ route }) => ({
    tabBarActiveTintColor: '#25603c',
    tabBarInactiveTintColor: '#65746a',
    tabBarIcon: ({ focused, color, size }) => <Ionicons
      name={tabIcons[route.name][focused ? 'active' : 'inactive']} size={size} color={color} />,
  })}>
    <Tabs.Screen name="Accueil" component={Home} />
    <Tabs.Screen name="Promos" component={PromoNavigator} options={{ headerShown: false }} />
    <Tabs.Screen name="Recettes" component={RecipeNavigator} options={{ headerShown: false }} />
    <Tabs.Screen name="Calendrier" component={Calendar} options={{ headerShown: false }} />
    <Tabs.Screen name="Paramètres" component={ProfileScreen} />
  </Tabs.Navigator></NavigationContainer>
    {!session && signInReason !== null && <Modal visible animationType="slide" onRequestClose={dismissSignIn}>
      <SafeAreaView style={{ flex: 1 }}><AuthScreen reason={signInReason} onCancel={dismissSignIn} /></SafeAreaView>
    </Modal>}
  </>;
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  if (!fontsLoaded && !fontError) return <SafeAreaProvider><Screen><Text>Chargement…</Text></Screen></SafeAreaProvider>;
  return <SafeAreaProvider><AuthProvider><StatusBar style="dark" /><Content /></AuthProvider></SafeAreaProvider>;
}
