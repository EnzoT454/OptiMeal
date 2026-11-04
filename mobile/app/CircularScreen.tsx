import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, DimensionValue, Image, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipeTitle, recipeColors, recipeStyles } from '../components/recipes';
import { longDate, storeName, todayText } from '../components/promos';
import { PromoStackParams } from '../types/navigation';

// La vraie circulaire d'un magasin, lue comme un PDF :
// toutes les pages les unes sous les autres, défilement continu avec élan,
// pincer (ou toucher deux fois) pour zoomer là où sont les doigts,
// barre de droite pour sauter directement à une page.

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const GAP = 8; // espace entre deux pages
// Chaque page existe aussi en STRIPS bandes horizontales (p01-1.jpg … p01-4.jpg), créées par l'import.
// Android réduit toute image de plus de 2048 px de côté : une page entière devient floue au zoom,
// alors que chaque bande (environ 2048 × 1150 px) est affichée en pleine définition.
const STRIPS = 4; // même valeur que STRIPS dans backend/app/catalog/circulars.py
const stripUri = (uri: string, k: number) => uri.replace(/\.jpg$/, `-${k}.jpg`);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function CircularScreen({ navigation, route }: NativeStackScreenProps<PromoStackParams, 'Circular'>) {
  const { circular } = route.params;
  const pages = circular.pages;
  const store = storeName(circular.retailer);
  const expired = circular.valid_to < todayText();

  const [box, setBox] = useState<{ width: number; height: number } | null>(null); // zone d'affichage
  const [ratios, setRatios] = useState<number[]>(() => pages.map(() => 0.5));      // largeur / hauteur de chaque page
  const [noStrips, setNoStrips] = useState(false); // ancienne circulaire importée sans bandes : pages entières
  const [page, setPage] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  // Taille réelle de chaque page (lue une fois).
  useEffect(() => {
    let active = true;
    pages.forEach((uri, i) => Image.getSize(uri, (w, h) => {
      if (active) setRatios(r => r.map((old, j) => (j === i ? w / h : old)));
    }, () => {}));
    return () => { active = false; };
  }, [pages]);

  // Position de chaque page dans le document (sans zoom) : toutes à pleine largeur.
  const layout = useMemo(() => {
    const width = box?.width ?? 0;
    let top = 0;
    const items = ratios.map(r => { const height = width / r; const item = { top, height }; top += height + GAP; return item; });
    return { width, items, height: Math.max(0, top - GAP) };
  }, [box?.width, ratios]);

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  // État du geste, gardé hors du rendu pour rester fluide.
  const v = useRef({
    s: 1, x: 0, y: 0, startS: 1, W: 0, H: 0, boxH: 0, pinching: false, pinched: false,
    items: [] as { top: number; height: number }[], page: 0,
  }).current;
  const momentum = useRef<number | null>(null);
  const stopMomentum = () => { if (momentum.current != null) cancelAnimationFrame(momentum.current); momentum.current = null; };

  // Applique zoom + position, sans jamais dépasser les bords du document.
  // (Le document est zoomé autour de son centre : d'où les « H / 2 ».)
  const apply = useCallback((s: number, x: number, y: number) => {
    const { W, H, boxH } = v;
    const maxX = ((s - 1) * W) / 2;
    v.s = s;
    v.x = clamp(x, -maxX, maxX);
    if (s * H <= boxH) v.y = (boxH - H) / 2;
    else v.y = clamp(y, boxH - H / 2 - (s * H) / 2, ((s - 1) * H) / 2);
    scale.setValue(v.s); translateX.setValue(v.x); translateY.setValue(v.y);

    // Page affichée = celle qui est au milieu de l'écran.
    const middle = (boxH / 2 - (H / 2 + v.y)) / v.s + H / 2;
    let current = 0;
    v.items.forEach((item, i) => { if (item.top <= middle) current = i; });
    if (current !== v.page) { v.page = current; setPage(current); }
  }, [v, scale, translateX, translateY]);

  // Quand la taille de l'écran ou des pages est connue : position mise à jour (au début : en haut).
  useEffect(() => {
    if (!box) return;
    v.W = layout.width; v.H = layout.height; v.boxH = box.height; v.items = layout.items;
    apply(v.s, v.x, v.y);
  }, [box, layout, apply, v]);

  // Élan : après un glissement rapide, le document continue puis ralentit, comme un vrai défilement.
  const fling = useCallback((vx: number, vy: number) => {
    stopMomentum();
    let speedX = vx / 1000; let speedY = vy / 1000; // pixels par milliseconde
    let last = Date.now();
    const step = () => {
      const now = Date.now(); const dt = now - last; last = now;
      const wantedY = v.y + speedY * dt;
      apply(v.s, v.x + speedX * dt, wantedY);
      if (v.y !== wantedY) speedY = 0; // arrivé au bord
      const friction = Math.pow(0.996, dt);
      speedX *= friction; speedY *= friction;
      if (Math.abs(speedX) < 0.02 && Math.abs(speedY) < 0.02) { momentum.current = null; return; }
      momentum.current = requestAnimationFrame(step);
    };
    momentum.current = requestAnimationFrame(step);
  }, [apply, v]);

  // Zoom autour d'un point de l'écran (là où sont les doigts) : ce point reste sous les doigts.
  const zoomAt = useCallback((s2: number, px: number, py: number) => {
    const cx = (px - (v.W / 2 + v.x)) / v.s;
    const cy = (py - (v.H / 2 + v.y)) / v.s;
    apply(s2, px - v.W / 2 - cx * s2, py - v.H / 2 - cy * s2);
  }, [apply, v]);

  const gesture = useMemo(() => {
    // runOnJS(true) : les gestes appellent directement notre code (pas besoin de Reanimated).
    // Pendant un pincement, c'est lui seul qui bouge la page : le déplacement à un doigt est mis en pause,
    // sinon les deux gestes se contredisent et la page tremble.
    const pinch = Gesture.Pinch().runOnJS(true)
      .onStart(() => { stopMomentum(); v.startS = v.s; v.pinching = true; v.pinched = true; })
      .onUpdate(e => zoomAt(clamp(v.startS * e.scale, 1, MAX_SCALE), e.focalX, e.focalY))
      .onFinalize(() => { v.pinching = false; });

    // Le doigt doit bouger d'au moins 10 px : un simple toucher reste un toucher.
    // onChange donne le petit déplacement depuis le dernier mouvement : pas de saut quand un doigt se lève.
    const pan = Gesture.Pan().runOnJS(true).averageTouches(true)
      .activeOffsetX([-10, 10]).activeOffsetY([-10, 10])
      .onStart(() => { stopMomentum(); v.pinched = v.pinching; })
      .onChange(e => { if (!v.pinching) apply(v.s, v.x + e.changeX, v.y + e.changeY); })
      .onEnd(e => { if (!v.pinched) fling(e.velocityX, e.velocityY); }); // pas d'élan après un zoom

    const doubleTap = Gesture.Tap().runOnJS(true).numberOfTaps(2)
      .onEnd(e => zoomAt(v.s > 1.05 ? 1 : DOUBLE_TAP_SCALE, e.x, e.y));

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [apply, fling, zoomAt, v]);

  // Barre de droite : toucher ou glisser pour aller directement au début d'une page.
  const trackHeight = useRef(0);
  const jumpTo = useCallback((y: number) => {
    if (!trackHeight.current || !v.items.length) return;
    stopMomentum();
    const index = Math.floor(clamp(y / trackHeight.current, 0, 0.9999) * v.items.length);
    // Position qui met le haut de cette page en haut de l'écran.
    apply(v.s, v.x, -v.items[index].top * v.s - v.H / 2 + (v.s * v.H) / 2);
  }, [apply, v]);
  const scrub = useMemo(() => Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin(e => { setScrubbing(true); jumpTo(e.y); })
    .onUpdate(e => jumpTo(e.y))
    .onFinalize(() => setScrubbing(false)), [jumpTo]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ width, height });
  };

  useEffect(() => stopMomentum, []); // on arrête l'élan en quittant l'écran

  // GestureHandlerRootView : nécessaire pour que les gestes à deux doigts soient reconnus.
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <RecipeTitle onBack={() => navigation.goBack()}>Circulaire {store}</RecipeTitle>
        <Text style={recipeStyles.body}>Du {longDate(circular.valid_from)} au {longDate(circular.valid_to)}</Text>
        {expired && <Text style={styles.expired}>Circulaire terminée : les prix ne sont peut-être plus valables.</Text>}
      </View>

      <View style={{ flex: 1 }}>
        <GestureDetector gesture={gesture}>
          <View style={styles.stage} onLayout={onLayout} collapsable={false}>
            {box && <Animated.View style={{ width: layout.width, height: layout.height,
              transform: [{ translateX }, { translateY }, { scale }] }}>
              {pages.map((uri, i) => {
                const style = { position: 'absolute' as const, left: 0, top: layout.items[i].top, width: layout.width, height: layout.items[i].height };
                // Seules la page affichée et ses voisines sont chargées (les autres : rectangles blancs) :
                // toutes les garder en mémoire ferait planter le téléphone.
                if (Math.abs(i - page) > 1) return <View key={uri} style={[style, styles.placeholder]} />;
                const whole = <Image source={{ uri }} resizeMode="contain" style={StyleSheet.absoluteFill}
                  accessibilityLabel={`Page ${i + 1} de la circulaire`} />;
                if (i !== page || noStrips) return <View key={uri} style={[style, styles.placeholder]}>{whole}</View>;
                // Page affichée : ses bandes en pleine définition, collées les unes sous les autres,
                // par-dessus la page entière (visible le temps que les bandes se chargent).
                return <View key={uri} style={[style, styles.placeholder]}>
                  {whole}
                  {Array.from({ length: STRIPS }, (_, k) => <Image key={k} source={{ uri: stripUri(uri, k + 1) }}
                    resizeMode="stretch" resizeMethod="scale" onError={() => setNoStrips(true)}
                    style={{ position: 'absolute', left: 0, right: 0,
                      top: (layout.items[i].height * k) / STRIPS, height: layout.items[i].height / STRIPS }} />)}
                </View>;
              })}
            </Animated.View>}
          </View>
        </GestureDetector>

        {/* Barre de progression sur le côté : montre où on est, et permet de sauter à une page. */}
        <GestureDetector gesture={scrub}>
          <View style={styles.trackArea} collapsable={false}
            accessibilityLabel={`Page ${page + 1} sur ${pages.length}. Glisser pour changer de page.`}
            onLayout={e => { trackHeight.current = e.nativeEvent.layout.height; }}>
            <View style={[styles.track, scrubbing && styles.trackActive]}>
              <View style={[styles.thumb, {
                top: `${(page / pages.length) * 100}%` as DimensionValue,
                height: `${100 / pages.length}%` as DimensionValue,
              }]} />
            </View>
          </View>
        </GestureDetector>

        <View style={[styles.counter, scrubbing && styles.counterBig]} pointerEvents="none">
          <Text style={[styles.counterText, scrubbing && styles.counterTextBig]}>{page + 1} / {pages.length}</Text>
        </View>
      </View>
    </SafeAreaView>
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: recipeColors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, gap: 4 },
  expired: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 19, color: '#a5442b' },
  stage: { flex: 1, overflow: 'hidden', backgroundColor: recipeColors.border },
  placeholder: { backgroundColor: 'white' },
  // Zone tactile large (36 px) autour d'une barre fine, pour la toucher facilement avec le pouce.
  trackArea: { position: 'absolute', right: 0, top: 12, bottom: 12, width: 36, alignItems: 'flex-end', paddingRight: 4 },
  track: { flex: 1, width: 6, borderRadius: 3, backgroundColor: 'rgba(25,45,35,0.15)' },
  trackActive: { width: 10, borderRadius: 5 },
  thumb: { position: 'absolute', left: 0, right: 0, minHeight: 14, borderRadius: 3, backgroundColor: recipeColors.green },
  // Petit numéro de page posé sur la circulaire, en bas.
  counter: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(25,45,35,0.8)',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  counterText: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18, color: 'white' },
  // Pendant qu'on glisse sur la barre : numéro de page en grand au milieu.
  counterBig: { bottom: undefined, top: '45%', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18 },
  counterTextBig: { fontSize: 22, lineHeight: 28 },
});