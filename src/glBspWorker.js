import GlbspBinary from 'glbsp-wasm/GlbspBinary.mjs';

const runGlbsp = async (wadBuffer) => {
	const glbsp = await GlbspBinary({
		print: line => console.log(line),
		printErr: line => console.warn(line),
	});

	glbsp.FS.writeFile('/tmp/bsp-source.wad', new Uint8Array(wadBuffer));
	const args = ['glbsp', '-w', '-xr', '-xu', '-m', '/tmp/bsp-source.wad', '-o', '/tmp/bsp-out.wad'];

	const ptrs = args.map(part => {
		const len = glbsp.lengthBytesUTF8(part) + 1;
		const loc = glbsp._malloc(len);
		glbsp.stringToUTF8(part, loc, len);
		return loc;
	});

	const arLoc = glbsp._malloc(4 * ptrs.length);
	try
	{
		for(const i in ptrs)
		{
			glbsp.setValue(arLoc + 4 * i, ptrs[i], '*');
		}

		const process = glbsp.ccall(
			'main'
			, 'number'
			, ['number', 'number']
			, [ptrs.length, arLoc]
			, {async: true}
		);

		return glbsp.FS.readFile('/tmp/bsp-out.wad');
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
		ptrs.forEach(p => glbsp._free(p));
		glbsp._free(arLoc);
	}
};

addEventListener("message", async event => {
	if(event.data)
	{
		const mapData = await runGlbsp(event.data);
		postMessage({mapData, done: true});
	}

});
