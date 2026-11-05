# Icône OptiMeal

`icon.png` est une copie du visuel retenu par l’équipe, fourni dans
`data/recipes/images/optimeal.png`. Le PNG carré sans transparence est
utilisé par `mobile/app.json` pour iOS, Android et le favicon web. Expo génère
les tailles natives lors du prebuild. Les anciens fichiers d’icônes Android,
le favicon et le splash du modèle Expo ne sont plus référencés par la
configuration actuelle.

Les icônes des cinq onglets sont les pictogrammes Ionicons fournis par
`@expo/vector-icons`, configurés dans `mobile/App.tsx`. Elles sont intégrées
au bundle avec leur police, sans hébergement distant. L’onglet sélectionné
utilise la variante pleine en vert et les autres la variante de contour.

`figma/` contient les SVG book, search, leaf et back exportés de la
[maquette](https://www.figma.com/design/GZnafkmCJzWu1gyl6ZamgP?node-id=12-14),
utilisés dans les parcours Recettes. La police DM Sans (400, 500 et 700) vient
de `@expo-google-fonts/dm-sans` et est chargée avec `expo-font`. Ces ressources
sont locales ; les photos de recettes restent servies par Storage.

`icons/egg-pan.svg` est une icône locale créée pour le filtre Faciles : un œuf
dans une poêle. Elle est aussi utilisée pour le critère Facilité des
évaluations. `expo-image` la teinte en vert ou en blanc selon la sélection.
Les autres filtres de Recettes utilisent MaterialCommunityIcons : grille,
chronomètre et tirelire, avec leurs libellés sous les cercles.

`icons/taste-excellent.svg` représente une fourchette et un couteau parallèles,
à l’horizontale, pointant vers la droite. Cette icône locale illustre le critère
Goût dans le détail des évaluations ; `expo-image` la teinte en vert.
