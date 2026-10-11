# Imperio Galletil Mobile

Aplicacion movil nativa desarrollada con React Native, Expo y TypeScript, conectada a Supabase para la gestion operativa, costeo y administracion financiera del emprendimiento de galletas y brownies.

## Tecnologias

* React Native 0.86 con Expo SDK 57
* TypeScript
* Supabase (PostgreSQL BaaS y Row Level Security)
* AsyncStorage para soporte offline first
* Lucide React Native y React Native SVG
* Expo Clipboard

## Caracteristicas Principales

### 1. Panel de Inicio y Conversor
* Consulta y actualizacion rapida de las tasas oficiales BCV (Dolar y Euro).
* Conversor multidireccional en tiempo real entre USD, VES y EUR.
* Acceso directo al resumen diario de produccion.

### 2. Control de Cuentas por Cobrar
* Resumen en vivo de deuda acumulada en Bolivares y Dolares.
* Vista dividida entre cuentas activas e historial cobrado.
* Borrado automatico de registros cobrados tras 30 dias para evitar acumulacion de datos.
* Opcion de vaciar historial manualmente con confirmacion.
* Edicion de clientes mediante pulsacion prolongada (500 milisegundos).

### 3. Recetario y Escandallo
* Fichas tecnicas de costeo para Galletas Clasicas y Brownies con Galleta.
* Desglose completo de costo por tanda y costo unitario por paquete.
* Rendimiento por tanda visible directamente debajo del costo total.
* Pasos de elaboracion editables con guardado en la base de datos.
* Copiado rapido del proceso al portapapeles.

### 4. Catalogo de Insumos
* Gestion de ingredientes clasificados por categoria (Galletas, Brownies, Empaques).
* Calculo acumulado automatico de insumos marcados.
* Sincronizacion bidireccional inmediata de precios entre USD y VES con la tasa BCV.
* Edicion de precios mediante pulsacion prolongada (500 milisegundos).

### 5. Reportes Financieros y Registro de Produccion
* Visualizacion de ganancia neta libre y margen de rentabilidad porcentual.
* Separacion obligatoria entre ingreso bruto cobrado y fondo intocable de reinversion.
* Registro de lotes diarios con accesos rapidos predeterminados y calculo de beneficio.

## Base de Datos (Supabase)

El esquema de base de datos se encuentra en `supabase_schema.sql` con las siguientes tablas en ingles:

* `ingredients`: catalogo de materia prima y costos.
* `debts`: cuentas por cobrar y estado de pago.
* `production_logs`: historial de tandas elaboradas y rentabilidad.
* `recipes`: recetas base, ingredientes y pasos de preparacion.

Para inicializar la base de datos, ejecuta el contenido de `supabase_schema.sql` en el SQL Editor de tu panel de Supabase.

## Instalacion y Ejecucion Local

1. Clonar el repositorio:
```bash
git clone https://github.com/Raxcs/Imperio-Galletil.git
cd Imperio-Galletil
```

2. Instalar dependencias:
```bash
npm install
```

3. Iniciar el servidor de desarrollo de Expo:
```bash
npx expo start
```

4. Escanear el codigo QR con la aplicacion Expo Go en tu dispositivo movil Android o iOS.
