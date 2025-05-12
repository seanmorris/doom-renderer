'use strict';

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Wad, WadLoader } from 'doom-parser/Wad.mjs'
import favicon from './favicon.ico';
import { unflipVertex, flipVertex, samplesPlaying } from './helpers';
import { Level } from './Level';

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
let paused = false;

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

	return {x, y, t};
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

	const x = x1 + c *dx;
	const y = y1 + c *dy;

	return {x, y, t:c};
};

// todo: finish implementing this
const rayLinedefs = (map, x, y, angle, distance) => {
	const xEnd = x + Math.sin(angle) * distance;
	const yEnd = y + Math.cos(angle) * distance;

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
	];

	const iWadList = iwads.map(
		async iwad => await (await fetch(prefix + iwad)).arrayBuffer()
	);

	const pWadList = [];

	let randomMap = null;
	let selectedWad = query.has('wad') ? query.get('wad') : 'DOOM1.WAD';

	if(query.has('random-level'))
	{
		const wadIndex = await (await fetch(prefix + '/wads.json')).json();
		const wadList = wadIndex.wads;
		const randomIndex = Math.floor(Math.random() * wadList.length);
		selectedWad = wadList[randomIndex].wad;
	}

	let wadUrl = new URL(selectedWad, location.origin);
	let wadIsExternal = false;

	if(wadUrl.origin === location.origin)
	{
		wadUrl = 'https://level-archive.seanmorr.is/' + wadUrl.pathname.substr(1);
	}
	else
	{
		wadIsExternal = true;
	}

	if(selectedWad)
	{
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
		throw new Error(`Map ${String(wadUrl).substr(6)} not found.`);
	}

	map = wad.loadMap(selectedMap);

	const originalMapData = map.splitMap(selectedMap);
	let mapData = originalMapData;
	const single = new Wad(mapData);

	if(!single.getLumpByName('GL_NODES'))
	{
		ms.setText(`${String(wadUrl).substr(6)}#${selectedMap}\nBuilding BSP Nodes`);

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
				ms.setText(`${String(wadUrl).substr(6)}#${selectedMap}\nPortal Sight-Checks Remaining: ${event.data.status}`);
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
				paused = !paused;
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

	ms.setText(`${String(wadUrl).substr(6)}#${selectedMap}\nNow Starting...`);

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
		link.href = location.origin + location.pathname + '?wad=' + String(wadUrl).substr(6) + '&map=' + selectedMap;
		link.innerText = '?wad=' + String(wadUrl).substr(6) + '&map=' + selectedMap;
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
					camera.position.x = flipped.x;
					camera.position.y = yCam = room.floorHeight + 48;
					camera.position.z = flipped.y;
					camera.rotation.x = 0;
					camera.rotation.z = 0;
					camera.rotation.y = (Math.PI / 2) * ((-90 + room.destination.angle) / 90);
					xSpeed = 0;
					ySpeed = 0;
					break;
				}
			}
			break;
	}
};

let sThen = 0;

const simulate = (now) => {
	setTimeout(() => simulate(performance.now()), 0);

	if(paused) return;

	const delta = Math.min(32, now - sThen);

	if(delta < 16) return;
	// if(delta < 1/35) return;

	sThen = now;

	if(!camera || !level || !level.rooms) return;

	for(const room of level.rooms.values())
	{
		room.simulate(delta);
	}

	level.simulate(delta, camera);

	const hCam = Math.atan2(camDir.z, camDir.x);
	const vCam = camDir.y;

	const xImpulse = Number(moveRight) - Number(moveLeft);
	const yImpulse = Number(moveBackward) - Number(moveForward);

	const impulseDir = Math.atan2(1.25 * yImpulse, xImpulse) + hCam + Math.PI/2;
	const impulseMag = Math.hypot(1.25 * yImpulse, xImpulse);

	const xSpeedChange = Math.cos(impulseDir) * impulseMag * 0.03125 * ((16/1000) / (1/35));
	const ySpeedChange = Math.sin(impulseDir) * impulseMag * 0.03125 * ((16/1000) / (1/35));

	xSpeed += xSpeedChange * 40;
	ySpeed += ySpeedChange * 40;

	xSpeed *= 0.90625 ** ((16/1000) / (1/35));
	ySpeed *= 0.90625 ** ((16/1000) / (1/35));

	const flipped = unflipVertex(map, {x: camera.position.x, y: camera.position.z,});
	const lines = map.blocksNearPoint(flipped.x, flipped.y);

	const xCam = camera.position.x;
	const zCam = camera.position.z;
	let wallHit = false;

	for(const l of lines)
	{
		const speedMag = Math.hypot(ySpeed, xSpeed);

		if(speedMag < 0.01) break;

		const speedDir = Math.atan2(ySpeed, xSpeed);
		const speedNVec = [xSpeed / speedMag / ySpeed / speedMag];
		const linedef = map.linedef(l);
		const from = map.vertex(linedef.from);
		const to = map.vertex(linedef.to);
		const flippedFrom = flipVertex(map, from);
		const flippedTo   = flipVertex(map, to);

		const intersection = lineIntersectsLine(
			xCam, zCam,
			xCam + Math.cos(speedDir) * speedMag, zCam + Math.sin(speedDir) * speedMag,
			flippedFrom.x, flippedFrom.y,
			flippedTo.x,   flippedTo.y
		);

		const rigthSide = map.sidedef(linedef.right);
		const leftSide = linedef.left > -1 && map.sidedef(linedef.left);

		const rSector = map.sector(rigthSide.sector);
		const lSector = leftSide.sector > -1 && map.sector(leftSide.sector);

		const rRoom = level.rooms.get(rSector.index);
		const lRoom = lSector && level.rooms.get(lSector.index);

		const fromDir  = Math.atan2(flippedFrom.y - zCam, flippedFrom.x - xCam);
		const xFromVec = Math.cos(fromDir);
		const yFromVec = Math.sin(fromDir);

		const toDir    = Math.atan2(flippedTo.y - zCam, flippedTo.x - xCam);
		const xToVec   = Math.cos(toDir);
		const yToVec   = Math.sin(toDir);

		// const fromDot  = (xCamVec * xFromVec + zCamVec * yFromVec);
		// const toDot    = (xCamVec * xToVec + zCamVec * yToVec);
		const fromDot  = (speedNVec[0] * xFromVec + speedNVec[1] * yFromVec);
		const toDot    = (speedNVec[0] * xToVec   + speedNVec[1] * yToVec);

		const lineMag  = Math.hypot(to.y - from.y, to.x - from.x);
		const lineDir  = Math.atan2(to.y - from.y, to.x - from.x);
		const lineVec  = [(to.y - from.y) / lineMag, (to.x - from.x) / lineMag]; // [y, x]
		const lineNVec = [lineVec[1], lineVec[0]]; // [y, x]
		const lineNDot = (lineNVec[0] * (ySpeed/speedMag) + lineNVec[1] * (xSpeed/speedMag));
		const room     = lineNDot < 0 ? rRoom : lRoom;
		const oRoom    = lineNDot > 0 ? rRoom : lRoom;

		let passable = !(linedef.flags & 0b00000001);

		if((camera.position.y === room.floorHeight && (camera.position.y - oRoom.floorHeight) < 24)
			|| (camera.position.y > room.floorHeight && (camera.position.y - oRoom.floorHeight) < 4)
			|| Math.abs(room.ceilingHeight - room.floorHeight) < 48
		){
			passable = false;
		}

		if(!oRoom || (
			(oRoom.ceilingHeight - oRoom.floorHeight) < 48
			|| (oRoom.ceilingHeight - oRoom.floorHeight) < 48
			|| (oRoom.ceilingHeight - room.floorHeight)  < 48
			|| (room.ceilingHeight  - oRoom.floorHeight) < 48
		)){
			passable = false;
		}

		if(noClip)
		{
			passable = true;
		}

		if(!passable)
		{
			const nearest = nearestPointOnLine(
				xCam + xSpeed, zCam + ySpeed,
				flippedFrom.x, flippedFrom.y,
				flippedTo.x, flippedTo.y,
			);

			const nearestLineVec = [zCam - nearest.y, xCam - nearest.x]
			const nearestLineDir = Math.atan2(...nearestLineVec);
			const nearestLineMag = Math.hypot(...nearestLineVec);

			const speedLineDot = (nearestLineVec[0] * ySpeed + nearestLineVec[1] * xSpeed);
			const margin = 0;

			if(speedLineDot <= 0 && 16 - nearestLineMag > 0 && nearest.t > (0 - margin) && nearest.t < (1 + margin))
			{
				console.log(
					'n',
					nearest,
					nearestLineMag,
					linedef,
					{xSpeed, ySpeed},
					nearestLineVec,
					Math.cos(nearestLineDir + Math.PI) * -(16 - nearestLineMag),
					Math.sin(nearestLineDir + Math.PI) * -(16 - nearestLineMag)
				);

				camera.position.x += Math.cos(nearestLineDir + Math.PI) * -(16-nearestLineMag);
				camera.position.z += Math.sin(nearestLineDir + Math.PI) * -(16-nearestLineMag);

				// camera.position.x += Math.cos(speedDir) * -(16-nearestLineMag);
				// camera.position.z += Math.sin(speedDir) * -(16-nearestLineMag);

				xSpeed = Math.cos(nearestLineDir + Math.PI) * -Math.min(16 - nearestLineMag, speedMag);
				ySpeed = Math.sin(nearestLineDir + Math.PI) * -Math.min(16 - nearestLineMag, speedMag);

				if(fromDot > 0)
				{
					xSpeed = Math.cos(lineDir) * -speedMag;
					ySpeed = Math.sin(lineDir) * -speedMag;
				}
				else if(toDot > 0)
				{
					xSpeed = Math.cos(lineDir) * speedMag;
					ySpeed = Math.sin(lineDir) * speedMag;
				}

				if(room && lineNDot < 0 && linedef.actionMeta && linedef.actionMeta.modifier.indexOf('S') > -1)
				{
					room.lastAction = linedef.actionMeta;
					room.flipSwitch(linedef);
					ldAction(linedef, room, oRoom, lineNDot);
					if(linedef.actionMeta.type === 'Exit')
					{
						console.log(`Next level is ${wad.findNextMap(map.name)}`);
						if(query.has('random-level'))
						{
							location.reload();
						}
					}
				}
			}
			else if(intersection)
			{
				console.log('i', intersection, linedef);

				camera.position.x += Math.cos(speedDir) * -Math.min(16 - speedMag * intersection.t, speedMag);
				camera.position.z += Math.sin(speedDir) * -Math.min(16 - speedMag * intersection.t, speedMag);

				if(fromDot > 0)
				{
					xSpeed = Math.cos(fromDir) * speedMag;
					ySpeed = Math.sin(fromDir) * speedMag;
				}
				else if(toDot > 0)
				{
					xSpeed = Math.cos(toDir) * speedMag;
					ySpeed = Math.sin(toDir) * speedMag;
				}
			}
		}
		else if(intersection)
		{
			if(linedef.actionMeta && linedef.actionMeta.modifier.indexOf('W') > -1)
			{
				ldAction(linedef, room, oRoom, lineNDot);
			}
		}
	}

	if(Math.abs(xSpeed) < 0.1) xSpeed = 0;
	if(Math.abs(ySpeed) < 0.1) ySpeed = 0;

	if(!noClip)
	{
		if(!wallHit)
		{
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
			if(!noClip)
			{
				if(visible.has(room.index)) room.show();
				else room.hide();
			}
			else
			{
				room.show();
			}
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
