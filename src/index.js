'use strict';

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Wad, WadLoader } from 'doom-parser/Wad.mjs'
import favicon from './favicon.ico';
import { unflipVertex, flipVertex, samplesPlaying } from './helpers';
import { Level } from './Level';
import { cameraPosition, pass } from 'three/tsl';

let camera, renderer, controls;
let mainScene, uiScene;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let wad, map;
let yCam = 0;
let yVel = 0;

let noClip = false;
let lowRes = false;
let paused = -1;
let ignore = 0;
let teleporting = false;

class MessageString
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

const lineIntersectsLine = (x1a, y1a, x2a, y2a, x1b, y1b, x2b, y2b) => {
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

const nearestPointOnLine = (px, py, x1, y1, x2, y2, clamped = false) => {
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

// todo: finish implementing this
const rayLinedefs = (map, x, y, angle, distance) => {
	const xEnd = x + Math.cos(angle) * distance;
	const yEnd = y + Math.sin(angle) * distance;

	const xDir = Math.sign(xEnd - x);
	const yDir = Math.sign(yEnd - y);

	const blocks = new Set();
	for(let i = x; i < xEnd; i += 0x80 * xDir)
	for(let j = y; j < yEnd; j += 0x80 * yDir)
	{
		map.blocksNearPoint(i, j).forEach(b => blocks.add(b));
	}

	return blocks;
};

let level;
const query = new URLSearchParams(location.search);

const setup = async () => {
	console.time('setup');

	const ms = new MessageString('Loading...');
	document.querySelector('#loader').append(ms.container);

	let prefix = '';

	if(process.env.NODE_ENV === 'production')
	{
		prefix = '/doom-renderer'
	}

	const iwads = [
		'/wads/freedoom1.wad',
		'/wads/freedoom2.wad',
		'/wads/DOOM1.WAD',
		'/wads/TEST.WAD',
		// '/wads/HACKED2.WAD',
	];

	const iWadList = iwads.map(
		async iwad => await (await fetch(prefix + iwad)).arrayBuffer()
	);

	const pWadList = [];

	let randomMap = null;
	let selectedWad = query.has('wad') ? query.get('wad') : false;

	if(query.has('random-level'))
	{
		const wadIndex = await (await fetch(prefix + '/wads.json')).json();
		const wadList = wadIndex.wads;
		const randomIndex = Math.floor(Math.random() * wadList.length);
		selectedWad = wadList[randomIndex].wad;
	}

	let wadUrl;
	let wadIsExternal = false;

	if(selectedWad)
	{
		wadUrl = new URL(selectedWad, location.origin);

		if(wadUrl.origin === location.origin)
		{
			wadUrl = 'https://level-archive.seanmorr.is/' + wadUrl.pathname.substr(1);
		}
		else
		{
			wadIsExternal = true;
		}
		const bytes = await (await fetch(wadUrl)).arrayBuffer();
		pWadList.push(bytes);

		const pwad = new Wad(bytes);

		if(query.has('random-level'))
		{
			const maps = pwad.findMaps();
			const randomIndex = Math.floor(Math.random() * maps.length);
			randomMap = maps[randomIndex];
			console.log(randomMap);
		}
	}
	else
	{
		wadUrl = new URL(iwads[iwads.length - 1], location.origin);
	}

	const wadList = await Promise.all([...iWadList, ...pWadList]);

	wad = new WadLoader(...wadList);

	document.body.style.setProperty('--backdrop', `url("${await wad.texture('BIGDOOR4').decode()}")`);

	const mapsNames = wad.findMaps();

	if(!mapsNames.length)
	{
		throw new Error('No maps found.');
	}

	const selectedLevel = query.has('level') ? query.get('level') : 0;
	const selectedMap = query.has('map') ? query.get('map') : (randomMap || mapsNames[selectedLevel]);

	if(!mapsNames.includes(selectedMap))
	{
		throw new Error(`Map ${String(selectedMap)} not found.`);
	}

	map = wad.loadMap(selectedMap);

	const originalMapData = map.splitMap(selectedMap);
	let mapData = originalMapData;
	const single = new Wad(mapData);

	if(!single.getLumpByName('GL_NODES'))
	{
		ms.setText(`${String(wadUrl)}#${selectedMap}\nBuilding BSP Nodes`);

		let accept;
		const waiter = new Promise(a => accept = a);
		const glVis = new Worker(new URL('./glBspWorker.js', import.meta.url));
		glVis.addEventListener('message', event => {
			if(event.data.done)
			{
				accept(event.data.mapData);
			}
		});
		glVis.postMessage(mapData);
		mapData = await waiter;
		glVis.terminate();

		map = wad.loadMap(selectedMap);
	}

	if(!map.lumps.GL_PVS || !map.lumps.GL_PVS.size)
	{
		let accept;
		const waiter = new Promise(a => accept = a);
		const glVis = new Worker(new URL('./glVisWorker.js', import.meta.url));
		glVis.addEventListener('message', event => {
			if(event.data.done)
			{
				accept(event.data.mapData);
			}
			else
			{
				ms.setText(`${String(wadUrl)}#${selectedMap}\nPortal Sight-Checks Remaining: ${event.data.status}`);
			}
		});
		glVis.postMessage(mapData);
		mapData = await waiter;
		glVis.terminate();

		map = wad.loadMap(selectedMap);
	}

	wad.addPWad(mapData);
	map = wad.loadMap(selectedMap);

	const bounds = map.bounds;

	let playerStart = {x: 0, y: 0, z: 0, angle: 0};

	if(!query.has('start'))
	{
		let found = false;
		for(let i = 0; i < map.thingCount; i++)
		{
			const thing = map.thing(i);

			if(thing.type === 1)
			{
				playerStart = thing;
				found = true;
				break;
			}
		}
		if(!found)
		{
			// const center = unflipVertex(map, {x: map.bounds.xPosition, y: map.bounds.yPosition});
			// console.log(center, map.bounds);
			playerStart.x = map.bounds.xPosition;
			playerStart.y = map.bounds.yPosition;
		}
	}
	else
	{
		const [x, y, z, angle] = query.get('start').split(',').map(Number);
		playerStart = {x, y, z, angle: 90 + angle};
	}

	// const fov    = 67.5;
	const fov    = 45;
	const aspect = window.innerWidth / window.innerHeight;
	const near   = 0.1;
	const far    = 6400;

	camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

	if(playerStart)
	{
		camera.position.set(
			playerStart.x
			, (playerStart.z ?? 48)
			, bounds.yMax - (playerStart.y - bounds.yMin)
		);

		camera.rotation.y = (Math.PI / 2) * ((-90 + playerStart.angle) / 90);
	}
	else
	{
		camera.position.set(0, 0, -1000);
	}

	const res = lowRes ? (480 / window.innerWidth) : 1;

	const canvas = document.querySelector('canvas');
	renderer = new THREE.WebGLRenderer( { canvas, powerPreference: 'high-performance' } );
	renderer.setClearColor(0xFFFFFF);
	renderer.setPixelRatio( window.devicePixelRatio * res);
	renderer.setSize(window.innerWidth * res, window.innerHeight * res);
	render.autoClear = false;

	window.addEventListener('resize', onWindowResize, false);
	document.addEventListener('drop', onFileDropped, false);

	controls = new PointerLockControls(camera, renderer.domElement);

	controls.update();
	camera.controls = controls;

	const onKeyDown = event => {
		switch ( event.code )
		{
			case 'ArrowUp':
			case 'KeyW':
				moveForward = true;
				break;
			case 'ArrowLeft':
			case 'KeyA':
				moveLeft = true;
				break;
			case 'ArrowDown':
			case 'KeyS':
				moveBackward = true;
				break;
			case 'ArrowRight':
			case 'KeyD':
				moveRight = true;
				break;
		}
	};

	const onKeyUp = event => {
		switch ( event.code )
		{
			case 'ArrowUp':
			case 'KeyW':
				moveForward = false;
				break;

			case 'ArrowLeft':
			case 'KeyA':
				moveLeft = false;
				break;

			case 'ArrowDown':
			case 'KeyS':
				moveBackward = false;
				break;

			case 'ArrowRight':
			case 'KeyD':
				moveRight = false;
				break;

			case 'KeyN':
				noClip = !noClip;
				break;

			case 'KeyP':
				paused = paused ? 0 : -1;
				break;

			case 'KeyO':
				paused = 1;
				break;

			case 'KeyM':
				lowRes = !lowRes;

				if(lowRes)
				{
					renderer.setPixelRatio( window.devicePixelRatio * (480 / window.innerWidth));
				}
				else
				{
					renderer.setPixelRatio(window.devicePixelRatio);
				}

				level.setDetail(lowRes);

				break;

		case 'KeyT':
				level.toggleThings();
				break;

		case 'KeyB':
				level.toggleFullbright();
				break;
		}
	};

	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);

	mainScene = new THREE.Scene();
	mainScene.add(controls.object);

	level = new Level(map, wad, mainScene);

	ms.setText(`${String(wadUrl)}#${selectedMap}\nNow Starting...`);

	await level.setup();

	console.timeEnd('setup');

	document.addEventListener('click', async () => {
		controls.lock();

		for(const lumpName of wad.lumpNames)
		{
			if(lumpName.substr(0, 2) === 'DS')
			{
				// console.log(lumpName);
				// await playSample(wad.sample(lumpName));
			}
		}

	});

	ms.remove();

	const linkBox = document.querySelector('#wad-link');

	if(!wadIsExternal && linkBox)
	{
		const link = document.createElement('a');
		link.href = location.origin + location.pathname + '?wad=' + String(wadUrl) + '&map=' + selectedMap;
		link.innerText = '?wad=' + String(wadUrl) + '&map=' + selectedMap;
		linkBox.appendChild(link);
	}

	// const sTexture = new THREE.TextureLoader().load( await wad.picture('STCFN083').decode() );
	// const sMaterial = new THREE.SpriteMaterial( { map: sTexture } );
	// const sprite = new THREE.Sprite(sMaterial);
	// sprite.position.set(camera.position.x, camera.position.y, camera.position.z);
	// mainScene.add( sprite );
}

const camDir = new THREE.Vector3();

let xSpeed = 0;
let ySpeed = 0;

const ldAction = (linedef, room, oRoom, dot) => {
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
			console.log(`Next level is ${wad.findNextMap(map.name)}`);
			if(query.has('random-level'))
			{
				location.reload();
			}
			break;
		case 'Light': // todo
			break;

		case 'Telpt':
			if(dot < 0)
			for(const room of level.tags.get(linedef.tag))
			{
				if(room.destination)
				{
					const flipped = flipVertex(map, {x:room.destination.x, y: room.destination.y});
					teleporting = true;
					camera.position.x = flipped.x;
					camera.position.y = yCam = room.floorHeight + 48;
					camera.position.z = flipped.y;
					camera.rotation.x = 0;
					camera.rotation.z = 0;
					camera.rotation.y = (Math.PI / 2) * ((-90 + room.destination.angle) / 90);
					xSpeed = 0;
					ySpeed = 0;
					ignore = 18;
					break;
				}
			}
			break;
	}
};

let sThen = 0;

class Line
{
	static lines = new Map;

	static get(map, linedef)
	{
		if(!this.lines.has(linedef))
		{
			this.lines.set(linedef, new Line(map, linedef));
		}

		return this.lines.get(linedef);
	}

	constructor(map, linedef)
	{
		this.map = map;
		this.linedef = linedef;
		Object.freeze(this);
	}

	front(x, y)
	{
		const from = this.from;
		const to   = this.to;

		const pos  = [(from.y + to.y) / 2, (from.x + to.x) / 2]; // [y, x]
		const vec  = [pos[0] - y, pos[1] - x]; // [y, x]
		const mag  = Math.hypot(...vec);

		vec[0] /= -mag;
		vec[1] /= -mag;

		if(this.dotNormal(...vec) > 0)
		{
			return this.right;
		}
		else
		{
			return this.left;
		}
	}

	get normal()
	{
		const from = this.from;
		const to   = this.to;

		const vec  = [from.x - to.x, to.y - from.y]; // [y, x] (switched up for normal)
		const mag  = Math.hypot(...vec);

		vec[0] /= mag;
		vec[1] /= mag;

		return vec;
	}

	dotNormal(y, x)
	{
		const normal = this.normal;
		return y * normal[0] + x * normal[1];
	}

	get right()
	{
		return Side.get(this.map, this.linedef);
	}

	get left()
	{
		return Side.get(this.map, this.linedef, true);
	}

	get from()
	{
		return this.map.vertex(this.linedef.from);
	}

	get to()
	{
		return this.map.vertex(this.linedef.to);
	}
}

class Side
{
	static sides = new Map;

	static get(map, linedef, isLeft = false)
	{
		if(!this.sides.has(linedef))
		{
			this.sides.set(linedef, new Map);
		}

		if(!this.sides.get(linedef).has(isLeft))
		{
			this.sides.get(linedef).set(isLeft, new Side(map, linedef, isLeft));
		}

		return this.sides.get(linedef).get(isLeft);
	}

	constructor(map, linedef, isLeft = false)
	{
		this.map = map;
		this.linedef = linedef;
		this.isLeft = isLeft;
		Object.freeze(this);
	}

	get normal()
	{
		const from = this.from;
		const to   = this.to;

		const vec  = [from.x - to.x, to.y - from.y]; // [y, x] (switched up for normal)
		const mag  = Math.hypot(...vec);

		vec[0] /= mag;
		vec[1] /= mag;

		return vec;
	}

	dotNormal(y, x)
	{
		const normal = this.normal;
		return y * normal[0] + x * normal[1];
	}

	isFacing(y, x)
	{
		const from = this.from;
		const to   = this.to;

		const pos  = [(from.y + to.y) / 2, (from.x + to.x) / 2]; // [y, x]
		const vec  = [pos[0] - y, pos[1] - x]; // [y, x]
		const mag  = Math.hypot(...vec);

		vec[0] /= -mag;
		vec[1] /= -mag;

		return this.dotNormal(...vec) > 0;
	}

	isVisibleAroundCorner(x, y, otherSide)
	{
		const n = this.nearest(x, y, false);
		const eVec = [n.y - y, n.x - x];
		const eMag = Math.hypot(...eVec);

		eVec[0] /= eMag;
		eVec[1] /= eMag;

		const fVec = [n.y - otherSide.from.y, n.x - otherSide.from.x];
		const tVec = [n.y - otherSide.to.y,   n.x - otherSide.to.x];

		const fMag = Math.hypot(...fVec);
		const tMag = Math.hypot(...tVec);

		fVec[0] /= fMag;
		fVec[1] /= fMag;
		tVec[0] /= tMag;
		tVec[1] /= tMag;

		const fDot = fVec[0] * eVec[0] + fVec[1] * eVec[1];
		const tDot = tVec[0] * eVec[0] + tVec[1] * eVec[1];

		const ep = Number.EPSILON * 1000;

		return fDot > ep || tDot > ep;
	}

	nearest(x, y, clamped = false)
	{
		const from = this.from;
		const to   = this.to;

		return nearestPointOnLine(x, y, from.x, from.y, to.x, to.y, clamped);
	}

	frontRoom(x, y)
	{
		const sidedef = this.map.sidedef(
			(this.isFacing(y, x) && !this.isLeft) ? this.linedef.right : this.linedef.left
		);

		return level.rooms.get(sidedef.sector);
	}

	backRoom(x, y)
	{
		const sidedef = this.map.sidedef(
			(this.isFacing(y, x) && !this.isLeft) ? this.linedef.left : this.linedef.right
		);
		return sidedef && level.rooms.get(sidedef.sector);
	}

	get from()
	{
		return this.map.vertex(this.isLeft ? this.linedef.to : this.linedef.from);
	}

	get to()
	{
		return this.map.vertex(this.isLeft ? this.linedef.from : this.linedef.to);
	}

	passable(x, y)
	{
		if(this.linedef.flags & 0b1)
		{
			return false;
		}

		const frontRoom = this.frontRoom(x, y);
		const backRoom = this.backRoom(x, y);

		if(!backRoom)
		{
			return false;
		}

		if(backRoom.floorHeight - frontRoom.floorHeight > 32)
		{
			return false;
		}

		if(backRoom.ceilingHeight - backRoom.floorHeight < 48)
		{
			return false;
		}

		return true;
	}
}

const simulate = (now) => {
	setTimeout(() => simulate(performance.now()), 0);

	if(paused > 0)
	{
		paused--;
	}
	else if(paused === 0)
	{
		// controls.isLocked = true;
		return;
	}

	const delta = Math.min(32, now - sThen);

	if(delta < 16) return;
	sThen = now;

	const ticFrac = (delta/1000) / (1/35);

	if(!camera || !level || !level.rooms) return;

	for(const room of level.rooms.values())
	{
		room.simulate(delta);
	}

	level.simulate(delta, camera);

	const hCam = Math.atan2(camDir.z, camDir.x);
	const vCam = camDir.y;

	const xImpulse = ignore ? 0 : Number(moveRight) - Number(moveLeft);
	const yImpulse = ignore ? 0 : Number(moveBackward) - Number(moveForward);

	if(ignore > 0)
	{
		ignore--;
	}

	const impulseDir = Math.atan2(yImpulse, 0.75 * xImpulse) + hCam + Math.PI/2;
	const impulseMag = Math.hypot(yImpulse, 0.75 * xImpulse);

	const xSpeedChange = Math.cos(impulseDir) * impulseMag * 0.03125 * ticFrac;
	const ySpeedChange = Math.sin(impulseDir) * impulseMag * 0.03125 * ticFrac;

	xSpeed += xSpeedChange * 40;
	ySpeed += ySpeedChange * 40;

	xSpeed *= 0.90625 ** ticFrac;
	ySpeed *= 0.90625 ** ticFrac;

	const entityPos = unflipVertex(map, {x: camera.position.x, y: camera.position.z});
	const lines = map.blocksNearPoint(entityPos.x, entityPos.y);

	const xCam  = camera.position.x;
	const zCam  = camera.position.z;

	const speedMag  = Math.hypot(ySpeed, xSpeed);

	const speedNVec = [-ySpeed / speedMag, xSpeed / speedMag];
	const speedDir  = Math.atan2(...speedNVec);

	const speedCNVec = [ySpeed / speedMag, xSpeed / speedMag];
	const speedCDir  = Math.atan2(...speedCNVec);

	const solidLines   = new Set;

	const radius = 16;

	for(const l of lines)
	{
		const linedef = map.linedef(l);
		const line  = Line.get(map, linedef);
		const front = line.front(entityPos.x, entityPos.y);

		const from = map.vertex(linedef.from);
		const to   = map.vertex(linedef.to);

		const flippedFrom = flipVertex(map, from);
		const flippedTo   = flipVertex(map, to);

		const preNearest = nearestPointOnLine(
			xCam, zCam,
			flippedFrom.x, flippedFrom.y,
			flippedTo.x, flippedTo.y,
			true,
		);

		const nearest = nearestPointOnLine(
			xCam + xSpeed, zCam + ySpeed,
			flippedFrom.x, flippedFrom.y,
			flippedTo.x, flippedTo.y,
			true,
		);

		const lineMag   = Math.hypot(to.y - from.y, to.x - from.x);
		const linePos   = [(to.y + from.y) / 2, (to.x + from.x) / 2]; // [y, x]

		const lineVec   = [(to.y - from.y) / lineMag, (to.x - from.x) / lineMag]; // [y, x]
		const lineNVec  = [lineVec[1], lineVec[0]]; // [y, x]
		const lineNDot  = lineNVec[0] * (speedMag ? ySpeed/speedMag : 0) + lineNVec[1] * (speedMag ? xSpeed/speedMag : 0);

		const lineTVec  = [(zCam + -preNearest.y) / preNearest.d, (xCam + -preNearest.x) / preNearest.d]; // [y, x]
		const lineTDot  = lineTVec[0] * (speedMag ? ySpeed/speedMag : 0) + lineTVec[1] * (speedMag ? xSpeed/speedMag : 0);

		const rightSide = map.sidedef(linedef.right);
		const leftSide  = linedef.left > -1 && map.sidedef(linedef.left);

		const rSector   = map.sector(rightSide.sector);
		const lSector   = leftSide.sector > -1 && map.sector(leftSide.sector);

		const rRoom     = level.rooms.get(rSector.index);
		const lRoom     = lSector && level.rooms.get(lSector.index);
		const room      = lineNDot < 0 ? rRoom : lRoom;
		const oRoom     = lineNDot > 0 ? rRoom : lRoom;

		let passable = !(linedef.flags & 0b1);

		const footPosition = camera.position.y - 48;

		if(passable && (
			// (oRoom.floorHeight - footPosition >= 32 && Math.abs(room.floorHeight - oRoom.floorHeight) >= 32)
			(oRoom.floorHeight - footPosition >= 32)
			|| (oRoom.ceilingHeight - footPosition <= 32)
			|| Math.abs(oRoom.ceilingHeight - oRoom.floorHeight) < 48
			|| Math.abs(oRoom.ceilingHeight - room.floorHeight) < 48
		)){
			passable = false;
		}

		if(nearest.d > radius || nearest.t < 0 || nearest.t > 1) continue;

		if(!passable)
		{
			solidLines.add({
				nearest,
				linedef,
				front,
				from,
				to,
				preNearest,
				normal: lineNVec,
				dot: lineTDot,
				nDot: lineNDot,
				pos: linePos
			});
		}

		if(speedMag)
		{
			if(linedef.actionMeta && linedef.actionMeta.modifier.indexOf('S') > -1)
			{
				if(lineNDot < 0)
				{
					room && room.flipSwitch(linedef);
					ldAction(linedef, room, oRoom, lineNDot);
				}
			}

			if(passable && linedef.actionMeta && linedef.actionMeta.modifier.indexOf('W') > -1)
			{
				ldAction(linedef, room, oRoom, lineNDot);
			}

			if(linedef.actionMeta && linedef.actionMeta.modifier.indexOf('G') > -1)
			{
				ldAction(linedef, room, oRoom, lineNDot);
			}
		}
	}

	const sorted = [...solidLines.values()].sort((i,j) => Math.sign( i.preNearest.d - j.preNearest.d ));

	if(!noClip)
	{
		if(speedMag && !teleporting)
		{
			if(sorted.length === 1)
			{
				const nearest = sorted[0].nearest;

				if(nearest.d < radius && nearest.t > 0 && nearest.t < 1)
				{
					const line = Line.get(map, sorted[0].linedef);
					const side = line.right.isFacing(entityPos.y, entityPos.x)
						? line.right
						: line.left;

					const nearestLineVec = [zCam - nearest.y, xCam - nearest.x];
					const nearestLineDir = Math.atan2(...nearestLineVec);

					const fVec = [entityPos.y - sorted[0].from.y, entityPos.x - sorted[0].from.x];
					const tVec = [entityPos.y - sorted[0].to.y,   entityPos.x - sorted[0].to.x];
					const fMag = Math.hypot(...fVec);
					const tMag = Math.hypot(...tVec);
					fVec[0] /= fMag;
					fVec[1] /= fMag;
					tVec[0] /= tMag;
					tVec[1] /= tMag;

					const fDot = speedNVec[0] * fVec[0] + speedNVec[1] * fVec[1];
					// const tDot = speedNVec[0] * tVec[0] + speedNVec[1] * tVec[1];

					const endPoint = fDot < 0 ? sorted[0].from : sorted[0].to;
					const lineIds = map.blocksNearPoint(endPoint.x, endPoint.y);

					const sides = [];

					for(const id of lineIds)
					{
						const linedef = map.linedef(id);

						if(linedef === sorted[0].linedef || (linedef.from !== endPoint.index && linedef.to !== endPoint.index))
						{
							continue;
						}

						const line = new Line(map, linedef);

						sides.push(line.right, line.left);
					}

					const facing = sides
					.filter(s =>
						s.isFacing(entityPos.y, entityPos.x)
						&& side.isVisibleAroundCorner(entityPos.x, entityPos.y, s)
						&& !s.passable(entityPos.x, entityPos.y))
					.sort((s, t) => s.dotNormal(...side.normal) - t.dotNormal(...side.normal));

					if(facing[0])
					{
						const backRoom = facing[0].backRoom(entityPos.x, entityPos.y);

						// console.log(backRoom && backRoom.index);

						const s = facing[0].dotNormal(...side.normal);
						const c = Math.sqrt(1 - s**2);
						const h = Math.sqrt((1 - c) / 2);

						const n = facing[0].nearest(entityPos.x, entityPos.y, true);

						if(s < 0 && h > 0 && n.d < radius / h)
						{
							xSpeed -= Math.cos(speedCDir) * Math.min(radius / h, speedMag);
							ySpeed -= Math.sin(speedCDir) * Math.min(radius / h, speedMag);
						}
						else
						{
							xSpeed += Math.cos(nearestLineDir) * Math.min(radius - nearest.d, speedMag);
							ySpeed += Math.sin(nearestLineDir) * Math.min(radius - nearest.d, speedMag);
						}
					}
					else
					{
						xSpeed += Math.cos(nearestLineDir) * Math.min(radius - nearest.d, speedMag);
						ySpeed += Math.sin(nearestLineDir) * Math.min(radius - nearest.d, speedMag);
					}


				}
			}
			else if(sorted.length > 1)
			{
				const dotA = sorted[0].dot;
				const dotB = sorted[1].dot;

				if(dotA < 0 || dotB < 0)
				{
					let vertex;

					if(sorted[0].linedef.from === sorted[1].linedef.to || sorted[0].linedef.from === sorted[1].linedef.from)
					{
						vertex = level.map.vertex(sorted[0].linedef.from);
					}
					else if(sorted[0].linedef.to === sorted[1].linedef.from || sorted[0].linedef.to === sorted[1].linedef.to)
					{
						vertex = level.map.vertex(sorted[0].linedef.to);
					}

					const nDotA = sorted[0].nDot;
					const nDotB = sorted[1].nDot;
					const normalA = [sorted[0].normal[0] * -Math.sign(nDotA), sorted[0].normal[1] * -Math.sign(nDotA)];
					const normalB = [sorted[1].normal[0] * -Math.sign(nDotB), sorted[1].normal[1] * -Math.sign(nDotB)];

					const gNormalA = [sorted[0].normal[0], sorted[0].normal[1]];
					const gNormalB = [sorted[1].normal[0], sorted[1].normal[1]];

					const dot = normalA[0] * normalB[0] + normalA[1] * normalB[1];
					const sum = [normalA[0] + normalB[0], normalA[1] + normalB[1]];
					const mag = Math.hypot(sum[0], sum[1]);
					const avg = [sum[0] / mag, sum[1] / mag];

					const sinHalf = normalA[0] * avg[0] + normalA[1] * avg[1];

					if(vertex)
					{
						const dif = [
							-(sorted[0].pos[0] - sorted[1].pos[0]),
							-(sorted[0].pos[1] - sorted[1].pos[1]),
						];

						const mag = Math.hypot(...dif);
						const vec = [dif[0] / mag, dif[1] / mag];

						const flipped = flipVertex(map, vertex);

						const concDot = -normalA[0] * vec[0] + normalA[1] * vec[1];
						const concave = 0 < concDot;

						if(dot === 0)
						{
							if(concave)
							{
								xSpeed = 0;
								ySpeed = 0;
							}
							else
							{
								// const sDot = avg[0] * speedNVec[0] + avg[1] * speedNVec[1];
								// if(sDot < 0)
								// {
								// }

								const vec = [zCam - flipped.y, xCam - flipped.x];
								const dir = Math.atan2(...vec);

								camera.position.x += Math.cos(dir) * Math.min(radius - sorted[0].nearest.d) + 0.1;
								camera.position.z += Math.sin(dir) * Math.min(radius - sorted[0].nearest.d) + 0.1;
							}
						}
						else if(dot === 1)
						{
							const dir = Math.atan2(zCam - sorted[0].nearest.y, xCam - sorted[0].nearest.x);

							xSpeed += Math.cos(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);
							ySpeed += Math.sin(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);

						}
						else if(dot < 0)
						{
							const sum = [normalA[0] + normalB[0], normalA[1] + normalB[1]];
							const mag = Math.hypot(sum[0], sum[1]);
							const avg = [sum[0] / mag, sum[1] / mag];

							const concDot = -normalA[0] * vec[0] + normalA[1] * vec[1];
							const concave = 0 < concDot;

							if(concave)
							{
								if(sorted[0].front.isVisibleAroundCorner(entityPos.x, entityPos.y, sorted[1].front))
								{
									console.log(dot);
									// xSpeed += avg[1] * ((radius - sorted[0].nearest.d) / sinHalf) + 0.1;
									// ySpeed += avg[0] * ((radius - sorted[0].nearest.d) / sinHalf) + 0.1;
									camera.position.x = flipped.x + avg[1] * (radius / sinHalf) + 0.1;
									camera.position.z = flipped.y + avg[0] * (radius / sinHalf) + 0.1;
									xSpeed = 0;
									ySpeed = 0;
								}
								else
								{
									console.log(`${sorted[0].front.linedef.index} occludes ${sorted[1].front.linedef.index}`)
								}
							}
							else
							{
								// const sDot = avg[0] * speedNVec[0] + avg[1] * speedNVec[1];
								// if(sDot < 0)
								// {
								// }

								const vec = [zCam - flipped.y, xCam - flipped.x];
								const dir = Math.atan2(...vec);

								camera.position.x += Math.cos(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);
								camera.position.z += Math.sin(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);
							}
						}
						else if(dot < 1)
						{
							xSpeed += avg[1] * ((radius - sorted[0].nearest.d) / sinHalf) + 0.1;
							ySpeed += avg[0] * ((radius - sorted[0].nearest.d) / sinHalf) + 0.1;
						}
					}
				}
			}

			camera.position.x += xSpeed;
			camera.position.z += ySpeed;
		}
	}
	else
	{
		camera.position.x += xSpeed * (1-Math.abs(vCam));
		camera.position.z += ySpeed * (1-Math.abs(vCam));
		camera.position.y += speedMag * -vCam * yImpulse * 0.5;
	}

	if(Math.abs(camera.position.y - yCam) < 1)
	{
		camera.position.y = yCam;
	}

	if(!noClip)
	{
		if(camera.position.y < yCam)
		{
			if(Math.abs(camera.position.y - yCam) > 24)
			{
				camera.position.y = yCam - 24 * -Math.sign(camera.position.y - yCam);
			}

			camera.position.y += 0.25 * (yCam - camera.position.y);
			yVel = 0;
		}
		else if(camera.position.y > yCam)
		{
			yVel -= 0.25;
			camera.position.y += yVel;
		}
		else
		{
			yVel = 0;
		}
	}

	for(const [sample, {xPosition, yPosition, stereo, gain}] of samplesPlaying)
	{
		if(xPosition === undefined || yPosition === undefined) continue;
		const unflipped = unflipVertex(map, {x: xPosition, y: yPosition});
		const mag = Math.hypot(unflipped.y - camera.position.z, unflipped.x - camera.position.x);
		if(mag === 0) return;
		const vec = [unflipped.y - camera.position.z, unflipped.x - camera.position.x] // y, x
		const dot = ((vec[0]/mag) * camDir.x - (vec[1]/mag) * camDir.z);
		stereo.pan.value = dot;
		gain.gain.value = 0.25 / Math.sqrt(mag / 0x80);
	}

	if(mainScene.background)
	{
		mainScene.background.repeat.set(-camera.aspect/2, 0.85);
		mainScene.background.offset.set((-4*hCam)/(Math.PI*2), vCam + -0.15);
	}

	teleporting = false;
};

simulate(performance.now());

let rThen = 0;

const render = (now) => {
	requestAnimationFrame(render);

	camera.getWorldDirection(camDir);

	const delta = Math.min(32, now - rThen);

	if(delta < 16) return;

	rThen = now;

	const flipped = unflipVertex(map, {
		x: camera.position.x,
		y: camera.position.z,
	});

	const sector = map.bspPoint(flipped.x, flipped.y);
	const room = level.rooms.get(sector.index);
	room.show();

	if(sector)
	{
		yCam = room.floorHeight + 48;
	}

	if(map.lumps.GL_PVS && map.lumps.GL_PVS.size)
	{
		const ssector = map.bspPoint(flipped.x, flipped.y, true);
		const visible = map.glpvsVisibleFrom(ssector.index);

		for(const room of level.rooms.values())
		{
			if(visible.has(room.index)) room.show();
			else room.hide();
		}
	}

	renderer.render(mainScene, camera);
}

const onWindowResize = () => {
	if(!camera) return;
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
}

const onFileDropped = (event) => {
	console.log(event);
};

const start = async () => {
	await setup();
	onWindowResize();
	requestAnimationFrame(render);
}

start();
