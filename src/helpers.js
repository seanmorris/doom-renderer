import * as THREE from 'three';
import MissingTexture from './MissingTexture3D.png';

export const byteToLightOffset = byte => byte > -1 ? (33 - Math.ceil(byte / 8)) : byte;

export const flipVertex = (map, vertex, into = {}) => {
	into.x = vertex.x;
	into.y = map.bounds.yMax - (vertex.y - map.bounds.yMin);
	return into;
};

export const unflipVertex = (map, vertex, into = {}) => {
	into.x = vertex.x;
	into.y = map.bounds.yMin - (vertex.y - map.bounds.yMax);
	return into;
};

export const textureLoader = new THREE.TextureLoader();
export const missing = textureLoader.load(MissingTexture);

export const loadTexture = async (wad, name, lightLevel) => {
	const wadTexture = wad.texture(name.toUpperCase()) || wad.flat(name.toUpperCase());

	if(!wadTexture)
	{
		console.log(name);
		return;
	}

	let accept;
	const waiter = new Promise(a => accept = a);

	let texture;

	if(wadTexture)
	{
		texture = textureLoader.load(
			await wadTexture.decode(lightLevel),
			() => accept(texture)
		);
	}
	else
	{
		texture = missing.clone();
		accept(texture);
	}

	texture.userData.wadTexture = wadTexture;
	texture.userData.missing = !wadTexture;

	texture.magFilter = THREE.NearestFilter;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;

	return waiter;
}

export const isTextureName = name => {
	return name
		&& name !== '-'
		&& name !== 'AASTINKY'
		&& name !== 'AASHITTY';
}

const audioCtx = new (AudioContext || webkitAudioContext);

export const samplesPlaying = new Set;
export const playSample = (sample, xPosition, yPosition, options = {}) => {
	if(!sample)
	{
		console.warn('Invalid sample.', sample);
		return;
	}

	const buffer = audioCtx.createBuffer(1, sample.length, sample.rate);
	const channelData = buffer.getChannelData(0);
	const halfMax = 2 ** (-1 + sample.depth)

	if(sample.depth === 8)
	{
		for(let i = 0; i < sample.length; i++)
		{
			channelData[i] = (sample.samples[i] - halfMax) / halfMax;
		}
	}
	else if(sample.depth === 16)
	{
		for(let i = 0; i < sample.length; i++)
		{
			channelData[i] = sample.samples[i] / halfMax;
		}
	}
	else if(sample.depth === 32)
	{
		for(let i = 0; i < sample.length; i++)
		{
			channelData[i] = sample.samples[i];
		}
	}

	const source  = audioCtx.createBufferSource();
	const stereo  = new StereoPannerNode(audioCtx, {pan: 0});
	const gain    = new GainNode(audioCtx, {gain: options.gain ?? 0.25});
	source.buffer = buffer;

	source.connect(gain).connect(stereo).connect(audioCtx.destination);
	source.start();

	let accept;

	const waiter = new Promise(a => accept = a);

	const sound = {buffer, xPosition, yPosition, stereo, gain, options};

	source.addEventListener('ended', () => {
		samplesPlaying.delete(sound);
		accept();
	}, {once: true});

	samplesPlaying.add(sound);

	return waiter;
};

export class MessageString
{
	constructor(text)
	{
		this.container = document.createElement('span');
		this.text = text;
		this.container.innerText = this.text;
	}

	setText(text)
	{
		this.text = text;
		this.container.innerText = this.text;

	}

	remove()
	{
		this.container.remove();
	}
}

export const lineIntersectsLine = (x1a, y1a, x2a, y2a, x1b, y1b, x2b, y2b) => {
	const ax = x2a - x1a;
	const ay = y2a - y1a;

	const bx = x2b - x1b;
	const by = y2b - y1b;

	const crossProduct = ax * by - ay * bx;

	// Parallel Lines cannot intersect
	if(crossProduct === 0)
	{
		return false;
	}

	const cx = x1b - x1a;
	const cy = y1b - y1a;

	// Is our point within the bounds of line a?
	const d = (cx * ay - cy * ax) / crossProduct;
	if(d < 0 || d > 1)
	{
		return false;
	}

	// Is our point within the bounds of line b?
	const t = (cx * by - cy * bx) / crossProduct;
	if(t < 0 || t > 1)
	{
		return false;
	}

	const x = x1a + t * ax;
	const y = y1a + t * ay;

	return {x, y, t, d};
}

export const nearestPointOnLine = (px, py, x1, y1, x2, y2, clamped = false) => {
	const dx = x2 - x1;
	const dy = y2 - y1;

	if(!dx && !dy)
	{
		return {x: 0, y: 0};
	}

	const t = (((px - x1) * dx + (py - y1) * dy) / (dx**2 + dy**2));
	const c = clamped ? Math.max(0, Math.min(1, t)) : t;

	const x = x1 + c * dx;
	const y = y1 + c * dy;

	const d = Math.hypot(py - y, px - x);

	return {x, y, t:c, d};
};

export const rayLinedefs = (castingEntity, x, y, angle, distance) => {
	const map = castingEntity.level.map;
	const stepSize = 0x80;

	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	const xEnd = x + cos * distance;
	const yEnd = y + sin * distance;

	const xDiff = xEnd - x;
	const yDiff = yEnd - y;

	const xStep = xDiff ? ( stepSize * Math.hypot(1, (yDiff / xDiff)) ) : 0;
	const yStep = yDiff ? ( stepSize * Math.hypot(1, (xDiff / yDiff)) ) : 0;

	const xOffset = xDiff > 0 ? (stepSize - x % stepSize) : (x % stepSize);
	const yOffset = yDiff > 0 ? (stepSize - x % stepSize) : (y % stepSize);

	let xRay = xOffset;
	let yRay = yOffset;

	const candidates = new Set;

	map.linedefsNearPoint(x, y).forEach(b => candidates.add(b));

	while(xStep && xRay < distance)
	{
		const mag = Math.abs(xRay);
		const px = x + mag * cos;
		const py = y + mag * sin;
		xRay += xStep;

		map.linedefsNearPoint(px, py).forEach(b => candidates.add(b));
	}

	while(yStep && yRay < distance)
	{
		const mag = Math.abs(yRay);
		const px = x + mag * cos;
		const py = y + mag * sin;
		yRay += yStep;

		map.linedefsNearPoint(px, py).forEach(b => candidates.add(b));
	}

	map.linedefsNearPoint(xEnd, yEnd).forEach(b => candidates.add(b));

	const intersections = new Map;

	for(const candidate of candidates)
	{
		const linedef = map.linedef(candidate);
		const from = map.vertex(linedef.from);
		const to   = map.vertex(linedef.to);

		const intersection = lineIntersectsLine(from.x, from.y, to.x, to.y, x, y, xEnd, yEnd);

		if(intersection)
		{
			intersections.set(linedef, intersection);
		}
	}

	return new Map( [...intersections.entries()].sort((a, b) =>  a[1].d - b[1].d) );
};

export const rayEntities = (castingEntity, x, y, angle, distance) => {
	const level = castingEntity.level;
	const stepSize = 0x80;

	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	const xEnd = x + cos * distance;
	const yEnd = y + sin * distance;

	const candidates = new Set;

	let mag = 0;

	while(mag < distance)
	{
		const px = x + mag * cos;
		const py = y + mag * sin;

		const entities = level.quadTree.select(
			px - stepSize, py - stepSize,
			px + stepSize, py + stepSize,
		);

		entities.forEach(e => candidates.add(e));

		mag += stepSize;
	}

	const entities = new Map;

	for(const candidate of candidates)
	{
		if(candidate === castingEntity) continue;

		const nearest = nearestPointOnLine(
			candidate.position.x,
			candidate.position.y,
			x,
			y,
			xEnd,
			yEnd,
			true,
		);

		if(nearest.d < candidate.radius)
		{
			const intersection = {
				x: nearest.x,
				y: nearest.y,
				d: Math.hypot(y - nearest.y, x - nearest.x) / distance,
			};

			entities.set(candidate, intersection);
		}
	}

	return new Map( [...entities.entries()].sort((a, b) =>  a[1].d - b[1].d) );
};

export const renderText = async (wad, string) => {
	let canvasWidth = 0;
	let canvasHeight = 0;

	let decoded = [];

	const spaceWidth = 3;

	for(const char of String(string).toUpperCase())
	{
		const code = char.charCodeAt(0);

		if(code === 32)
		{
			canvasWidth += spaceWidth;
			decoded.push(null);
			continue;
		};

		const pic = wad.picture('STCFN' + String(code).padStart(3, 0)) || wad.picture('STCFN095');
		const url = await pic.decode();

		canvasWidth += pic.width + -1;
		canvasHeight = Math.max(canvasHeight, pic.height);

		decoded.push({pic, url});
	}

	canvasWidth += 1;

	const canvas = new window.OffscreenCanvas(canvasWidth, canvasHeight);
	const context = canvas.getContext('2d');

	let offset = 0;
	const loaders = [];

	for(const d of decoded)
	{
		if(d === null)
		{
			offset += spaceWidth;
			continue;
		}

		let accept;
		const promise = new Promise(a => accept = a);
		const _offset = offset;

		const image = new Image(d.pic.width, d.pic.height);

		image.addEventListener('load', () => {
			context.drawImage(image, _offset, canvasHeight-d.pic.height, d.pic.width, d.pic.height);
			accept();
		});

		offset += d.pic.width + -1;
		image.src = d.url;
		loaders.push(promise);
	}

	await Promise.all(loaders);
	const blob = await canvas.convertToBlob();
	const url = URL.createObjectURL(blob);

	return {url, width: canvasWidth, height: canvasHeight};
};

export const ldAction = (entity, linedef, room, oRoom, dot, camera) => {
	const level = entity.level;
	if(linedef.actionMeta)
	switch(linedef.actionMeta.type)
	{
		case 'mDoor':
			if(dot > 0)
				room.openDoor(linedef.actionMeta.tm);
			else
				oRoom.openDoor(linedef.actionMeta.tm);
			break;

		case 'rDoor':
			if(level.tags.has(linedef.tag))
			for(const sector of level.tags.get(linedef.tag))
			{
				const room = level.rooms.get(sector.index);
				room.openDoor(linedef.actionMeta.tm);
			}
			break;

		case 'Ceil':
			switch(linedef.actionMeta.index)
			{
				case 40:
					if(level.tags.has(linedef.tag))
					for(const sector of level.tags.get(linedef.tag))
					{
						const lift = level.rooms.get(sector.index);
						lift.raiseCeiling(linedef.actionMeta);
					}

					break;
				case 41:
				case 43:
				case 44:
				case 49:
				case 72:
					if(level.tags.has(linedef.tag))
					for(const sector of level.tags.get(linedef.tag))
					{
						const lift = level.rooms.get(sector.index);
						lift.lowerCeiling(linedef.actionMeta);
					}
					break;
			}
			break;

		case 'Lift':
			if(level.tags.has(linedef.tag))
			switch(linedef.actionMeta.index)
			{
				case 10:
				case 21:
				case 88:
				case 62:
				case 121:
				case 122:
				case 120:
				case 123:
					for(const sector of level.tags.get(linedef.tag))
					{
						const lift = level.rooms.get(sector.index);
						lift.lastAction = linedef.actionMeta;
						lift.lowerLift(linedef.actionMeta);
					}
					break;
			}
			break;

		case 'Floor':
			if(level.tags.has(linedef.tag))
			switch(linedef.actionMeta.index)
			{
				// up to nhEF
				case 119:
				case 128:
				case 18:
				case 69:
				case 22:
				case 95:
				case 20:
				case 68:
				case 47:
					for(const sector of level.tags.get(linedef.tag))
					{
						const lift = level.rooms.get(sector.index);
						lift.lastAction = linedef.actionMeta;
						lift.raiseFloor(linedef.actionMeta);
					}
					break;

				// up to LIC
				case 5:
				case 91:
				case 101:
				case 64:
				case 24:
					for(const sector of level.tags.get(linedef.tag))
					{
						const lift = level.rooms.get(sector.index);
						lift.lastAction = linedef.actionMeta;
						lift.raiseFloor(linedef.actionMeta);
					}
					break;

				// up to nhEF (todo)
				// up to LIC - 8, CRUSH (todo)
				// up 24 (todo)
				// up 32 (todo)
				// up 512 (todo)
				// up ShortestLowerTexture (todo)
				// down to LEF (todo)
				case 38:
				case 23:
				case 82:
				case 60:
				case 37:
					for(const sector of level.tags.get(linedef.tag))
					{
						const lift = level.rooms.get(sector.index);
						lift.lastAction = linedef.actionMeta;
						lift.lowerLift(linedef.actionMeta);
					}
					break;
					break;

				// down to HEF + 8 (todo)
				// donut (todo)

				// down to HEF
				case 102:
				case 83:
				case 45:
				case 36:
				case 71:
				case 98:
				case 70:
				case 36:
					for(const sector of level.tags.get(linedef.tag))
					{
						const lift = level.rooms.get(sector.index);
						lift.lastAction = linedef.actionMeta;
						lift.lowerLift(linedef.actionMeta);
					}
					break;
			}
			break;

		case 'Stair':
			for(const room of level.tags.get(linedef.tag))
			{
				room.lastAction = linedef.actionMeta;
				room.raiseStaircase(linedef.actionMeta);
			}
			break;

		case 'MvFlr': // todo
			break;
		case 'Crush': // todo
			break;
		case 'Exit':  // todo
			console.log(`Next level is ${level.wad.findNextMap(level.map.name)}`);
			// if(query.has('random-level'))
			// {
			// 	location.reload();
			// }
			break;
		case 'Light': // todo
			break;

		case 'Telpt':
			if(dot < 0)
			for(const room of level.tags.get(linedef.tag))
			{
				if(room.destination)
				{
					entity.teleporting = true;

					entity.position.x = room.destination.x;
					entity.position.y = room.destination.y;
					entity.position.z = room.floorHeight;

					if(entity.camera)
					{
						entity.camera.rotation.x = 0;
						entity.camera.rotation.z = 0;
						entity.camera.rotation.y = (Math.PI / 2) * ((-90 + room.destination.angle) / 90);
					}


					entity.velocity.x = 0;
					entity.velocity.y = 0;
					entity.ignore = 18;
					break;
				}
			}
			break;
	}
};
