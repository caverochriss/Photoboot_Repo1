# Conectar el álbum compartido a Supabase

La app tiene cuentas por correo y contraseña, álbumes privados con código de invitación, fotos en Storage privado, sincronización en tiempo real y una vista de cámara entre dos navegadores. La sesión se conserva en el navegador; cada persona debe crear su propia cuenta.

## Configuración inicial

1. Crea un proyecto Supabase y espera a que la base de datos esté disponible.
2. En **SQL Editor**, ejecuta el contenido completo de [`supabase/setup.sql`](supabase/setup.sql). Crea las tablas, el bucket privado, la señalización privada de la cámara y las políticas RLS. Si ya ejecutaste una versión anterior, vuelve a ejecutarlo: las sentencias son seguras para actualizar la instalación.
3. En **Project Settings → API**, copia la **Project URL** y la **publishable key** (o la `anon` key heredada). Sustituye los dos valores de ejemplo en [`src/supabase-config.js`](src/supabase-config.js). No uses nunca la `service_role` ni una secret key en el navegador.
4. En **Authentication → URL Configuration**, añade la URL exacta desde la que abres la app a las Redirect URLs. Para la captura mostrada sería `http://127.0.0.1:5500`; si usas otro puerto, añádelo también. Configura también el envío de correo si mantienes la confirmación de dirección activada.
5. Abre PhotoBooth, crea una cuenta en **Entrar → Crear cuenta**. Una persona crea un álbum y comparte su código; la otra inicia sesión y lo introduce.

El proyecto existente es una página estática, así que el cliente `supabase-js` se carga desde `esm.sh` solo cuando se han rellenado las credenciales. Para el modo local no hace falta instalar dependencias. La primera conexión al backend necesita acceso a Internet.

Las capturas del álbum se suben como JPEG al bucket privado `photobooth`. La base de datos guarda quién hizo cada foto y su filtro. Nadie puede consultar un álbum, sus fotos, sus archivos ni la señalización de la cámara sin ser miembro del álbum. Los miembros pueden ver y descargar sus fotos compartidas; solo quien subió una foto puede eliminarla. Sin iniciar sesión y seleccionar un álbum, las capturas siguen siendo locales a esa pestaña.

## Probar dos Mac y las dos cámaras

`127.0.0.1` y `localhost` solo sirven para el propio ordenador. Para ver ambas cámaras desde dos Mac, publica la página en una URL HTTPS (o usa una URL HTTPS de desarrollo) y añade esa misma URL a Supabase. Después:

1. Abran la misma URL HTTPS en cada Mac e inicien sesión con cuentas distintas.
2. Una persona crea el álbum y comparte el código; la otra se une con ese código.
3. En ambos equipos, elijan a la otra persona en **Vista compartida**. Una persona pulsa **Solicitar vista** y la otra pulsa **Aceptar**.
4. Cada navegador pide permiso solo para su propia cámara. El vídeo va de navegador a navegador mediante WebRTC; Supabase no recibe ni almacena el vídeo en directo.

La vista puede requerir que ambos equipos se encuentren en una red compatible con WebRTC. Si la red bloquea conexiones entre pares, las fotos compartidas seguirán sincronizándose, pero la vista en directo no podrá conectarse hasta disponer de infraestructura TURN propia.
