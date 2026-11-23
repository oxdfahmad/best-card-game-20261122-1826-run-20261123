// Three Winds — the hand-in program (Node 22, standard library only).
// It gathers the game and its screenshots from beside this file, lays them
// out under the output directory the grader reads, and writes the dossier
// the judge reads with the kit's vendored library. Run it twice and both
// runs write the same bytes: nothing here depends on the clock or chance.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output directory so a stale file can never leak in.
// Never remove the output directory itself: on the grader it is a mount
// point, and removing a mount point fails with EBUSY. Empty its contents
// instead, which keeps the directory usable and drops every stale entry.
mkdirSync(outputDir, { recursive: true });
for (const entry of readdirSync(outputDir)) {
  rmSync(join(outputDir, entry), { recursive: true, force: true });
}
mkdirSync(join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps, as the kit's gate states them: the dossier text is
// capped, and the rest refuse an entry the scorer would refuse (more than
// four screenshots or one over 256 KiB; more than 993 files in game/ or
// 48 MiB of game files in all, or a path under game/ over 1000 bytes).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
