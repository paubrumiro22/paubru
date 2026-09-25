# Blocklands — notas para Claude

Juego voxel estilo Minecraft, **original** (texturas generadas por código, sin assets ni marca de Minecraft), en WebGL2 puro. Sin dependencias ni paso de compilación para desarrollar.

## Cómo está hecho
- `index.html` carga scripts clásicos (no módulos) que comparten ámbito global: **el orden de los `<script>` importa** y no puede haber dos declaraciones top-level con el mismo nombre entre archivos.
- `js/math.js` matrices · `js/noise.js` simplex + ruido tileable · `js/blocks.js` bloques y capas de textura · `js/textures.js` texturas pixel-art procedurales, normal maps, mips e iconos · `js/world.js` chunks 16×16×128 y generación (biomas, cuevas, menas, árboles) · `js/mesher.js` luz por flood-fill (cielo + bloques), AO y mallas · `js/atmosphere.js` dispersión atmosférica en CPU (color del sol, luz ambiente) · `js/shaders_scene.js` / `js/shaders_post.js` GLSL · `js/renderer_gl.js` recursos GL · `js/renderer_frame.js` pasadas por frame · `js/player.js` física y raycast · `js/main.js` bucle, streaming de chunks, input, UI, guardado.
- Pipeline por frame: LUT del cielo → shadow map → opacos + recortes + cielo (HDR RGBA16F) → copia color/profundidad → agua (SSR, refracción, absorción) → god rays → bloom → tonemap ACES → FXAA.

## Ejecutar y publicar
- Local: `python -m http.server 5190` en esta carpeta, o abrir `index.html`.
- `node build.js` genera `dist/blocklands.html`: un solo archivo sin `<html>/<head>/<body>` (el host de artifacts de claude.ai añade el esqueleto). Allí `confirm()`/`alert()` no funcionan y el pointer lock puede fallar: por eso existe el modo "free cursor" (arrastrar para mirar).
- Regenerar `dist/` después de cualquier cambio en `index.html` o `js/`.

## Rendimiento (medido en una GPU AMD integrada, 1280×720)
- Sombras "high" (mapa 4096²) ≈ 20 ms/frame; nubes volumétricas ≈ 8 ms. Por eso el valor por defecto es sombras "medium" y distancia 8 chunks (~16 ms/frame).
- Generar un chunk ≈ 4,5 ms y mallarlo ≈ 9 ms, en el hilo principal con presupuesto de ~7 ms por frame.
- Para medir en un panel de navegador oculto (rAF limitado a 1 fps) usar renders síncronos + `gl.readPixels`, no `requestAnimationFrame`.

## Decisiones de iluminación a conservar
- Las texturas pixel-art son muy saturadas: exposición de día 0.6, sol ×2.2, ambiente del cielo ×0.3. Subirlos vuelve a quemar el mediodía.
- Las consultas al LUT del cielo limitan la elevación a ≥ 0.035 rad: a elevación 0 el rayo rasante sale marrón oscuro. El cielo bajo el horizonte se mezcla con el color de niebla para que el borde del terreno no se vea.
- Los chunks se generan hasta R+2 porque los que se mallan (hasta R+0.5) necesitan sus vecinos diagonales.

## Límites conocidos / ideas
- Solo modo creativo (sin mobs, crafteo ni vida); agua estática; sin controles táctiles.
- Posibles mejoras: generación y mallado en Web Workers, agua que fluye, sonido, antorchas, multijugador.
