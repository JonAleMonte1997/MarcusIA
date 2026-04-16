# Marcus — cómo trabajar en este repo

Este proyecto sigue **Spec-Driven Development (SDD)**. No se escribe código sin un spec aprobado. No se escribe un spec sin un objetivo claro de usuario. Esto aplica tanto a Jonathan como a cualquier agente (Claude, etc.) que contribuya.

## Flujo por feature

1. **Spec** (`specs/NNN-slug/spec.md`) — *qué* y *por qué*. Escrito en lenguaje de negocio/producto, sin menciones de stack ni archivos. Cualquiera debería poder leerlo y entender el valor sin saber TypeScript.
2. **Plan** (`specs/NNN-slug/plan.md`) — *cómo* a alto nivel. Decisiones técnicas, módulos afectados, cambios de data model, dependencias nuevas, riesgos. Un spec puede tener varios planes alternativos antes de elegir uno.
3. **Tasks** (`specs/NNN-slug/tasks.md`) — lista ejecutable, ordenada por dependencia. Cada tarea tiene criterio de done explícito. Las tareas que pueden correr en paralelo se marcan con `[P]`.
4. **Ejecución** — se implementa siguiendo `tasks.md`. Si al codear aparece algo que el plan no previó, se actualiza `plan.md` *antes* de seguir, no después.
5. **Verificación** — cada spec tiene "Criterios de aceptación" testeables. No se cierra sin correrlos.

## Reglas no negociables

Viven en [`.specify/memory/constitution.md`](.specify/memory/constitution.md). Releer antes de cada spec nuevo.

## Estructura

```
.specify/
  memory/constitution.md       # principios que nunca se rompen
  templates/                   # plantillas spec/plan/tasks
specs/
  ROADMAP.md                   # lista de specs futuros (orden + estado)
  001-bootstrap-baileys-eco/
    spec.md
    plan.md
    tasks.md
src/                           # (vacío hasta ejecutar el primer spec)
```

## Cómo arrancar un spec nuevo

```bash
N=$(printf "%03d" $(( $(ls specs | grep -E '^[0-9]{3}' | wc -l) + 1 )))
mkdir -p specs/$N-<slug>
cp .specify/templates/spec-template.md specs/$N-<slug>/spec.md
```

Completás el spec, lo revisás, y recién ahí copiás `plan-template.md` → `plan.md`.
