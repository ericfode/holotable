import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Plain-text name of the kit's license list, written next to the kit files and named in their banner. */
export const KIT_LICENSES = 'swu-viewer-kit.licenses.txt';

const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)/i;

/** The folder of the npm package a bundled module comes from, or null for the kit's own code. */
function packageDir(id: string): string | null {
    const file = id.replace(/^\0/, '').replace(/\?.*$/, '');
    const i = file.lastIndexOf('/node_modules/');
    if (i < 0) {
        return null;
    }
    const [scope, name] = file.slice(i + '/node_modules/'.length).split('/');
    return path.join(file.slice(0, i), 'node_modules', scope.startsWith('@') ? `${scope}/${name}` : scope);
}

/**
 * The kit's third-party licenses: every npm package bundled into a kit file, its version and license, and the license
 * texts the package ships (each text once), written next to the kit as KIT_LICENSES. Hosts that serve the kit serve
 * this file beside it (the arena window does). `extra` names packages the kit carries without a module of their own.
 */
export function kitLicenses({ extra = [] as string[] } = {}): Plugin {
    let root = process.cwd();
    return {
        name: 'kit-licenses',
        configResolved(config) {
            root = config.root;
        },
        generateBundle(_options, bundle) {
            const dirs = new Set(extra.map((name) => path.join(root, 'node_modules', name)));
            for (const chunk of Object.values(bundle)) {
                if (chunk.type === 'chunk') {
                    for (const id of chunk.moduleIds) {
                        const dir = packageDir(id);
                        if (dir) {
                            dirs.add(dir);
                        }
                    }
                }
            }
            const packages = [...dirs]
                .map((dir) => ({ dir, pkg: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) }))
                .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
            const texts: string[] = [];
            const rows = packages.map(({ dir, pkg }) => {
                const refs = fs
                    .readdirSync(dir)
                    .filter((f) => LICENSE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile())
                    .sort()
                    .map((f) => {
                        const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim();
                        const i = texts.includes(text) ? texts.indexOf(text) : texts.push(text) - 1;
                        return `text ${i + 1}`;
                    });
                return `${pkg.name} ${pkg.version} (${pkg.license ?? 'see its page'}): ${refs.join(', ') || 'no license file in the package'}`;
            });
            const source = [
                'Third-party software in the Holotable viewer kit (swu-viewer-kit.js and swu-viewer-kit.mjs)',
                '',
                'The kit bundles these packages from npm, each under its own license. The license texts the packages ship',
                'follow the list, each text once. The kit itself is MIT licensed (https://github.com/ericfode/holotable).',
                '',
                ...rows,
                ...texts.flatMap((text, i) => ['', `---- text ${i + 1} ----`, '', text]),
                ''
            ].join('\n');
            this.emitFile({ type: 'asset', fileName: KIT_LICENSES, source });
        }
    };
}
