import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const ID = 'virtual:atlas-kit';

/** The copy of the Atlas kit that the arena's meta analyzer (meta/export-kit.js) refreshes in the shared project folder. */
const SHARED_ATLAS_KIT = '/mnt/project-files/meta/kit/atlas-kit.js';

/**
 * `import kit from 'virtual:atlas-kit'`: the Strategy Atlas kit (meta/atlas-kit.js in the arena repo, a UMD script owned
 * by its meta analyzer) as an ES module, for the spots on the board. It runs with a local `module`, so it never sets
 * window.AtlasKit and a kit the host page loaded keeps winning (src/data/atlas.ts prefers it). ATLAS_KIT names the file
 * (e.g. ../swu_bot/meta/atlas-kit.js), default SHARED_ATLAS_KIT; with no file, the module is null and the viewer draws
 * no spots.
 */
export function atlasKit(): Plugin {
    const file = path.resolve(process.env.ATLAS_KIT || SHARED_ATLAS_KIT);
    return {
        name: 'atlas-kit',
        resolveId: (id) => (id === ID ? `\0${ID}` : null),
        load(id) {
            if (id !== `\0${ID}`) {
                return null;
            }
            if (!fs.existsSync(file)) {
                this.warn(`no Atlas kit at ${file}: the viewer will draw no Atlas spots (set ATLAS_KIT to the file)`);
                return 'export default null;';
            }
            this.addWatchFile(file);
            return `const module = { exports: {} };\n${fs.readFileSync(file, 'utf8')}\nexport default module.exports;\n`;
        }
    };
}
