import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const BUCKET = 'recipes-images';
const MAX_BYTES = 5 * 1024 * 1024;

export async function chooseRecipeImage(): Promise<string | null> {
  // Le sélecteur système donne accès à la photo choisie seulement.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > 1200) {
    context.resize(asset.width >= asset.height ? { width: 1200 } : { height: 1200 });
  }
  const rendered = await context.renderAsync();
  try {
    const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
    if (new File(image.uri).size > MAX_BYTES) {
      throw new Error('Cette photo est trop volumineuse. Choisis une autre image (maximum 5 Mo).');
    }
    return image.uri;
  } finally {
    rendered.release();
    context.release();
  }
}

export async function uploadRecipeImage(uri: string): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Reconnecte-toi avant d’envoyer une photo.');
  const bytes = await new File(uri).arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) {
    throw new Error('Photo vide ou trop volumineuse (maximum 5 Mo).');
  }
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const path = `users/${data.session.user.id}/${filename}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const result = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST', body: bytes, signal: controller.signal,
      headers: {
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600', 'x-upsert': 'false',
      },
    });
    if (!result.ok) throw new Error('Envoi de la photo impossible. Vérifie la connexion et réessaie.');
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    throw new Error('Envoi de la photo impossible. Vérifie la connexion et réessaie.');
  } finally {
    clearTimeout(timer);
  }
}
