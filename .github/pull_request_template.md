## 📝 Description
<!-- Briefly describe the changes introduced in this Pull Request -->

## 🎯 Type of Change
- [ ] 🚀 `feat`: New feature or capability
- [ ] 🐛 `fix`: Bug fix
- [ ] ⚡ `perf`: Performance optimization
- [ ] 💄 `style`: UI / UX formatting or visual polish
- [ ] ♻️ `refactor`: Code refactoring without behavior change
- [ ] 📚 `docs`: Documentation updates
- [ ] 🧪 `test`: Adding or updating test cases
- [ ] 🧰 `chore`: Maintenance, dependencies, or configuration

## 🌿 Trunk-Based Development Guidelines
- [ ] Branch branched directly from `main` (`feat/...`, `fix/...`, `chore/...`)
- [ ] Kept small and focused on a single logical change
- [ ] Direct push to `main` is restricted to repository owners
- [ ] Conventional Commit message format used (`type(scope): message`)

## 🧪 Verification & CI
- [ ] `pnpm run lint` (`tsc --noEmit`) and `pnpm run build` passed
- [ ] `cargo clippy -- -D warnings` and `cargo check` passed (if backend files changed)
- [ ] Manual verification performed on active workspace
- [ ] Screenshots or recordings attached (if UI change)

## 🚢 Merge Requirements
- [ ] Full CI Green status achieved on GitHub Actions
- [ ] Approved by repository owner (`@khoa-nguyen`)
- [ ] Ready for contributor self-merge via **Squash and merge** into `main`

## 📸 Screenshots / Recordings (if applicable)
<!-- Attach screenshots comparing before / after or new features -->
