# Blocklands — notas para Claude

Juego voxel estilo Minecraft, **original** (texturas, pieles de mobs y sonidos generados por código, sin assets ni marca de Minecraft; el mob explosivo es el "Fusecap", una seta, no un creeper), en WebGL2 puro. Sin dependencias ni paso de compilación para desarrollar. El usuario habla español; la interfaz del juego está en inglés.

## Cómo está hecho
- `index.html` carga scripts clásicos (no módulos) que comparten ámbito global: **el orden de los `<script>` importa** y no puede haber dos declaraciones top-level con el mismo nombre entre archivos. Comprobación rápida: concatenar los scripts en orden y pasar `node --check`.
- Datos: `blocks.js` (ids de bloque, render types, dureza/herramienta/sonido/soporte, capas de textura por nombre con `defTex`) · `items.js` (ítems ≥ 256, herramientas, armaduras, comida, combustible, fundición, drops, recetas, pestañas creativas).
- Gráficos: `textures.js` (texturas 32×32 de bloques, sprites de ítems con un mini rasterizador, máscaras de emisión, normal maps, mips, iconos UI) · `models.js` (modelos de cajas de mobs, pieles pintadas en un atlas 512×256, mallas extruidas de sprites) · `mesher.js` · `shaders_*.js` · `renderer_gl.js` · `renderer_frame.js` · `entity_render.js` (stream de vértices por frame: mobs, ítems, flechas, partículas, grietas y mano en primera persona; poses en `HAND_POSE`).
- Mundo: `world.js` (chunks 16×16×128, generación con "column specs" compartidos por el mundo normal y los presets, `buildTree` con roble/abedul/abeto/palmera/gigante/seco, mapa de orientación `facing` y block entities para cofres y hornos) · `presets.js` (los ocho lugares temáticos; en un mundo "default" se colocan en un anillo de 1400 bloques con `placeRegions`, cada uno en coordenadas locales y mezclado con el terreno normal entre `REGION_IN` y `REGION_OUT`; `travelTo(key)` en game.js teletransporta). Los mundos de tipo preset de guardados antiguos siguen funcionando.
- Hilos: `workers.js` crea Web Workers desde el texto de los `<script data-w>` (math, noise, blocks, world, presets, mesher) y genera/mallar chunks fuera del hilo principal; si no se pueden crear (file://, CSP) todo vuelve al camino síncrono. Cualquier dependencia nueva de esos archivos debe vivir en archivos marcados `data-w` (por eso `mixc` está en math.js).
- Vehículos: `vehicles.js` (caza: modelo de cajas con muestras de color del atlas `JET_SWATCH_RECT`, vuelo arcade que persigue la dirección de la cámara, tren, choques, cañón, misiles, cámaras, HUD en `#flightHud`). Partes con `ov >= 2` en el shader de entidades son autoiluminadas.
- Clima y eventos: `weather.js` (lluvia, tormenta con rayos/truenos, nieve donde hace frío; eventos de lluvia de meteoritos en noches despejadas y erupciones del volcán). El renderer recibe `weather` (0..1, oscurece luz y cielo, más niebla, desatura) y `flash` (relámpago). Mientras se vuela el caza, `renderer.rangeBoost` amplía la distancia de visión para que no desaparezcan estructuras lejanas.
- Online: `net.js` usa la capacidad `room` del artifact (presencia + eventos) o un `BroadcastChannel` entre pestañas. Cada jugador publica en su presencia posición, avión y las últimas "ops" numeradas (ediciones de bloques, explosiones con semilla para que el cráter sea igual, misiles, chat); el jugador más antiguo manda el historial completo por el tema `sync` a quien llega. Al publicar hay que declarar `capabilities: {room: {topics: {sync: 'interact', need: 'interact'}}}`.
- Juego: `player.js` (física de cajas compartida con los mobs, escalones de 0,6, escaleras de mano, raycast contra formas) · `entities.js` (mobs con IA, ítems caídos, flechas, TNT, bloques que caen, partículas, spawn) · `inventory.js` · `survival.js` (vida, hambre, aire, fuego, muerte) · `audio.js` (sonidos sintetizados con WebAudio) · `game.js` (estado `G`, streaming de chunks, ediciones con soporte/caídas/drops, ticks aleatorios, hornos, explosiones, dormir, guardado v2) · `interact.js` (picar, atacar, colocar orientado, comer, arco, cubos) · `ui.js` (HUD y pantallas de contenedores) · `main.js` (menú, input, bucle).
- Vértice de chunk: 20 bytes (posición en 1/64 de bloque para las antorchas inclinadas, UV reales en 1/16 para losas y formas). La luz calculada por el mesher se guarda en `chunk.light` (cielo<<4 | bloque) para iluminar entidades y decidir el spawn de monstruos.
- Pipeline por frame: LUT del cielo → shadow map (terreno + entidades) → opacos + recortes + entidades + grietas + cielo (HDR RGBA16F) → copia color/profundidad → agua (SSR, refracción, absorción) → humo translúcido → contorno de selección → mano (depthRange 0–0,02) → god rays → bloom → tonemap ACES → FXAA.

## Ejecutar y publicar
- Local: `python -m http.server 5190` en esta carpeta, o abrir `index.html`.
- `node build.js` genera `dist/blocklands.html`: un solo archivo sin `<html>/<head>/<body>` (el host de artifacts de claude.ai añade el esqueleto) y **solo ASCII** (escapa acentos y emojis), porque el host puede no declarar charset. Allí `confirm()`/`alert()` no funcionan y el pointer lock puede fallar: por eso existe el modo "free cursor" (arrastrar para mirar, mantener quieto para picar).
- Regenerar `dist/` después de cualquier cambio en `index.html` o `js/`.
- Pruebas: Playwright global con Chromium (`--use-angle=swiftshader`). Es lento (varios segundos por frame a 1280×720): bajar nubes/SSR/sombras y la distancia de render para capturas.

## Rendimiento (medido en una GPU AMD integrada, 1280×720, antes de la supervivencia)
- Sombras "high" (mapa 4096²) ≈ 20 ms/frame; nubes volumétricas ≈ 8 ms. Por eso el valor por defecto es sombras "medium" y distancia 8 chunks (~16 ms/frame).
- Generar un chunk ≈ 4,5 ms y mallarlo ≈ 9 ms, en el hilo principal con presupuesto de ~7 ms por frame. El pase de entidades es una sola llamada de dibujo con un buffer dinámico.
- Para medir en un panel de navegador oculto (rAF limitado a 1 fps) usar renders síncronos + `gl.readPixels`, no `requestAnimationFrame`.

## Decisiones de iluminación a conservar
- Las texturas pixel-art son muy saturadas: exposición de día 0.6, sol ×2.2, ambiente del cielo ×0.3. Subirlos vuelve a quemar el mediodía.
- La emisión es por píxel (`uEmitMap`, textura R8 paralela): solo la llama de la antorcha, la boca del horno, la cara de la calabaza o los cristales de piedra luminosa brillan.
- Las consultas al LUT del cielo limitan la elevación a ≥ 0.035 rad: a elevación 0 el rayo rasante sale marrón oscuro. El cielo bajo el horizonte se mezcla con el color de niebla para que el borde del terreno no se vea.
- Los chunks se generan hasta R+2 porque los que se mallan (hasta R+0.5) necesitan sus vecinos diagonales.
- El array de texturas tiene ~210 capas; WebGL2 garantiza 256 como mínimo, así que no crecer mucho más sin partirlo.

## Límites conocidos / ideas
- Agua y lava estáticas (un hueco junto al agua se rellena, pero no fluye); sin fuego que se propague; sin controles táctiles; los mobs no se guardan.
- Online: los mobs, el crecimiento de cultivos y los hornos son locales de cada jugador; no hay daño entre jugadores. Quien solo tiene permiso de lectura en el artifact ve y se mueve, pero no puede enviar el historial (`sync`).
- Las capas de efectos (`crack`, `p_smoke`, `p_flame`...) se registran con `defTex` en blocks.js; si una textura se genera con `gen()` pero no se registra, no existe en el array.
- Posibles mejoras: líquidos que fluyen, escaleras (bloque), encantamientos, controles táctiles, daño entre jugadores.
