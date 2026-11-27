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

### Lectura de tickets (OCR sin IA)

Botón **Tickets** en la barra superior:

- Haz una foto con el móvil o elige una imagen (JPG, PNG, WEBP) o un PDF.
- El texto se reconoce **en el navegador** con [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache 2.0) y el modelo de español; el motor y el modelo se sirven desde la propia app, sin CDNs ni servidores externos.
- Si el PDF ya tiene texto (factura digital) se usa directamente, sin OCR.
- Reglas para tickets españoles (`src/lib/ticket.ts`) extraen **total**, **fecha**, hora, comercio y NIF:
  - Total: busca `TOTAL`, `IMPORTE TOTAL`, `A PAGAR`, pago con tarjeta…, ignorando `SUBTOTAL`, `IVA`, `BASE`, `ENTREGADO`, `CAMBIO`. Indica la confianza (alta, media o baja).
  - Fechas: `dd/mm/aaaa`, `dd-mm-aa`, `dd.mm.aaaa`, `aaaa-mm-dd` y `3 de marzo de 2026` / `15 ENE 26`.
  - Corrige errores típicos del OCR en cifras (`O`→`0`, `l`→`1`, coma perdida en el total).
- Preprocesado para fotos reales: elimina rotulador fluorescente y bolígrafo de color, binarización adaptativa (sombras y texto transparentado), endereza el ticket y hace una segunda lectura para la letra alta y estrecha de las líneas de TOTAL.
- Si el total no se lee (tachado, borroso), se comprueba con la **suma de los artículos**; si el total leído difiere en una sola cifra de esa suma, se usa la suma.
- **Varios tickets en una foto**: marca cada ticket con un rectángulo sobre la imagen y se lee por separado.
- Todos los campos se pueden corregir antes de guardar; los importes encontrados se pueden tocar para usarlos como total.
- Los tickets se guardan solo en este navegador (IndexedDB) y se exportan a **CSV** compatible con Excel en español.

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
npm test         # pruebas del extractor de tickets
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
