import { useCallback, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type { ShoppingListRead, ShoppingPage } from '../../types/shoppingLists';
import { AccountRequired } from '../AccountRequired';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../recipes';

// No personal screen is mounted until both the account and the API respond.
export default function ListAccessRequired({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const user = session?.user.id;
  const context = useRef({ user });
  if (context.current.user !== user) context.current = { user };
  const token = context.current;
  const [access, setAccess] = useState<{ token: object; allowed: boolean; error: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const retry = useRef<() => void>(() => {});
  useFocusEffect(useCallback(() => {
    let active = true, running = false;
    // Garder le navigateur déjà autorisé monté pendant la nouvelle vérification.
    // Son démontage perdait la destination demandée depuis Accueil.
    setChecking(!!user);
    async function check() {
      if (!user || running || !active) return;
      running = true; setChecking(true);
      try {
        await api<ShoppingPage<ShoppingListRead>>('/api/v1/shopping-lists?limit=1', {}, true, 5000, user);
        if (active && context.current === token) setAccess({ token, allowed: true, error: '' });
      } catch (failure) {
        if (active && context.current === token) setAccess({ token, allowed: false,
          error: failure instanceof Error ? failure.message : 'Vérifie ta connexion.' });
      } finally {
        running = false;
        if (active && context.current === token) setChecking(false);
      }
    }
    retry.current = () => { void check(); };
    if (!user) return () => { active = false; };
    void check();
    return () => { active = false; };
  }, [user]));
  if (!user) return <AccountRequired reason="Connecte-toi pour accéder à tes listes." />;
  const value = access?.token === token ? access : null;
  if (value?.allowed) return <>{children}</>;
  return <RecipeScreen>
    <RecipeTitle>Listes</RecipeTitle>
    {checking ? <ActivityIndicator color={recipeColors.green} accessibilityLabel="Vérification de la connexion" /> : <>
      <Text style={s.body}>Une connexion est nécessaire pour accéder aux listes.</Text>
      {!!value?.error && <Text accessibilityRole="alert" style={s.requiredItem}>{value.error}</Text>}
      <RecipeButton title="Réessayer" onPress={() => retry.current()} />
    </>}
  </RecipeScreen>;
}
