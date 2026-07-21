# Local runtime

TouchCatch requires Node `v24.18.0` and pnpm `11.13.0`. From PowerShell, verify both before installing dependencies or running a gate:

```powershell
node --version
corepack pnpm --version
```

The commands must print `v24.18.0` and `11.13.0`, respectively. Stop if either value differs; do not run the gate with a different runtime.

Select one runtime manager already installed on the machine, then repeat the two checks above. For example, with fnm:

```powershell
fnm use 24.18.0
node --version
corepack pnpm --version
```

Equivalent choices are `nvm use 24.18.0` for nvm-windows, or `volta install node@24.18.0 pnpm@11.13.0` for Volta. These are workstation setup tools, not project runtime dependencies.

Once the versions match, start project gates through Corepack, for example `corepack pnpm check` or `corepack pnpm verify`. The nested `check`, `check:db`, and `verify` scripts use a repository wrapper that validates and re-invokes the invoking pnpm's `npm_node_execpath` and `npm_execpath`, preserving the already-selected Node and pnpm instead of resolving another global Corepack or pnpm installation.
