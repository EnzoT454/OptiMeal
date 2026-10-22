"""Politiques Storage : tester les deux comptes sur des tables locales jetables."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from backend.cli.configure_recipe_images import SQL_PATH
from backend.tests.test_ingredient_import import postgres  # noqa: F401

ALICE = '11111111-1111-4111-8111-111111111111'
BOB = '22222222-2222-4222-8222-222222222222'


def test_storage_policies_isolate_writes_and_preserve_seed_images(postgres):
    c = postgres
    c.exec_driver_sql("""
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]
      );
      CREATE TABLE storage.objects (bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      INSERT INTO storage.buckets(id, public) VALUES ('recipes-images', true);
      INSERT INTO storage.objects VALUES ('recipes-images', 'recette1.png');
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA storage, auth TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    """)
    c.exec_driver_sql(SQL_PATH.read_text())
    c.exec_driver_sql(SQL_PATH.read_text())  # Configuration rejouable.
    assert c.scalar(text("SELECT file_size_limit FROM storage.buckets")) == 5242880

    def login(user):
        c.exec_driver_sql('RESET ROLE')
        c.execute(text("SELECT set_config('request.jwt.claim.sub', :uid, true)"), {'uid': user})
        c.exec_driver_sql('SET LOCAL ROLE authenticated')

    def insert(path):
        c.execute(text("INSERT INTO storage.objects VALUES ('recipes-images', :path)"), {'path': path})

    login(ALICE)
    path = f'users/{ALICE}/photo.jpg'
    insert(path)
    assert c.scalar(text('SELECT count(*) FROM storage.objects')) == 1
    for forbidden in ('recette1.png', f'users/{BOB}/photo.jpg', f'users/{ALICE}/photo.html',
                      f'users/{ALICE}/nested/photo.jpg'):
        with pytest.raises(DBAPIError), c.begin_nested():
            insert(forbidden)
    login(BOB)
    assert c.scalar(text('SELECT count(*) FROM storage.objects')) == 0
    assert c.execute(text('DELETE FROM storage.objects')).rowcount == 0
    assert c.execute(text("UPDATE storage.objects SET name='changed.jpg'")).rowcount == 0
    login(ALICE)
    assert c.execute(text('DELETE FROM storage.objects')).rowcount == 1
    c.exec_driver_sql('RESET ROLE')
    assert c.scalar(text('SELECT name FROM storage.objects')) == 'recette1.png'
