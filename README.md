# Blocklands

Un juego de bloques para el navegador, al estilo Minecraft pero con gráficos y contenido propios: cielo con dispersión atmosférica real, ciclo día/noche, sombras suaves, agua con reflejos y refracción, nubes volumétricas, rayos de luz y bloom. Todo está hecho con WebGL2 y JavaScript puro, sin librerías; las texturas (32×32), los mobs y los sonidos se generan por código.

## Qué incluye
- **Supervivencia**: vida, hambre y saturación, aire bajo el agua, daño por caída, lava, fuego y cactus, armaduras, muerte y reaparición (en tu cama si has dormido).
- **Crafteo**: cuadrícula 2×2 en el inventario y 3×3 en la mesa de crafteo, con libro de recetas (clic para rellenar la cuadrícula). Más de 100 recetas.
- **Herramientas** de madera, piedra, hierro, oro y diamante (pico, hacha, pala, espada, azada) con durabilidad; arco y flechas, tijeras, cubos, mechero, harina de hueso.
- **Horno** para fundir menas, cocinar comida y hacer cristal; **cofres**; **cama** para saltarte la noche.
- **Mobs**: cerdo, vaca, oveja (se puede esquilar), gallina, zombi y esqueleto (arden al sol), araña y el Fusecap, una seta andante que explota. Aparecen de noche o en la oscuridad.
- **Agricultura y naturaleza**: trigo, brotes que crecen hasta árboles, caña de azúcar, césped que se extiende; arena y grava que caen; TNT.
- **Creativo**: inventario por pestañas con buscador, vuelo, rotura instantánea, papelera.
- **Más de 110 bloques**: lava, antorchas (de suelo y pared), escaleras de mano, losas, lana de 16 colores, bloques de mineral, corales, terracotas, basalto, magma…
- **Animaciones**: mano y objeto en primera persona (golpear, equipar, comer, tensar el arco), grietas al picar, partículas, mobs que caminan, se giran y caen al morir, inclinación de cámara al recibir daño y temblor en explosiones.
- **Lugares en el mismo mundo**: cada mundo esconde ocho paisajes a unos 1,4 km del centro — *playa paradisíaca*, *volcán*, *oasis*, *montañas nevadas*, *bosque*, *cañón*, *islas*, *pradera*. Puedes ir andando o volando, o viajar al instante desde "Places" (o escribiendo el lugar en la caja de semilla). Al llegar aparece un cartel con el nombre.
- **Avión de caza**: se sube con clic derecho, sigue la dirección de la cámara, tiene tren de aterrizaje, postquemador, cañón, misiles, HUD, cámara exterior o de cabina, y paracaídas al saltar. Está en la pestaña creativa "Vehicles", en el menú y en la pantalla de inicio.
- **Multijugador online**: en claude.ai, todas las personas que abren el juego comparten un mundo (se ven, ven sus bloques, explosiones, aviones y chat). Fuera de claude.ai funciona entre pestañas del mismo navegador.
- **Pantalla de inicio y créditos** ("Creado por Pau Bru"), puertas y trampillas, resolución dinámica y generación del terreno en segundo plano (Web Workers) para que vaya más fluido.

## Jugar
- Abre `index.html` en Chrome o Edge de escritorio, o sirve la carpeta con `python -m http.server 5190` y entra en http://localhost:5190.
- `dist/blocklands.html` es la versión en un solo archivo (`node build.js` la regenera).
- El mundo se guarda en tu navegador.

## Controles
| Tecla | Acción |
| --- | --- |
| W A S D | Moverse |
| Espacio | Saltar / nadar / trepar |
| Shift | Agacharse / bajar volando |
| W W o R | Correr |
| Clic izquierdo (mantener) | Picar bloques / atacar |
| Clic derecho | Colocar, usar, comer, tensar el arco, abrir mesas, hornos y cofres |
| Clic central | Copiar bloque |
| E | Inventario y crafteo |
| Q (Ctrl+Q) | Tirar un objeto (la pila entera) |
| 1–9 o rueda | Elegir casilla |
| F o Espacio Espacio | Volar (creativo) |
| T (mantener) | Adelantar el tiempo (creativo) |
| Flechas | Mirar alrededor |
| F3 / F1 | Información de depuración / ocultar interfaz |
| Esc | Menú: lugares, avión, online, modo de juego, gráficos, sonido y mundo |
| Enter | Chat (online) |

En el avión: ratón para dirigir, W/S potencia (S con 0 % frena), Espacio postquemador, A/D alabeo, clic izquierdo cañón, clic derecho misil, V cámara, G tren de aterrizaje, Shift bajar o eyectarse.

En el inventario: clic para coger o soltar, clic derecho para dividir o dejar de uno en uno, arrastrar para repartir, Shift+clic para mover rápido, números 1–9 para intercambiar con la barra y doble clic para juntar.
