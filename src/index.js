'use strict';

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { WadLoader } from 'doom-parser/Wad.mjs'

let camera, scene, renderer, light, controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let wad, map;
let yCam = 0;
let yVel = 0;

let noClip = false;

let lowRes = 0;

const things = new Set;

const textureLoader = new THREE.TextureLoader();

const flipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMax - (vertex.y - map.bounds.yMin)});
const unflipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMin - (vertex.y - map.bounds.yMax)});

class Room
{
	constructor(sector, scene)
	{
		this.floorHeight = sector.floorHeight;
		this.ceilingHeight = sector.ceilingHeight;

		this.originalFloorHeight = sector.floorHeight;
		this.originalCeilingHeight = sector.ceilingHeight;

		this.targetFloorHeight = sector.floorHeight;
		this.targetCeilingHeight = sector.ceilingHeight;

		this.moveSpeed = 0.15;

		this.floorFlat = sector.floorFlat;
		this.ceilingFlat = sector.ceilingFlat;
		this.lightLevel = sector.lightLevel;
		this.special = sector.special;
		this.tag = sector.tag;
		this.index = sector.index;

		this.sector = sector;
		this.scene = scene;

		this.ceilingPlanes = new Set;
		this.floorPlanes = new Set;

		this.middlePlanes = new Set;
		this.upperPlanes  = new Set;
		this.lowerPlanes  = new Set;

		this.linedefs = new Set;
		this.neighbors = new Set;

		this.isDoor = false;

		if(!tags.has(this.tag))
		{
			tags.set(this.tag, new Set);
		}

		this.timer = 0;

		tags.get(this.tag).add(this);
	}

	simulate(delta)
	{
		if(this.timer > 0)
		{
			this.timer--;
			return;
		}

		if(this.ceilingHeight !== this.targetCeilingHeight)
		{
			if(Math.abs(this.targetCeilingHeight - this.ceilingHeight) < delta * this.moveSpeed)
			{
				this.ceilingHeight = this.targetCeilingHeight;
			}
			else
			{
				this.ceilingHeight += delta * this.moveSpeed * Math.sign(this.targetCeilingHeight - this.ceilingHeight);
			}

			this.moveGeometry();
		}
		else if(this.ceilingHeight !== this.originalCeilingHeight)
		{
			this.targetCeilingHeight = this.originalCeilingHeight;
			this.timer = 60;
		}
	}

	openDoor()
	{
		if(this.timer)
		{
			return;
		}

		let lowest = Infinity;

		for(const neighbor of this.neighbors)
		{
			if(neighbor.ceilingHeight < lowest)
			{
				this.targetCeilingHeight = lowest = neighbor.ceilingHeight;
				this.timer = 15;
			}
		}
	}

	closeDoor()
	{
		if(this.timer)
		{
			return;
		}

		this.targetCeilingHeight = this.originalCeilingHeight;
	}

	moveCeiling(to)
	{
		this.targetCeilingHeight = to;
	}

	moveGeometry()
	{
		for(const plane of this.ceilingPlanes)
		{
			plane.position.y =  this.ceilingHeight - this.originalCeilingHeight;
		}

		for(const plane of this.middlePlanes)
		{
			const originalHeight = plane.userData.textureHeight;
			const rSector = plane.userData.rSector;
			const lSector = plane.userData.lSector;

			const rRoom = rooms.get(rSector.index);
			const lRoom = lSector && rooms.get(lSector.index);

			const maxFloor   = !lRoom ? rRoom.floorHeight   : Math.max(rRoom.floorHeight,   lRoom.floorHeight);
			const minCeiling = !lRoom ? rRoom.ceilingHeight : Math.min(rRoom.ceilingHeight, lRoom.ceilingHeight);

			const middleHeight = minCeiling - maxFloor;

			plane.material.map.repeat.y = middleHeight / originalHeight;
			plane.position.y = middleHeight/2 + maxFloor;
			plane.scale.y = middleHeight;
		}

		for(const plane of this.lowerPlanes)
		{
			const originalHeight = plane.userData.textureHeight;
			const rSector = plane.userData.rSector;
			const lSector = plane.userData.lSector;

			const rRoom = rooms.get(rSector.index);
			const lRoom = lSector && rooms.get(lSector.index);

			const maxFloor   = !lRoom ? rRoom.floorHeight   : Math.max(rRoom.floorHeight,   lRoom.floorHeight);
			const minFloor   = !lRoom ? rRoom.floorHeight   : Math.min(rRoom.floorHeight,   lRoom.floorHeight);

			const lowerHeight  = maxFloor   - minFloor;

			plane.material.map.repeat.y = lowerHeight / originalHeight;
			plane.position.y = lowerHeight/2 + minFloor;
			plane.scale.y = lowerHeight;
		}

		for(const plane of this.upperPlanes)
		{
			const originalHeight = plane.userData.textureHeight;
			const rSector = plane.userData.rSector;
			const lSector = plane.userData.lSector;

			const rRoom = rooms.get(rSector.index);
			const lRoom = lSector && rooms.get(lSector.index);

			const maxFloor   = !lRoom ? rRoom.floorHeight   : Math.max(rRoom.floorHeight,   lRoom.floorHeight);
			const minCeiling = !lRoom ? rRoom.ceilingHeight : Math.min(rRoom.ceilingHeight, lRoom.ceilingHeight);
			const maxCeiling = !lRoom ? rRoom.ceilingHeight : Math.max(rRoom.ceilingHeight, lRoom.ceilingHeight);

			const upperHeight  = maxCeiling - minCeiling;

			plane.material.map.repeat.y = upperHeight / originalHeight;
			plane.position.y = upperHeight/2 + minCeiling;
			plane.scale.y = upperHeight;
		}
	}

	async addWall(linedef, isLeftWall)
	{
		this.linedefs.add(linedef);

		if([1,26,27,28,31].includes(linedef.action) && isLeftWall)
		{
			this.isDoor = true;
		}

		if([2,90,103].includes(linedef.action))
		{
			for(const other of tags.get(linedef.tag))
			{
				other.isDoor = true;
			}
		}

		const right   = this.sector.map.sidedef(linedef.right);
		const left    = linedef.left > -1 && this.sector.map.sidedef(linedef.left);

		const sidedef = isLeftWall ? left : right;

		const rSector = map.sector(right.sector);
		const lSector = left && map.sector(left.sector);
		const sector  = this.sector;
		const other   = isLeftWall ? rSector : lSector;
		const oRoom   = other && other.index !== this.index && rooms.get(other.index);

		oRoom && this.neighbors.add(oRoom);

		const light   = (33 - Math.trunc(sector.lightLevel / 8));
		const height  = sector.ceilingHeight - sector.floorHeight;

		const upperUnpegged = linedef.flags & (1<<3);
		const lowerUnpegged = linedef.flags & (1<<4);

		const maxFloor   = !lSector ? rSector.floorHeight   : Math.max(rSector.floorHeight,   lSector.floorHeight);
		const minFloor   = !lSector ? rSector.floorHeight   : Math.min(rSector.floorHeight,   lSector.floorHeight);
		const minCeiling = !lSector ? rSector.ceilingHeight : Math.min(rSector.ceilingHeight, lSector.ceilingHeight);
		const maxCeiling = !lSector ? rSector.ceilingHeight : Math.max(rSector.ceilingHeight, lSector.ceilingHeight);

		const from = flipVertex(map, map.vertex(linedef.from));
		const to   = flipVertex(map, map.vertex(linedef.to));

		const length =  Math.hypot(to.y - from.y, to.x - from.x);
		const angle  = -Math.atan2(to.y - from.y, to.x - from.x);

		const xCenter = (from.x + to.x) / 2;
		const yCenter = (from.y + to.y) / 2;

		const middleHeight = minCeiling - maxFloor;
		const lowerHeight  = maxFloor   - minFloor;
		const upperHeight  = maxCeiling - minCeiling;

		if(isTextureName(sidedef.middle))
		{
			const texture = await loadTexture(this.sector.map.wad, sidedef.middle, light);
			const wadTexture = texture.userData.wadTexture;

			const material = new THREE.MeshBasicMaterial({map: texture});
			const geometry = new THREE.PlaneGeometry(length, 1, 1);
			const plane = new THREE.Mesh(geometry, material);

			plane.userData.textureHeight = middleHeight;
			plane.scale.y = middleHeight;

			if(wadTexture)
			{
				material.transparent = wadTexture.transparent;

				const hRepeat = length / wadTexture.width;
				const vRepeat = middleHeight / wadTexture.height;

				texture.repeat.set(hRepeat, vRepeat);
				plane.userData.textureHeight = wadTexture.height;

				if(lowerUnpegged)
				{
					texture.offset.set(
						right.xOffset / wadTexture.width,
						(wadTexture.height + -right.yOffset) / wadTexture.height
					);
				}
				else
				{
					texture.offset.set(
						right.xOffset / wadTexture.width,
						(wadTexture.height + -middleHeight + -right.yOffset) / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = middleHeight/2 + maxFloor;
			plane.rotation.y = angle + (isLeftWall ? Math.PI : 0);

			plane.userData.rSector = rSector;
			plane.userData.lSector = lSector;

			this.middlePlanes.add(plane);
			oRoom && oRoom.middlePlanes.add(plane);
			this.scene.add(plane);
		}

		if(isTextureName(sidedef.lower))
		{
			const texture = await loadTexture(wad, sidedef.lower, light);
			const material = new THREE.MeshBasicMaterial({map: texture});
			const geometry = new THREE.PlaneGeometry(length, 1, 1);
			const wadTexture = texture.userData.wadTexture;
			const plane = new THREE.Mesh(geometry, material);

			plane.userData.textureHeight = lowerHeight;
			plane.scale.y = lowerHeight;

			if(wadTexture)
			{
				material.transparent = wadTexture.transparent;

				const hRepeat = length / wadTexture.width;
				const vRepeat = lowerHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);
				plane.userData.textureHeight = wadTexture.height;

				if(!lowerUnpegged)
				{
					texture.center.set(0, 1);
					texture.offset.set(
						sidedef.xOffset / wadTexture.width,
						-sidedef.yOffset / wadTexture.height
					);
				}
				else
				{
					texture.center.set(0, 0);
					texture.offset.set(
						sidedef.xOffset / wadTexture.width,
						(sidedef.yOffset + -height + wadTexture.height) / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = lowerHeight/2 + minFloor;
			plane.rotation.y = angle + (isLeftWall ? Math.PI : 0);

			plane.userData.rSector = rSector;
			plane.userData.lSector = lSector;

			this.lowerPlanes.add(plane);
			oRoom && oRoom.lowerPlanes.add(plane);
			scene.add(plane);
		}

		const rSky = rSector.ceilingFlat === 'F_SKY1';
		const lSky = lSector.ceilingFlat === 'F_SKY1';

		if(!(rSky && lSky) && isTextureName(sidedef.upper))
		{
			const texture = await loadTexture(wad, sidedef.upper, light);
			const material = new THREE.MeshBasicMaterial({map: texture});
			const geometry = new THREE.PlaneGeometry(length, 1, 1);
			const wadTexture = texture.userData.wadTexture;
			const plane = new THREE.Mesh(geometry, material);

			plane.userData.textureHeight = upperHeight;
			plane.scale.y = upperHeight;

			if(wadTexture)
			{
				material.transparent = wadTexture.transparent;

				const hRepeat = length / wadTexture.width;
				const vRepeat = upperHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);
				plane.userData.textureHeight = wadTexture.height;

				if(upperUnpegged)
				{
					texture.center.set(0, 1);
				}

				texture.offset.set(
					sidedef.xOffset / wadTexture.width,
					-sidedef.yOffset / wadTexture.height
				);

				if(wadTexture.animation)
				{
					animatedWalls.add(plane);

					plane.userData.animation = wadTexture.animation;
					plane.userData.age = 0;

					const frameNames = wad.textureAnimation(wadTexture.animation);
					const frames = [];

					for(const frameName of frameNames)
					{
						const wadTexture = wad.texture(frameName);
						const url  = await wadTexture.decode(light);
						const texture = textureLoader.load(url);

						if(upperUnpegged)
						{
							texture.center.set(0, 1);
						}

						texture.repeat.set(hRepeat, vRepeat);

						texture.offset.set(
							sidedef.xOffset / wadTexture.width,
							-sidedef.yOffset / wadTexture.height
						);

						texture.wrapS = THREE.RepeatWrapping;
						texture.wrapT = THREE.RepeatWrapping;
						texture.colorSpace = THREE.SRGBColorSpace;

						frames.push(texture);
					}

					plane.userData.frames = frames;
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = upperHeight/2 + minCeiling;
			plane.rotation.y = angle + (isLeftWall ? Math.PI : 0);

			plane.userData.rSector = rSector;
			plane.userData.lSector = lSector;

			this.upperPlanes.add(plane);
			oRoom && oRoom.upperPlanes.add(plane);
			scene.add(plane);
		}
	}

	async addFlats(glSubsector)
	{
		const sector = this.sector;

		const lightLevel = 33 - Math.trunc(sector.lightLevel / 8);

		const original = glSubsector.vertexes();
		const vertexes = original.map(v => flipVertex(map, v));
		const Vector2s = vertexes.map(v => new THREE.Vector2(v.x, v.y));
		const backward = [...Vector2s].reverse();

		const floorShape = new THREE.Shape(Vector2s);
		const ceilingShape = new THREE.Shape(backward);

		const loader = wad.loader || wad;

		const floorFlat   = loader.flat(sector.floorFlat);
		const ceilingFlat = loader.flat(sector.ceilingFlat);

		const floorGeometry = new THREE.ShapeGeometry(floorShape);
		floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
			vertexes.map(vertex => [vertex.x, sector.floorHeight, vertex.y]).flat(), 3
		));

		const ceilingGeometry = new THREE.ShapeGeometry(ceilingShape);
		ceilingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
			backward.map(vertex => [vertex.x, sector.ceilingHeight, vertex.y]).flat(), 3
		));

		const floorTexture   = textureLoader.load(await floorFlat.decode(lightLevel));
		const ceilingTexture = textureLoader.load(await ceilingFlat.decode(lightLevel));

		floorTexture.magFilter   = THREE.NearestFilter;
		ceilingTexture.magFilter = THREE.NearestFilter;

		if(lowRes)
		{
			floorTexture.minFilter   = THREE.NearestFilter;
			ceilingTexture.minFilter = THREE.NearestFilter;
		}

		floorTexture.colorSpace   = THREE.SRGBColorSpace;
		ceilingTexture.colorSpace = THREE.SRGBColorSpace;

		floorTexture.wrapS   = THREE.RepeatWrapping;
		floorTexture.wrapT   = THREE.RepeatWrapping;
		ceilingTexture.wrapS = THREE.RepeatWrapping;
		ceilingTexture.wrapT = THREE.RepeatWrapping;

		const bounds = glSubsector.bounds;

		floorTexture.repeat.set(bounds.width / 64, bounds.height / 64);
		ceilingTexture.repeat.set(bounds.width / 64, bounds.height / 64);

		const floorMaterial   = new THREE.MeshBasicMaterial({map: floorTexture});
		const ceilingMaterial = new THREE.MeshBasicMaterial({map: ceilingTexture});

		const floor   = new THREE.Mesh(floorGeometry, floorMaterial);
		const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);

		if(floorFlat.animation)
		{
			animatedFlats.add(floor);

			floor.userData.animation = floorFlat.animation;
			floor.userData.age = 0;
			animatedFlats.add(floor);

			const frameNames = wad.flatAnimation(floorFlat.animation);
			const frames = [];

			for(const frameName of frameNames)
			{
				const flat = wad.flat(frameName);
				const url  = await flat.decode(lightLevel);
				const texture = textureLoader.load(url)
				texture.repeat.set(bounds.width / 64, bounds.height / 64);
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
				texture.colorSpace = THREE.SRGBColorSpace;

				frames.push(texture);
			}

			floor.userData.frames = frames;
		}

		if(ceilingFlat.animation)
		{
			animatedFlats.add(ceiling);

			ceiling.userData.animation = ceilingFlat.animation;
			ceiling.userData.age = 0;
			animatedFlats.add(ceiling);

			const frameNames = wad.flatAnimation(ceilingFlat.animation);
			const frames = [];

			for(const frameName of frameNames)
			{
				const flat = wad.flat(frameName);
				const url  = await flat.decode(lightLevel);
				const texture = textureLoader.load(url)
				texture.repeat.set(bounds.width / 64, bounds.height / 64);
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
				texture.colorSpace = THREE.SRGBColorSpace;

				frames.push(texture);
			}

			ceiling.userData.frames = frames;
		}

		let xfOffset = 0;
		let xcOffset = 0;
		let yfOffset = map.bounds.height % 64;
		let ycOffset = map.bounds.height % 64;

		setUV(floorGeometry, xfOffset, yfOffset);
		setUV(ceilingGeometry, xcOffset, ycOffset);

		this.ceilingPlanes.add(ceiling);
		this.floorPlanes.add(floor);

		this.scene.add(floor);

		if(sector.ceilingFlat !== 'F_SKY1')
		{
			this.scene.add(ceiling);
		}
	}
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

const setUV = (geometry, xOffset = 0, yOffset = 0) => {
	const pos = geometry.attributes.position;
	const box = new THREE.Box3().setFromBufferAttribute(pos);
	const size = new THREE.Vector3();
	box.getSize(size);

	const uv = [];
	const v3 = new THREE.Vector3();

	for(let i = 0; i < pos.count; i++)
	{
		v3.fromBufferAttribute(pos, i);
		v3.x += xOffset;
		v3.z += yOffset;
		v3.divide(size);
		uv.push(v3.x, v3.z);
	}

	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

function lineIntersectsLine(x1a, y1a, x2a, y2a, x1b, y1b, x2b, y2b)
{
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

	return [x, y, t];
}

const loadTexture = async (wad, name, lightLevel) => {
	const wadTexture = wad.texture(name.toUpperCase());

	if(wadTexture)
	{
		const texture = textureLoader.load(await wadTexture.decode(lightLevel));

		texture.userData.wadTexture = wadTexture
		texture.magFilter = THREE.NearestFilter;
		if(lowRes) texture.minFilter = THREE.NearestFilter;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;

		return texture;
	}

	return textureLoader.load('https://threejs.org/examples/textures/crate.gif');
}

const isTextureName = name => {
	return name
		&& name !== '-'
		&& name !== 'AASTINKY'
		&& name !== 'AASHITTY';
}

const animatedWalls = new Set;
const animatedFlats = new Set;

const rooms = new Map;
const tags = new Map;

async function setup()
{
	console.time('setup');

	const query = new URLSearchParams(location.search);

	const selectedWad = query.has('wad') ? query.get('wad') : 'DOOM1.GL.WAD';
	let wadUrl = new URL(selectedWad, location);

	if(wadUrl.origin === location.origin)
	{
		wadUrl = './wads/' + wadUrl.pathname.substr(1);
	}

	let prefix = '/wads';

	if(process.env.NODE_ENV === 'production')
	{
		prefix = '/doom-renderer/wads/'
	}

	wad = new WadLoader(
		await (await fetch(prefix + '/DOOM1.GL.WAD')).arrayBuffer(),
		await (await fetch(wadUrl)).arrayBuffer(),
		// await (await fetch(CHEX)).arrayBuffer(),
		// await (await fetch(HACKED)).arrayBuffer(),
		// await (await fetch(SKULLTAG)).arrayBuffer(),
	);

	const mapsNames = wad.findMaps();

	if(!mapsNames.length)
	{
		throw new Error('No maps found.');
	}

	const selectedMap = query.has('map') ? query.get('map') : mapsNames[0];

	if(!mapsNames.includes(selectedMap))
	{
		throw new Error(`Map ${selectedMap} not found.`);
	}

	map = wad.loadMap(selectedMap);

	const bounds = map.bounds;

	const lightLevel = 0;

	let playerStart = {x:0, y:0, z:0, angle: 0};

	if(!query.has('start'))
	{
		for(let i = 0; i < map.thingCount; i++)
		{
			const thing = map.thing(i);

			if(thing.type === 1)
			{
				playerStart = thing;
				break;
			}
		}
	}
	else
	{
		const [x, y, z, angle] = query.get('start').split(',').map(Number);
		playerStart = {x, y, z, angle: 90 + angle};
	}

	// Camera
	// const fov    = 67.5;
	const fov    = 45;
	const aspect = window.innerWidth / window.innerHeight;
	const near   = 0.1;
	const far    = 20000;

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

	const res = lowRes ? 1 / 8 : 1;

	const canvas = document.querySelector('#c');
	renderer = new THREE.WebGLRenderer( { canvas } );
	renderer.setClearColor(0xFFFFFF);
	renderer.setPixelRatio( window.devicePixelRatio * res);
	renderer.setSize(window.innerWidth * res, window.innerHeight * res);
	document.body.appendChild( renderer.domElement );

	window.addEventListener('resize', onWindowResize, false);

	// Controls.
	controls = new PointerLockControls(camera, renderer.domElement);
	document.addEventListener('click', () => controls.lock());

	controls.update();

	// Adding controls to camera (expected by AMI image widgets).
	camera.controls = controls;

	// Scene.
	scene = new THREE.Scene();

	scene.add( controls.object );

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
		}
	};

	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);

	const loadRooms = Array(map.sectorCount).fill().map((_,k)=>k).map(async i => {
		rooms.set(i, new Room(map.sector(i), scene));
	});

	const loadWalls = Array(map.linedefCount).fill().map((_,k)=>k).map(async i => {
		const linedef = map.linedef(i);

		const right   = map.sidedef(linedef.right);
		const left    = linedef.left >= 0 ? map.sidedef(linedef.left) : false;

		const rSector = map.sector(right.sector);
		const lSector = left && map.sector(left.sector);

		const rRoom   = rooms.get(rSector.index);
		const lRoom   = lSector && rooms.get(lSector.index);

		rRoom.addWall(linedef);
		lRoom && lRoom.addWall(linedef, true);

	});

	const loadFloors = Array(map.glSubsectorCount).fill().map((_,k)=>k).map(async i => {
		const glSubsector = map.glSubsector(i);
		const room = rooms.get(glSubsector.sector);
		room && room.addFlats(glSubsector);
		if(!room)
		{
			console.warn(glSubsector);
		}
	});

	const loadThings = Array(map.thingCount).fill().map((_,k)=>k).map(async i => {
		const thing = map.thing(i);

		if(thing.flags.multip || [2,3,4,10,12,15,24].includes(thing.type)) return;
		// if(thing.flags.multip || [2,3,4,10,12,15,116,127].includes(thing.type)) return;

		const spriteName = thing.meta.sprite;

		if(!spriteName || spriteName[0] === '-')
		{
			return;
		}

		const _sprite = wad.sprite(thing.meta.sprite);
		const sprite = [];

		for(const f in _sprite)
		for(const a in _sprite[f])
		{
			if(f > 0) break;

			const frame = _sprite[f][a];

			if(!frame) continue;

			const texture = textureLoader.load(await frame.picture.decode(lightLevel));
			sprite[f] = sprite[f] || [];
			sprite[f][a] = texture;

			texture.repeat.set(frame.flipped ? -1 : 1, 1);
			texture.wrapS      = THREE.RepeatWrapping;
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.magFilter  = THREE.NearestFilter;
			if(lowRes) texture.minFilter = THREE.NearestFilter;
		}

		const picture = (_sprite[0][0] || _sprite[0][1]).picture;
		const texture = (sprite[0][0] || sprite[0][1]);

		const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
		const geometry = new THREE.PlaneGeometry(picture.width, picture.height, 1);

		const plane = new THREE.Mesh(geometry, material);
		const pos   = flipVertex(map, thing);

		const sector = map.bspPoint(thing.x, thing.y)

		plane.position.x = pos.x;
		plane.position.z = pos.y;
		plane.position.y = sector.floorHeight + picture.height / 2;
		plane.rotation.y = 0;

		plane.userData.thing = thing;
		plane.userData.sprite = sprite;

		things.add(plane);
		scene.add(plane);
	});

	let hasSky = true;

	if(hasSky)
	{
		const texture = await loadTexture(wad, 'SKY1', lightLevel);
		texture.magFilter = THREE.NearestFilter;
		if(lowRes) texture.minFilter = THREE.NearestFilter;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		scene.background = texture;
	}

	await Promise.all([...loadRooms, ...loadWalls, ...loadFloors, ...loadThings]);

	console.log( await wad.picture('SHOTA0').decode() )
	console.log( await wad.hash() )

	console.timeEnd('setup');
}

let then = 0;

const camDir = new THREE.Vector3();

let xSpeed = 0;
let ySpeed = 0;

function render(now)
{
	requestAnimationFrame(render);

	const delta = Math.min(32, now - then);

	if(delta < 16)
	{
		return;
	}

	for(const room of rooms.values())
	{
		if(!room.isDoor)
		{
			continue;
		}

		room.simulate(delta);
	}

	then = now;

	const flipped = unflipVertex(map, {
		x: camera.position.x,
		y: camera.position.z,
	});

	const sector = map.bspPoint(flipped.x, flipped.y);

	camera.getWorldDirection(camDir);

	const hCam = Math.atan2(camDir.z, camDir.x);
	const vCam = camDir.y;

	const xImpulse = Number(moveRight) - Number(moveLeft);
	const yImpulse = Number(moveBackward) - Number(moveForward);

	const impulseDir = Math.atan2(yImpulse, xImpulse) + hCam + Math.PI/2;
	const impulseMag = Math.hypot(yImpulse, xImpulse);

	const xSpeedChange = Math.cos(impulseDir) * impulseMag * 0.03125 * ( (delta/1000)/(1/35) );
	const ySpeedChange = Math.sin(impulseDir) * impulseMag * 0.03125 * ( (delta/1000)/(1/35) );

	xSpeed += xSpeedChange * 50;
	ySpeed += ySpeedChange * 50;

	xSpeed *= 0.90625;
	ySpeed *= 0.90625;

	const lines = map.blocksNearPoint(flipped.x, flipped.y);

	const xCam = camera.position.x;
	const zCam = camera.position.z;

	const xCamVec = Math.cos(impulseDir);
	const zCamVec = Math.sin(impulseDir);

	const speedMag = Math.hypot(ySpeed, xSpeed);

	if(speedMag < 0.1)
	{
		xSpeed = 0;
		ySpeed = 0;
	}

	if(speedMag)
	for(const l of lines)
	{
		const speedDir = Math.atan2(ySpeed, xSpeed);
		const linedef = map.linedef(l);
		const from = map.vertex(linedef.from);
		const to = map.vertex(linedef.to);
		const flippedFrom = flipVertex(map, from);
		const flippedTo   = flipVertex(map, to);

		const intersection = lineIntersectsLine(
			xCam, zCam,
			xCam + Math.cos(speedDir) * speedMag,
			zCam + Math.sin(speedDir) * speedMag,
			flippedFrom.x, flippedFrom.y,
			flippedTo.x, flippedTo.y
		);

		let passable = !(linedef.flags & 0b00000001);

		const rigthSide = map.sidedef(linedef.right);
		const leftSide = linedef.left > -1 && map.sidedef(linedef.left);

		const unflipped = unflipVertex(map, {x: xCam, y: zCam});
		const rSector = map.sector(rigthSide.sector);
		const lSector = leftSide.sector > -1 && map.sector(leftSide.sector);

		const rRoom = rooms.get(rSector.index);
		const lRoom = lSector && rooms.get(lSector.index);

		if(sector.floorHeight - rRoom.floorHeight < -24
			|| Math.abs(rRoom.ceilingHeight - rRoom.floorHeight) < 48
		){
			passable = false;
		}

		if(!lRoom || (
			(sector.floorHeight - lRoom.floorHeight) < -24
			|| (lRoom.ceilingHeight - lRoom.floorHeight) < 48
			|| (lRoom.ceilingHeight - lRoom.floorHeight) < 48
			|| (lRoom.ceilingHeight - rRoom.floorHeight) < 48
			|| (rRoom.ceilingHeight - lRoom.floorHeight) < 48
		)){
			passable = false;
		}

		if(noClip)
		{
			passable = true;
		}

		const fromDir  = Math.atan2(flippedFrom.y - zCam, flippedFrom.x - xCam);
		const xFromVec = Math.cos(fromDir);
		const yFromVec = Math.sin(fromDir);

		const toDir    = Math.atan2(flippedTo.y - zCam, flippedTo.x - xCam);
		const xToVec   = Math.cos(toDir);
		const yToVec   = Math.sin(toDir);

		const fromDot  = (xCamVec * xFromVec + zCamVec * yFromVec) / 2;
		const toDot    = (xCamVec * xToVec + zCamVec * yToVec) / 2;

		const lineMag  = Math.hypot(to.y - from.y, to.x - from.x);
		const lineVec  = [(to.y - from.y) / lineMag, (to.x - from.x) / lineMag]; // [y,x]
		const lineNVec = [lineVec[1], lineVec[0]]; // [y,x]
		const lineNDot = (lineNVec[0] * (ySpeed/speedMag) + lineNVec[1] * (xSpeed/speedMag)) / 2;
		const oRoom    = lineNDot > 0 ? rRoom : lRoom;

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

			if(speedLineDot <= 0 && nearestLineMag < 16)
			{
				if(nearest.t > (0 - margin) && nearest.t < (1 + margin))
				{
					camera.position.x += Math.cos(nearestLineDir + Math.PI) * -(16-nearestLineMag);
					camera.position.z += Math.sin(nearestLineDir + Math.PI) * -(16-nearestLineMag);

					xSpeed += Math.cos(nearestLineDir + Math.PI) * -Math.min(16 - nearestLineMag, Math.abs(speedMag));
					ySpeed += Math.sin(nearestLineDir + Math.PI) * -Math.min(16 - nearestLineMag, Math.abs(speedMag));

					if(oRoom && oRoom.isDoor)
					{
						oRoom.openDoor();
					}
				}
			}
			else if(intersection)
			{
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
	}

	camera.position.x += xSpeed;
	camera.position.z += ySpeed;

	if(sector)
	{
		yCam = sector.floorHeight + 48;
	}

	if(Math.abs(camera.position.y - yCam) < 1)
	{
		camera.position.y = yCam;
	}

	if(camera.position.y < yCam)
	{
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

	scene.background.repeat.set(-camera.aspect/2, 0.85);
	scene.background.offset.set((-4*hCam)/(Math.PI*2), vCam + -0.15);

	for(const mesh of animatedFlats)
	{
		if(!mesh.userData.frames) continue;
		const frames = mesh.userData.frames;

		mesh.userData.age += delta;
		const time = Math.floor(mesh.userData.age / (16 * 12));
		const current = frames[time % frames.length];

		if(mesh.userData.current !== current)
		{
			mesh.userData.current = current;
			mesh.material.map = current;
			mesh.material.needsUpdate = true;
		}
	}

	for(const mesh of animatedWalls)
	{
		if(!mesh.userData.frames) continue;
		const frames = mesh.userData.frames;

		mesh.userData.age += delta;
		const time = Math.floor(mesh.userData.age / (16 * 12));
		const current = frames[time % frames.length];

		if(mesh.userData.current !== current)
		{
			mesh.userData.current = current;
			mesh.material.map = current;
			mesh.material.needsUpdate = true;
		}
	}

	for(const thing of things)
	{
		const camAngle = thing.rotation.y = Math.PI + Math.atan2(
			thing.position.x - camera.position.x,
			thing.position.z - camera.position.z,
		);

		const thingAngle = (Math.PI/2) + (-thing.userData.thing.angle * Math.PI) / 180;

		const relAngle = (camAngle + thingAngle) % (Math.PI * 2);

		const roundedAngle = 1 + (4 + Math.round(relAngle / (Math.PI / 4))) % 8;
		const sprite = thing.userData.sprite;
		const frame = 0;

		if(sprite[frame][0])
		{
			// console.log(roundedAngle, sprite[frame][0]);
		}
		else if(sprite[frame][roundedAngle])
		{
			thing.material.map = sprite[frame][roundedAngle];
			thing.material.needsUpdate = true;
		}
	}

	renderer.render(scene, camera);
}

function onWindowResize()
{
	if(!camera) return;
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
}

async function start()
{
	await setup();
	onWindowResize();
	requestAnimationFrame(render);
}

start();
