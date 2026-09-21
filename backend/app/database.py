"""Point unique pour configurer SQLAlchemy et les sessions PostgreSQL.

La connexion sera ajoutée avec le module accounts. Garder ce point d'entrée
évite que chaque domaine crée sa propre connexion à la base.
"""
