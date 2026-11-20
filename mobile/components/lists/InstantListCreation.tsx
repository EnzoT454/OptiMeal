import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { RecipeButton, RecipeScreen, RecipeTitle, recipeColors, recipeStyles as s } from '../recipes';
import { useListCommand } from './useListCommand';
import { listCommand, listsPath } from '../../services/shoppingLists';

export default function InstantListCreation({ kind = 'articles', onCreated }: { kind?: 'articles' | 'products'; onCreated: (id: string) => void }) {
  const command = useListCommand(kind === 'articles' ? 'create.instant' : 'create.instant.products');
  const attempted = useRef(false);
  async function create() {
    const result = await command.run(command.pending ?? listCommand(listsPath, { kind, name: kind === 'products' ? 'Mes produits' : 'Mes courses', activate: true, items: [] }));
    if (result) onCreated(result.id);
  }
  useEffect(() => {
    if (command.ready && !command.pending && !attempted.current) {
      attempted.current = true;
      void create();
    }
  }, [command.ready]);
  return <RecipeScreen>
    <RecipeTitle>Créer une liste</RecipeTitle>
    {command.busy && <ActivityIndicator color={recipeColors.green} accessibilityLabel="Création de la liste" />}
    {!!command.error && <Text accessibilityRole="alert" style={s.requiredItem}>{command.error}</Text>}
    {command.pending && !command.busy && <Text style={s.body}>La réponse reste à confirmer. Reprends la création pour retrouver la même liste.</Text>}
    {!command.busy && (command.error || command.pending) && <RecipeButton
      title={command.pending ? 'Reprendre la création' : 'Réessayer'} disabled={!command.ready} onPress={() => void create()} />}
  </RecipeScreen>;
}
