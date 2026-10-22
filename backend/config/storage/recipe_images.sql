-- Configuration du service Storage existant, sans créer de table applicative.
-- Exécuter transactionnellement avec backend.cli.configure_recipe_images.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'recipes-images' AND public) THEN
    RAISE EXCEPTION 'Créer d’abord le bucket public recipes-images';
  END IF;
END $$;

UPDATE storage.buckets
SET file_size_limit = LEAST(COALESCE(file_size_limit, 5242880), 5242880),
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'recipes-images';

DROP POLICY IF EXISTS optimeal_recipe_images_insert ON storage.objects;
CREATE POLICY optimeal_recipe_images_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recipes-images'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  AND name ~ '^users/[^/]+/[a-zA-Z0-9_-]+[.]jpg$'
);

DROP POLICY IF EXISTS optimeal_recipe_images_select ON storage.objects;
CREATE POLICY optimeal_recipe_images_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'recipes-images'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS optimeal_recipe_images_delete ON storage.objects;
CREATE POLICY optimeal_recipe_images_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'recipes-images'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = (SELECT auth.uid())::text
);
-- Pas d’UPDATE : remplacer une photo crée un nouveau fichier sans écrasement.
