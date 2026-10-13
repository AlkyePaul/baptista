# IMG.LY Background Removal — License

## Package

`@imgly/background-removal` — browser-side background removal using a WASM/WebGPU model.

## License

The package is released under **AGPL-3.0**. This means:

- If the application is **distributed** (deployed as a public SaaS, for example), the **entire
  source code** of the application must be made available under the same license or a compatible one.
- Internal / personal use without distribution does **not** trigger the copyleft obligation.

## Current usage

Baptista uses this package as a **development proof-of-concept** for personal / internal household
use only. The feature is gated behind the environment variable:

```
NEXT_PUBLIC_BG_REMOVAL_ENABLED=true   # default in development
```

## Commercial deployment

Before any public or commercial deployment:

1. **Option A** — Purchase an IMG.LY commercial license that covers the background removal SDK.
2. **Option B** — Replace the package with an alternative (e.g. server-side model, different
   library with a permissive license).
3. **Option C** — Release the full Baptista source under AGPL-3.0 (or a compatible license).

Until one of these steps is taken, the feature must remain disabled in production builds
(`NEXT_PUBLIC_BG_REMOVAL_ENABLED=false`).
