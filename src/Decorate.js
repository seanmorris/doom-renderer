const combos = {
	MONSTER: {
		flags: [
			'+SHOOTABLE', '+COUNTKILL', '+SOLID', '+CANPUSHWALLS',
			'+CANUSEWALLS', '+ACTIVATEMCROSS', '+CANPASS', '+ISMONSTER',
		]
	},
	PROJECTILE: {
		flags: [
			'+NOBLOCKMAP', '+NOGRAVITY', '+DROPOFF', '+MISSILE',
			'+ACTIVATEIMPACT', '+ACTIVATEPCROSS', '+NOTELEPORT',
		]
	}
};

const parseDecorate = source => {
	const lines = String(source).split("\n").map(l => {
		l = l.replace(/\s*\/\/.+$/, '');
		return l.trim();
	}).filter(x => x);

	let mode = 0;
	let i = 0;

	const blocks = [];
	let currentBlock = null;
	let currentState = null;

	for(const line of lines)
	{
		if(mode === 0)
		{
			if(line.substr(0, 6).toUpperCase() === 'ACTOR ')
			{
				const actorDef = line.substr(6).toUpperCase();
				const colonPos = actorDef.indexOf(':');

				let [name, ...modifiers] = actorDef.split(/\s/);
				let parent = 'ACTOR';
				let replaces = null;
				let edNum = null;

				if(colonPos > -1)
				{
					[name, ...modifiers] = actorDef.substr(0, colonPos).split(/\s/);
					const def =  actorDef.substr(1 + colonPos).trim().split(' ');

					if(String(def[0]).toUpperCase() !== 'REPLACES')
					{
						parent = def.shift().toUpperCase();
					}

					if(String(def[0]).toUpperCase() === 'REPLACES')
					{
						def.shift();
						replaces = def.shift().toUpperCase();
					}

					if(String(def[0]).toUpperCase() === 'NATIVE')
					{
						def.shift();
					}

					if(def.length === 1)
					{
						if(Number(def[0]) == def[0])
						{
							edNum = Number(def[0]);
						}
						else
						{
							console.warn('Non-numeric value for DoomEdNum in DECORATE ActorDef.');
						}
					}
					else if(def.length)
					{
						console.warn('Extra data in DECORATE ActorDef.');
					}
				}

				currentBlock = { name, parent, replaces, edNum, flags: {}, properties: {}, states: {}, combos: [] };

				blocks.push(currentBlock);
			}

			if(line === '{')
			{
				mode = 1;
				continue;
			}
		}

		if(mode === 1)
		{
			if(line === '}')
			{
				mode = 0;
				continue;
			}
			if(line[0] === '+')
			{
				currentBlock.flags[ line.substr(1) ] = true;
			}
			else if(line[0] === '-')
			{
				currentBlock.flags[ line.substr(1) ] = false;
			}
			else if(line.toUpperCase() !== 'STATES')
			{
				const spacePos = line.indexOf(' ');
				if(spacePos > -1)
				{
					const rawProp = line.substr(1 + spacePos);
					let prop = rawProp;

					if(Number(prop) == prop)
					{
						prop = Number(prop);
					}
					else if(prop[0] === '"' && prop[-1 + prop.length] === '"')
					{
						prop = prop.substr(1, -2 + prop.length);
					}

					currentBlock.properties[ line.substr(0, spacePos).toUpperCase() ] = prop;
				}
				else
				{
					const propName = line.toUpperCase();

					if(propName in combos)
					{
						if(combos[propName].flags)
						for(const flag of combos[propName].flags)
						{
							if(flag[0] === '-')
							{
								currentBlock.flags[ flag.substr(1).toUpperCase() ] = false;
							}
							if(flag[0] === '+')
							{
								currentBlock.flags[ flag.substr(1).toUpperCase() ] = true;
							}
							else
							{
								currentBlock.flags[ flag.toUpperCase() ] = true;
							}
						}

						currentBlock.combos.push(propName);
					}
					else
					{
						currentBlock.properties[ propName ] = null;
					}
				}
			}

			else if(line.toUpperCase() === 'STATES')
			{
				mode = 2;
				continue;
			}
		}

		if(mode === 2)
		{
			if(line === '}')
			{
				mode = 1;
				continue;
			}
			else if(line === '{')
			{
				continue;
			}
			else if(line[-1 + line.length] === ':')
			{
				const name = line.substr(0, -1 + line.length);

				currentState = currentBlock.states[name] = [];
			}
			else
			{
				if(line.match(/^[A-Z1-9]{4}\s/))
				{
					const split = line.split(/^([A-Z1-9]{4})\s+"?([A-Z1-9\[\]\\]+)"?\s+((?:native)?)\s?(-?\d+)\s*(\S+)?\s*(.+)?$/);
					split.shift();
					split.pop();

					const [sprite, frames, native, duration] = split;

					let action, keyword;

					if(split[4] && split[4].substr(0, 2) === 'A_')
					{
						action = split[4];
					}
					else if(split[5])
					{
						keyword = split[4];
						action = split[5];
					}

					for(const frame of frames)
					{
						currentState.push({sprite, frame, duration: Number(duration), keyword, action, native});
					}
				}
				else
				{
					const [instruction, ...args] = line.split(/\s/);
					currentState.push({instruction, args});
				}
			}
		}
	}

	return blocks;
};

let pitchShiftRange = 0;

const parseSndinfo = source => {
	const lines = String(source).split("\n").map(l => {
		l = l.replace(/\s*\/\/.+$/, '');
		return l.trim();
	}).filter(x => x);

	const sounds = {};
	const functions = {};

	for(const line of lines)
	{
		if(line[0] === '$')
		{
			let chunks = [];
			const rx = /(.+?)\s+(?:=\s+)?/g;
			let match;
			let end;

			while(match = rx.exec(line))
			{
				end = match.index;
				if(chunks.length < 2)
				{
					chunks.push(match[1].trim());
					end += match[1].length;
				}
				else
				{
					break;
				}
			}

			let val = line.substr(end).trim();

			if(Number(val) == val)
			{
				val = Number(val);
			}

			chunks.push(val);

			if(chunks.length > 2)
			{
				const [name, logical, args] = chunks;

				if(args[0] === '{' && args[-1 + args.length] === '}')
				{
					functions[ logical ] = {name, args: args.substr(1, -2 + args.length).trim().split(/\s+/)};
				}
				else
				{
					functions[ logical ] = {name, args: [args]};
				}

			}
			else if(chunks[0] === '$pitchshiftrange')
			{
				pitchShiftRange = chunks[1];
			}

			continue;
		}

		const split = line.split(/\s+(?:=\s+)?/);

		if(split.length !== 2)
		{
			console.warn(`Invalid SNDINFO entry: ${line}`);
			continue;
		}

		const [logical, path] = split;

		sounds[logical] = { sample: path, pitchShiftRange: pitchShiftRange };
	}

	return {sounds, functions};
};

export class Decorate
{
	edNames = {};
	built = {};
	defs = {};

	parse(source)
	{
		const blocks = parseDecorate(source);

		for(const block of blocks)
		{
			this.defs[block.name] = block;

			if(block.edNum)
			{
				this.edNames[block.edNum] = block.name;
			}
		}
	}

	getClass(edNum)
	{
		return this.edNames[edNum];
	}

	resolve(logical)
	{
		if(this.built[logical])
		{
			return this.built[logical];
		}

		if(!this.defs[ logical ])
		{
			return;
		}

		let parent = this.defs[ logical ];

		const built = {
			name: parent.name,
			parent: parent.parent,
			replaces: parent.replaces,
			edNum: parent.edNum,
			inherits: [],
			flags: {},
			properties: {},
			states: {},
			combos: [],
		};

		const chain = [parent];

		while(parent.parent)
		{
			const name = parent.parent;
			parent = this.defs[parent.parent];

			if(parent)
			{
				chain.unshift(parent)
				built.inherits.push(parent.name)
			}
			else
			{
				console.warn(`Parent class ${name} not found!`);
				break;
			}

			if(parent.name === 'ACTOR')
			{
				break;
			}
		}

		for(const c of chain)
		{
			for(const [name, flag] of Object.entries(c.flags))
			{
				built.flags[name] = flag;
			}

			for(const [name, prop] of Object.entries(c.properties))
			{
				built.properties[name] = prop;
			}

			if(Object.entries(c.states).length)
			{
				built.states = {...built.states, ...c.states};
			}

			if(Object.entries(c.states).length)
			{
				built.combos = [...new Set([...built.combos, ...c.combos])];
			}
		}

		return this.built[logical] = built;
	}
}

export class Sndinfo
{
	sounds = {};
	functions = {};

	resolve(logical)
	{
		if(this.sounds[logical])
		{
			return this.sounds[logical];
		}
		else if(this.functions[logical])
		{
			if(this.functions[logical].name === '$random')
			{
				const oneOf = this.functions[logical].args;
				const nextLogical = oneOf[ Math.trunc( (oneOf.length * Math.random()) % oneOf.length ) ];

				return this.resolve(nextLogical);
			}
		}
	}

	parse(source)
	{
		const {sounds, functions} = parseSndinfo(source);

		Object.assign(this.sounds, sounds);
		Object.assign(this.functions, functions);
	}
}
