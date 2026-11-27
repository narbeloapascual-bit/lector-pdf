# Lector PDF

Lector de PDF web, rápido y privado. Los archivos se abren en tu dispositivo y **nunca se suben a ningún servidor**.

Hecho con React, TypeScript y [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla, licencia Apache 2.0).

## Funciones

- Abrir PDF arrastrándolo a la ventana o eligiendo el archivo (Ctrl+O).
- Navegación por páginas, número de página editable y miniaturas.
- Zoom: botones, menú (automático, ancho de página, página completa, 50–300 %), Ctrl + rueda y pellizco en móvil.
- Búsqueda de texto con resaltado y contador de resultados (Ctrl+F, Intro / Mayús+Intro).
- Índice del documento (marcadores del PDF) navegable.
- Modo oscuro (interfaz y páginas), recordado entre visitas.
- Pantalla completa.
- Recuerda la última página y el zoom de cada documento, y reabre el último PDF al recargar.
- Diseño responsive: en móvil el panel lateral es un cajón y la navegación va en una barra inferior.

### Atajos de teclado

| Tecla | Acción |
| --- | --- |
| ← / → , RePág / AvPág | Página anterior / siguiente |
| Inicio / Fin | Primera / última página |
| Ctrl + / Ctrl − / Ctrl 0 | Ampliar / reducir / zoom automático |
| Ctrl F | Buscar |
| Ctrl O | Abrir archivo |
| Esc | Cerrar búsqueda |

## Instalación

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # compilación de producción en dist/
npm run preview  # sirve la compilación
```

## Despliegue

Cada push a `main` publica la app en GitHub Pages mediante `.github/workflows/deploy.yml`.
La primera vez hay que activar Pages en **Settings → Pages → Source: GitHub Actions**.

## Privacidad

- El PDF se procesa en el navegador con PDF.js.
- El último PDF abierto se guarda en IndexedDB de tu navegador para reabrirlo al recargar; se borra al pulsar "Cerrar documento".
- La página y el zoom por documento se guardan en `localStorage`.

## Licencia

MIT
