import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import type { Profile } from '../types/api';
import { recipeColors as c } from './recipes';

type NomIcone = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type ElementMenu = { icone: NomIcone; titre: string; sousTitre?: string; onPress: () => void; danger?: boolean };
export type SectionMenu = { titre: string; elements: ElementMenu[] };

const LARGEUR = 300;
const ROUGE = '#a32d2d';

export default function MenuCompte({ visible, onFermer, sections }: {
  visible: boolean;
  onFermer: () => void;
  sections: SectionMenu[];
}) {
  const insets = useSafeAreaInsets();
  const { session, requestSignIn } = useAuth();
  const position = useRef(new Animated.Value(LARGEUR)).current;
  const [nom, setNom] = useState<string | null>(null);

  // À chaque ouverture : le panneau glisse depuis la droite, et on relit le nom choisi dans Paramètres
  useEffect(() => {
    if (!visible) return;
    position.setValue(LARGEUR);
    Animated.timing(position, { toValue: 0, duration: 220, useNativeDriver: true }).start();

    if (!session) { setNom(null); return; }
    let actif = true;
    api<Profile>('/api/v1/me')
      .then((p) => { if (actif) setNom(p.display_name?.trim() || null); })
      .catch(() => {});
    return () => { actif = false; };
  }, [visible, session?.user.id]);

  async function seDeconnecter() {
    onFermer();
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) Alert.alert('Déconnexion impossible', 'Réessaie dans un instant.');
    } catch {
      Alert.alert('Déconnexion impossible', 'Réessaie dans un instant.');
    }
  }

  function seConnecter() {
    onFermer();
    requestSignIn('Connecte-toi pour retrouver tes listes, tes repas et tes paramètres.');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer} statusBarTranslucent>
      <View style={styles.fond}>
        {/* La zone sombre à gauche : un appui ferme le menu */}
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Fermer le menu" onPress={onFermer} />

        <Animated.View style={[styles.panneau, {
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
          transform: [{ translateX: position }],
        }]}>
          <View style={styles.entete}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons name="account-outline" size={26} color={c.green} accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={styles.titre} numberOfLines={1}>{nom ?? 'Mon compte'}</Text>
              <Text style={styles.courriel} numberOfLines={1}>{session?.user.email ?? 'Non connecté'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer le menu" onPress={onFermer} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color={c.muted} />
            </Pressable>
          </View>

          {sections.map((section) => (
            <View key={section.titre}>
              <Text style={styles.titreSection}>{section.titre}</Text>
              {section.elements.map((el) => (
                <Pressable
                  key={el.titre}
                  accessibilityRole="button"
                  accessibilityLabel={el.sousTitre ? `${el.titre}. ${el.sousTitre}` : el.titre}
                  onPress={() => { onFermer(); el.onPress(); }}
                  style={({ pressed }) => [styles.ligne, pressed && styles.appuye]}
                >
                  <MaterialCommunityIcons name={el.icone} size={22} color={el.danger ? ROUGE : c.muted} accessible={false} />
                  <View style={{ flex: 1, paddingVertical: el.sousTitre ? 6 : 0 }}>
                    <Text style={[styles.texteLigne, el.danger && { color: ROUGE }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{el.titre}</Text>
                    {!!el.sousTitre && <Text style={styles.sousTitre}>{el.sousTitre}</Text>}
                  </View>
                </Pressable>
              ))}
            </View>
          ))}

          <View style={{ flex: 1 }} />

          <View style={styles.bas}>
            {session ? (
              <Pressable accessibilityRole="button" onPress={() => void seDeconnecter()}
                style={({ pressed }) => [styles.ligne, pressed && styles.appuye]}>
                <MaterialCommunityIcons name="logout" size={22} color={ROUGE} accessible={false} />
                <Text style={[styles.texteLigne, { color: ROUGE }]}>Se déconnecter</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={seConnecter}
                style={({ pressed }) => [styles.ligne, pressed && styles.appuye]}>
                <MaterialCommunityIcons name="login" size={22} color={c.green} accessible={false} />
                <Text style={[styles.texteLigne, { color: c.green }]}>Se connecter</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)' },
  panneau: { width: LARGEUR, backgroundColor: 'white', paddingHorizontal: 16, gap: 8 },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.light },
  titre: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, color: c.ink },
  courriel: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, color: c.muted },
  titreSection: { fontFamily: 'DMSans_500Medium', fontSize: 12, lineHeight: 16, color: c.muted, marginTop: 12, marginBottom: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingHorizontal: 8, borderRadius: 10 },
  texteLigne: { fontFamily: 'DMSans_500Medium', fontSize: 15, lineHeight: 20, color: c.ink },
  sousTitre: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 16, color: c.muted },
  appuye: { backgroundColor: c.light },
  bas: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 },
});