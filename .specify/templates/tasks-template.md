# Tasks: <título del spec>

**Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)

## Convenciones

- Marcá con `[x]` al terminar; no borres — sirve de historia.
- `[P]` = puede correrse en paralelo con la tarea anterior (sin dependencia).
- "Done when" debe ser observable; si decís "funciona" estás mintiendo.

## Tareas

### 1. <Título de la tarea>
- **Done when:** <criterio observable>
- **Archivos:** `src/...`
- **Notas:** (opcional)

### 2. [P] <Título>
- **Done when:** ...
- **Archivos:** ...

### 3. <Título>
- **Done when:** ...
- **Archivos:** ...

## Verificación final

Correr estos checks en orden. Si alguno falla, el spec no está done.

- [ ] Check 1 (del spec, criterio 1)
- [ ] Check 2
- [ ] Lint limpio (`pnpm lint`)
- [ ] Build limpio (`pnpm build`)
