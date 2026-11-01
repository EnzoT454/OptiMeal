import { PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Heading, Screen } from './ui';

// Les écrans personnels ne sont montés qu'avec une session.
export function AccountRequired({ children, reason, onCancel }: PropsWithChildren<{
  reason: string; onCancel?: () => void;
}>) {
  const { session, requestSignIn } = useAuth();
  if (session) return <>{children}</>;
  return <Screen>
    <Heading>Un compte pour continuer</Heading>
    <Text>{reason}</Text>
    <Button title="Se connecter ou créer un compte" onPress={() => requestSignIn(reason)} />
    {onCancel && <Button title="Retour aux recettes" onPress={onCancel} />}
  </Screen>;
}
