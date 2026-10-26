# Releasing mailrules

## Initial setup

1. Create the GitHub repository under the intended owner and push the source.
2. Add the real `repository`, `homepage` and `bugs` metadata to `package.json`; do
   not use a placeholder owner. Run `npm install --package-lock-only` and commit.
3. Confirm ownership/availability of the npm package name. A successful local dry
   run does not reserve the name or verify npm authorization.
4. Run `npm ci` and `npm run check`. Review the changelog and tarball contents:

   ```sh
   npm pack --dry-run
   npm publish --dry-run
   ```

5. For the first publication, authenticate with the intended npm account, verify
   it using `npm whoami`, and explicitly publish when ready:

   ```sh
   npm login
   npm publish --access public
   ```

   `prepublishOnly` runs the full checks; `prepack` rebuilds the distribution.
   Publishing is a separate, explicit action. No install, test, build or push
   command in this repository publishes the package automatically.

## Trusted publishing for subsequent releases

The manual `.github/workflows/publish.yml` workflow uses npm OIDC trusted publishing
on a GitHub-hosted runner. It does not require a stored npm token.

- Configure the package's trusted publisher in npm with the real GitHub owner,
  repository, workflow filename `publish.yml`, and environment `npm-publish`.
- Enable direct `npm publish` permission for that trusted publisher if npm presents
  an allowed-actions setting.
- Create the matching GitHub environment, with release approval if desired.
- Ensure the real GitHub repository URL is in package.json; provenance must identify
  the repository that runs the workflow.
- The workflow uses Node 24 and npm 11, satisfying npm's OIDC version requirements.

See the [official npm trusted-publishing instructions](https://docs.npmjs.com/trusted-publishers/).

## Release procedure

1. Update `CHANGELOG.md` and bump the package version, e.g.
   `npm version patch --no-git-tag-version` (updates package.json and lockfile).
2. Run `npm ci && npm run check`. Review and commit the version and changelog.
3. Create and push a matching annotated version tag, e.g. `v0.1.1`.
4. Explicitly dispatch **Publish** at that tag. With GitHub CLI:

   ```sh
   gh workflow run publish.yml --ref v0.1.1
   ```

The workflow checks that the ref is a tag matching package.json, runs all checks,
then publishes with provenance. Pushing a tag alone does not publish. To inspect
the prepared package locally, install the tarball from `artifacts/` in a separate
application before dispatching publication.

After publishing, verify `npm view mailrules version` and test installation from
the registry. A version already published cannot be overwritten; prepare a new
patch if a correction is required.
