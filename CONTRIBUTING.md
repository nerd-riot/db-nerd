# Contributing to DB Nerd (Trunk-Based Development)

Thank you for contributing to **DB Nerd**! We follow **Trunk-Based Development (TBD)** to maintain high velocity, rapid integration, and rock-solid stability.

---

## 🌿 1. Trunk-Based Development Model

- **The Trunk (`main`)**: 
  - `main` is the primary, always-deployable, production-ready branch.
  - All releases are cut directly from `main`.
- **Short-Lived Feature Branches**:
  - Branches should branch off `main` and be merged back within **1 to 2 days**.
  - Naming conventions:
    - `feat/feature-name` (e.g. `feat/tableplus-tabs`)
    - `fix/bug-description` (e.g. `fix/heartbeat-latency`)
    - `perf/optimization` (e.g. `perf/canvas-matrix`)
    - `chore/tooling-or-deps` (e.g. `chore/upgrade-vite`)

---

## 🛡️ 2. Repository Permissions & Access Rules

| Role | Push to `main` | Open PRs | Code Review & Approval | Merge Authority | Automated Releases |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Owner / Admin** (`@khoa-nguyen`) | ✅ **Direct Push & Pull** | ✅ Allowed | ✅ Exclusive Authority | ✅ Full Access | ✅ Full Access |
| **Contributors** | ❌ **Forbidden** | ✅ **Required** | ❌ Requires Owner Approval | ✅ **Self-Merge** (after Approval & Green CI) | ❌ Handled via `main` |

### For Contributors:
1. Clone or fork the repository.
2. Create a short-lived branch off `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/my-improvement
   ```
3. Make atomic commits using **Conventional Commits**:
   ```bash
   git commit -m "feat(ui): add new filter operator"
   ```
4. Push your branch and open a **Pull Request (PR)** targeting `main`.
5. **Automated CI**: CI verifies your code in parallel:
   - **Frontend**: `pnpm run lint` (`tsc --noEmit`) & `pnpm run build`
   - **Backend**: `cargo clippy -- -D warnings` & `cargo check`
   - Gate status: **Full CI Green**
6. **Owner Approval**: The repository owner (`@khoa-nguyen`) reviews and approves the PR.
7. **Contributor Self-Merge**: Once the owner has approved and **Full CI Green** has passed, the contributor has full permission to merge their PR.
8. **Default Merge Method**: Always use **Squash and merge** into `main` to maintain a clean, linear git history with 1 atomic Conventional Commit per PR.

---

## 📝 3. Conventional Commit Conventions

We use Conventional Commits to automatically determine Semantic Versioning tags (`v1.0.xx`) and generate release notes:

| Prefix | Meaning | Version Bump |
| :--- | :--- | :---: |
| `feat:` / `feat(...):` | New feature or user capability | **Minor** (`1.x.0`) / Patch |
| `fix:` / `fix(...):` | Bug fix or issue resolution | **Patch** (`1.0.xx`) |
| `perf:` / `perf(...):` | Performance enhancement | **Patch** (`1.0.xx`) |
| `style:` | UI polish, CSS formatting | **Patch** (`1.0.xx`) |
| `refactor:` | Code reorganization without functional change | **Patch** (`1.0.xx`) |
| `chore:` / `docs:` | Maintenance, docs, dependencies | **Patch** (`1.0.xx`) |
| `BREAKING CHANGE:` | Incompatible API / behavior change | **Major** (`x.0.0`) |

---

## 🚀 4. Automated Release Process (`v1.0.xx`)

Releases are fully automated via GitHub Actions:
- Whenever commits or PRs land on `main`, the [Release Workflow](.github/workflows/release.yml) runs.
- It scans commits since the last release tag, calculates the next SemVer tag (e.g. `v1.0.0` ➔ `v1.0.1` ➔ `v1.0.2`), and creates the Git tag.
- It calls GitHub's Release Engine to automatically categorize all PRs and commits into a formatted **Release Note**.
- The owner can also trigger an on-demand release with a single click via GitHub Actions (`workflow_dispatch`).
