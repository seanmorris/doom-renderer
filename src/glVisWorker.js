import GlvisBinary from 'glvis-wasm/GlvisBinary.mjs';

const runGlvis = async (wadBuffer, onOut, onErr) => {

	const glvis = await GlvisBinary({
		print: onOut || (line => console.log(line)),
		printErr: onErr || (line => {
			if(!line.match(/^\d+\u0008/)) return;
			const remaining = Number(line.split('\u0008').shift());
			console.log(`glvis: ${remaining} ssects left...`);
		}),
	});

	glvis.FS.writeFile('/tmp/vis-source.wad', new Uint8Array(wadBuffer));
	const args = ['glvis', '-v', '-noreject', '/tmp/vis-source.wad'];

	const ptrs = args.map(part => {
		const len = glvis.lengthBytesUTF8(part) + 1;
		const loc = glvis._malloc(len);
		glvis.stringToUTF8(part, loc, len);
		return loc;
	});

	const arLoc = glvis._malloc(4 * ptrs.length);
	try
	{
		for(const i in ptrs)
		{
			glvis.setValue(arLoc + 4 * i, ptrs[i], '*');
		}

		const process = glvis.ccall(
			'main'
			, 'number'
			, ['number', 'number']
			, [ptrs.length, arLoc]
			, {async: true}
		);

		return glvis.FS.readFile('/tmp/vis-source.wad');
	}
	catch(error)
	{
		if(typeof error === 'object' && (!('status' in error) || error.status !== 0))
		{
			throw error;
		}
		else
		{
			console.warn(error);
		}
	}
	finally
	{
		ptrs.forEach(p => glvis._free(p));
		glvis._free(arLoc);
	}
};

addEventListener("message", async event => {
	if(event.data)
	{
		const mapData = await runGlvis(event.data, null, line => {
			if(!line.match(/^\d+\u0008/)) return;
			const remaining = Number(line.split('\u0008').shift());
			console.log(`GLVIS: ${remaining} ssects left...`);
			postMessage({status: remaining, done: false});
		});

		postMessage({mapData, done: true});
	}

});
