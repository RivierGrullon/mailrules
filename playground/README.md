# mailrules playground

The public demo lives at https://riviergrullon.github.io/mailrules/.
It demonstrates the built library, Zod adapter and React Hook Form integration.

From the repository root:

```sh
npm ci
npm run build
npm ci --prefix playground
npm run dev --prefix playground
```

Open the local URL printed by Vite with the `/mailrules/` path. For checks:

```sh
npm run build --prefix playground
npx --prefix playground playwright install chromium
npm test --prefix playground
```

The local `mailrules` dependency links to the parent package and resolves its
built `dist` exports. It does not import internal TypeScript source. Build the
root first after API changes. The root package checks separately install and
verify the actual npm tarball.

`private: true` prevents publishing this app. The root package's explicit `files`
allowlist excludes this entire directory. React, form libraries, fonts, Vite and
browser testing dependencies belong here and are not installed by `npm install
mailrules`. The optional Zod adapter requires consumers to install Zod themselves.

Validation runs in the browser with no backend, analytics or persisted email
inputs. GitHub Pages receives ordinary page/asset requests; email checks do not
make requests. The Pages workflow builds and tests before deployment.
