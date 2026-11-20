# WildTrap — Godot migration / Step 1

This is the first **native engine** project in the existing WildTrap repository.
Target engine: **Godot 4.7.2 stable** (standard non-.NET edition), GDScript.

## Open in Godot

1. Install Godot 4.7.2 from the official Godot website.
2. Clone the repository and switch to the `godot-migration` branch.
3. In Godot's Project Manager, choose **Import** and select `godot/project.godot`.
4. Open `res://scenes/main.tscn` and press F6, or press F5 to run the project.
5. The start scene displays a deliberate Phase 1 placeholder. **It is not the
   original WildTrap map**. The `World` node is a stable location for the
   validated imported world in a later stage.

## Automated checks

The workflow at `../.github/workflows/godot-validate.yml` downloads the official
pinned Godot editor and checks project import, the scene tree and a headless boot.

Equivalent local checks (with `godot` in your PATH):

```bash
godot --headless --path godot --editor --import
godot --headless --path godot --script res://tests/smoke_test.gd
godot --headless --path godot --quit-after 4
```

## Boundaries

- The existing Three.js editor, browser playtest, repository `main` and
  `wildtrap-play` are deliberately unchanged.
- We have **not** migrated the authoritative `wildtrap-escenario (4).json` yet.
  The GitHub terrain JSON and sculpt supplements are reference data, not proof
  that the user-uploaded full scene has been recovered.
- Do not substitute the reduced published map for the authoritative source.
- Visual parity (geometry, caves, cuts, biome materials, shadows, fog and
  hand-painted layers) and native platform exports are **later milestones**.
- The initial Compatibility renderer is a project bootstrap choice, **not**
  a fidelity or performance target. Choose renderer profiles after testing
  the real world on desktop and mobile.
- A backend for authenticated browser-to-GitHub editing and conflict checks
  is a separate migration task. Step 1 does not alter browser persistence.
