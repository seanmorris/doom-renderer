#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Wad } from 'doom-parser/Wad.mjs';

const scan = (baseDir) => {

	const wads = [];
	let mapCount = 0;

	const walk = (dir) => {
		const files = fs.readdirSync(dir);

		for(const file of files)
		{
			const fullPath = path.join(dir, file);
			const stat = fs.statSync(fullPath);

			if(stat.isDirectory())
			{
				walk(fullPath);
			}
			else if(path.extname(file).toLowerCase() === '.wad')
			{
				const baseName = path.basename(file, '.wad');
				const txtPath = path.join(dir, baseName + '.txt');

				try
				{
					const wad = new Wad(fs.readFileSync(fullPath));
					const maps = wad.findMaps();
					mapCount += maps.length;
					fs.existsSync(txtPath)
						? wads.push({ wad: fullPath, maps: maps, txt: txtPath })
						: wads.push({ wad: fullPath, maps: maps });
				}
				catch(error)
				{
					console.warn(`Errors in ${fullPath}`, error);
				}
			}
		}
	}

	walk(baseDir);
	return {wads, wadCount: wads.length, mapCount};
}

console.log(JSON.stringify(scan('.'), null, 2));
