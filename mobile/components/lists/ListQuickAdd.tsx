import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, BackHandler, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { listCommand, listsPath, localDate } from '../../services/shoppingLists';
import type { ListCommand } from '../../services/shoppingLists';
import type { Ingredient, Offer, Page } from '../../types/api';
import type { ShoppingListRead, ShoppingTemplateRead } from '../../types/shoppingLists';
import { ProductImage } from '../ProductImage';
import { currentOfferPrice, quantityPriceCondition } from '../../services/offerPricing';
import { readShoppingRecents, rememberShoppingArticle, type ShoppingRecent } from '../../services/shoppingRecents';
import { templatesPath } from '../../services/shoppingReuse';
import { shoppingListKind } from '../../services/shoppingPresentation';
import { storeLabel } from './courseQuantities';
import { RecipeButton, recipeColors, recipeStyles as s } from '../recipes';

type QuickAddProps = {
  disabled: boolean; onCommand: (command: ListCommand) => Promise<boolean>;
  onEditingChange?: (editing: boolean) => void; onDone?: () => void; autoFocus?: boolean;
} & ({ list: ShoppingListRead; template?: never } | { template: ShoppingTemplateRead; list?: never });

export default function ListQuickAdd({ list, template, disabled, onCommand, onEditingChange, onDone, autoFocus = false }: QuickAddProps) {
  const target = template ?? list;
  const { session } = useAuth();
  const user = session?.user.id;
  const productsOnly = list ? shoppingListKind(list) === 'products' : false;
  const identity = `${user}:${template ? 'template' : 'list'}:${target.id}`;
  const current = useRef(identity); current.current = identity;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<ShoppingRecent[]>([]);
  const [products, setProducts] = useState<Offer[]>([]), [productTotal, setProductTotal] = useState(0), [productOffset, setProductOffset] = useState(0);
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [total, setTotal] = useState(0), [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0), [notice, setNotice] = useState('');
  const adding = useRef(false), request = useRef(0);
  const refocus = useRef(false);
  useEffect(() => {
    if (!disabled && refocus.current) { refocus.current = false; input.current?.focus(); }
  }, [disabled, notice]);
  const term = query.trim();
  const visibleRecents = recents.filter(item => productsOnly ? !!item.product_id : !item.product_id).slice(0, 3);
  const suggestionStyle = { minHeight: 48, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: recipeColors.border };
  useEffect(() => { onEditingChange?.(open); return () => onEditingChange?.(false); }, [open, onEditingChange]);
  useEffect(() => { setQuery(''); setOpen(false); setSuggestions([]); setNotice(''); }, [identity]);
  useEffect(() => {
    let active = true; setRecents([]);
    if (user) void readShoppingRecents(user).then(values => {
      if (active && current.current === identity) setRecents(values);
    }).catch(() => {});
    return () => { active = false; };
  }, [identity, user]);
  function closeSearch() {
    refocus.current = false;
    setNotice(''); setOpen(false); Keyboard.dismiss(); onDone?.();
  }
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { closeSearch(); return true; });
    return () => subscription.remove();
  }, [open]);
  useEffect(() => {
    setOffset(0); setProductOffset(0); setSuggestions([]); setProducts([]); setTotal(0); setProductTotal(0);
  }, [term, identity]);
  useEffect(() => {
    const version = ++request.current;
    if (!open || !user) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      void Promise.all([
        productsOnly ? Promise.resolve({ items: [] as Ingredient[], total: 0 }) : api<Page<Ingredient>>(`/api/v1/ingredients?q=${encodeURIComponent(term)}&limit=3&offset=${offset}`,
          { signal: controller.signal }, true, 15000, user),
        term && productsOnly ? api<Page<Offer>>(`/api/v1/offers?q=${encodeURIComponent(term)}&on_date=${localDate()}&limit=3&offset=${productOffset}`,
          { signal: controller.signal }, true, 15000, user) : Promise.resolve({ items: [] as Offer[], total: 0 }),
      ]).then(([page, offers]) => {
        if (current.current !== identity || request.current !== version) return;
        setSuggestions(page.items.slice(0, 3));
        setProducts(offers.items.slice(0, 3));
        setProductTotal(offers.total);
        setTotal(page.total);
      }).catch(failure => {
        if (!controller.signal.aborted && current.current === identity && request.current === version)
          setError(failure instanceof Error ? failure.message : 'Suggestions indisponibles.');
      }).finally(() => { if (current.current === identity && request.current === version) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); request.current++; };
  }, [term, offset, productOffset, open, user, identity, retry, list?.purchase_date, productsOnly]);

  async function add(name: string, ingredient_id: string | null, merge: 'add' | 'separate' = 'separate', productId?: string, finishAdding = false) {
    if (disabled || adding.current || !name.trim()) return;
    adding.current = true;
    const intent = template ? listCommand(`${templatesPath}/${template.id}`, {
      expected_revision: template.revision,
      items: [...template.items, { id: randomUUID(), name: name.trim(), ingredient_id,
        category: suggestions.find(item => item.id === ingredient_id)?.category ?? 'Autres',
        required: [], preferred_product_id: null }],
    }, 'PATCH') : listCommand(`${listsPath}/${target.id}/items`, {
      expected_revision: target.revision, name: name.trim(), ingredient_id, merge, ...(productId ? { product_id: productId } : {}),
    });
    const saved = await onCommand(intent);
    adding.current = false;
    if (current.current !== identity) return;
    if (saved) {
      refocus.current = !finishAdding;
      setQuery(''); setOffset(0); setProductOffset(0);
      if (finishAdding) closeSearch();
      else setNotice(`${name} ajouté à la liste.`);
      if (user) void rememberShoppingArticle(user, { name, ingredient_id, ...(productId ? { product_id: productId } : {}) }).then(values => {
        if (current.current === identity) setRecents(values);
      }).catch(() => {});
    }
  }
  function choose(name: string, ingredientId: string | null, productId?: string, finishAdding = false) {
    if (disabled || adding.current || (productsOnly && !productId)) return;
    const existing = target.items.find(item => !('removed' in item && item.removed) && (ingredientId ? item.ingredient_id === ingredientId : item.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr')));
    if (existing) Alert.alert('Article déjà présent', 'Conserver une ligne distincte ou regrouper ce besoin avec l’article existant ?', [
      { text: 'Annuler', style: 'cancel' },
      ...(ingredientId && !template ? [{ text: 'Regrouper', onPress: () => void add(name, ingredientId, 'add', productId, finishAdding) }] : []),
      { text: 'Garder séparé', onPress: () => void add(name, ingredientId, 'separate', productId, finishAdding) },
    ]);
    else void add(name, ingredientId, 'separate', productId, finishAdding);
  }
  return <View style={{ gap: 8 }}>
    <TextInput ref={input} autoFocus={autoFocus} value={query} maxLength={120} placeholder={productsOnly ? "+ Ajouter un produit…" : "+ Ajouter un article…"}
      accessibilityLabel={productsOnly ? "Rechercher un produit en magasin" : "Rechercher ou ajouter un article"} style={s.input} editable={!disabled}
      onFocus={() => setOpen(true)} onChangeText={value => { setQuery(value); setOffset(0); setProductOffset(0); setNotice(''); }}
      returnKeyType="done" submitBehavior="submit" accessibilityHint={productsOnly ? "Touchez un produit pour l’ajouter, puis Terminé pour actualiser les prix." : "Validez avec Entrée ou Terminé pour ajouter le texte comme article libre, ou touchez un ingrédient."} onSubmitEditing={() => { if (term && !productsOnly) choose(term, null); else closeSearch(); }} />
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>}
    {open && <View style={[s.notice, { gap: 8 }]}>
      <RecipeButton title="Terminé" variant="neutral" disabled={disabled} onPress={() => { if (term && !productsOnly) choose(term, null, undefined, true); else closeSearch(); }} />
      {!term && visibleRecents.length > 0 && <>
        <Text accessibilityRole="header" style={s.sectionTitle}>Récents</Text>
        {visibleRecents.map(item => <Pressable key={`${item.product_id ?? item.ingredient_id}:${item.name}`} accessibilityRole="button" disabled={disabled}
          accessibilityLabel={`Ajouter ${item.name} depuis les récents`} style={suggestionStyle}
          onPress={() => choose(item.name, item.ingredient_id, item.product_id)}><Text style={s.body}>{item.name}</Text></Pressable>)}
      </>}
      <Text accessibilityRole="header" style={s.sectionTitle}>{productsOnly ? 'Produits en magasin' : term ? 'Articles / ingrédients' : 'Suggestions'}</Text>
      {loading && <ActivityIndicator accessibilityLabel="Recherche d’articles" color={recipeColors.green} />}
      {!!error && <><Text accessibilityRole="alert" style={s.requiredItem}>{error}</Text>
        <RecipeButton title="Réessayer les suggestions" variant="neutral" onPress={() => setRetry(n => n + 1)} /></>}
      {!productsOnly && !loading && !error && !suggestions.length && <Text style={s.note}>Aucun ingrédient trouvé. Valide avec Entrée ou Terminé pour ajouter ton texte librement.</Text>}
      {!productsOnly && suggestions.map(ingredient => <Pressable key={ingredient.id} accessibilityRole="button" disabled={disabled}
        accessibilityLabel={`Ajouter l’article ${ingredient.name}, sans choisir de produit`} onPress={() => choose(ingredient.name, ingredient.id)}
        style={suggestionStyle}>
        <Text style={s.body}>{ingredient.name}</Text>
      </Pressable>)}
      {!productsOnly && offset > 0 && <RecipeButton title="Suggestions précédentes" variant="neutral" disabled={loading} onPress={() => setOffset(Math.max(0, offset - 3))} />}
      {!productsOnly && offset + suggestions.length < total && <RecipeButton title="Autres suggestions" variant="neutral" disabled={loading} onPress={() => setOffset(offset + 3)} />}
      {productsOnly && !loading && !error && !products.length && <Text style={s.note}>{term ? 'Aucun produit trouvé. Essaie un autre nom.' : 'Recherche un produit puis touche-le pour l’ajouter.'}</Text>}
      {!!term && products.length > 0 && <Text style={s.note}>Toucher un produit l’ajoute avec son magasin. Quand tes ajouts sont terminés, tu peux actualiser les prix.</Text>}
      {!!term && products.length > 0 && <Text style={s.note}>Prix indicatifs au {localDate()} ; prix en caisse et disponibilité à vérifier.</Text>}
      {products.map(product => {
        const price = currentOfferPrice(product);
        const name = product.product_name;
        return <Pressable key={product.product_id} accessibilityRole="button" disabled={disabled}
          accessibilityState={{ disabled }} accessibilityLabel={`Ajouter le produit ${product.product_name}, ${storeLabel(product.retailer)}`}
          onPress={() => choose(name, product.ingredient_id, product.product_id)}
          style={suggestionStyle}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {product.image_url && <ProductImage uri={product.image_url} size={40} />}
            <View style={{ flex: 1 }}><Text style={s.body}>{product.product_name}</Text>
              <Text style={s.note}>{storeLabel(product.retailer)} · {product.format.quantity && product.format.unit_raw ? `${product.format.quantity} ${product.format.unit_raw}` : 'Format à vérifier'} · {price === null ? 'Prix indisponible' : price.replace('.', ',') + ' $'}</Text>
              {!!quantityPriceCondition(product) && <Text style={s.note}>{quantityPriceCondition(product)}</Text>}
            </View>
          </View>
        </Pressable>;
      })}
      {productOffset > 0 && <RecipeButton title="Produits précédents" variant="neutral" disabled={loading} onPress={() => setProductOffset(Math.max(0, productOffset - 3))} />}
      {productOffset + products.length < productTotal && <RecipeButton title="Autres produits" variant="neutral" disabled={loading} onPress={() => setProductOffset(productOffset + 3)} />}
    </View>}
  </View>;
}
