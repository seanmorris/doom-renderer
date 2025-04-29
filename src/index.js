'use strict';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Wad, WadLoader } from 'doom-parser/Wad.mjs'
import DOOM from './DOOM1.GL.WAD';
// import HACKED from './hacked.gl.wad';
// import FREEDOOM from './freedoom1.gl.wad';
// import SKULLTAG from './Skulltag-v097d5.gl.wad';

let camera, scene, renderer, light, controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
let wad, map;
let yCam = 0;
let yVel = 0;

const textureLoader = new THREE.TextureLoader();
const direction = new THREE.Vector3();

const flipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMax - (vertex.y - map.bounds.yMin)});
const unflipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMin - (vertex.y - map.bounds.yMax)});

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

const sectorLinedefs = new Map;
const linedefPlanes = new Map;

const loadTexture = async (wad, name, lightLevel) => {
	const wadTexture = wad.texture(name.toUpperCase());

	if(wadTexture)
	{
		const texture = textureLoader.load(await wadTexture.decode(lightLevel));

		texture.userData.wadTexture = wadTexture
		texture.magFilter = THREE.NearestFilter;
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

async function setup()
{
	console.time('setup');

	const query = new URLSearchParams(location.search);

	// wad = new Wad(DOOM);

	wad = new WadLoader(
		await (await fetch(DOOM)).arrayBuffer(),
		// await (await fetch(HACKED)).arrayBuffer(),
		// await (await fetch(FREEDOOM)).arrayBuffer(),
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

	const canvas = document.querySelector('#c');
	renderer = new THREE.WebGLRenderer( { canvas } );
	renderer.setClearColor(0xFFFFFF);
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
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
			case 'KeyQ':
				moveUp = true;
				break;
			case 'KeyE':
				moveDown = true;
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
			case 'KeyQ':
				moveUp = false;
				break;
			case 'KeyE':
				moveDown = false;
				break;
		}
	};

	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);

	// Lights.
	// light = new THREE.PointLight(0xffffff, 100.0);
	// light.position.set(-600, 600, 1000);
	// scene.add(light);

	const loadWalls = Array(map.linedefCount).fill().map((_,k)=>k).map(async i => {
		const linedef = map.linedef(i);

		const _from = map.vertex(linedef.from);
		const _to   = map.vertex(linedef.to);
		const from  = flipVertex(map, _from);
		const to    = flipVertex(map, _to);

		const right = map.sidedef(linedef.right);
		const left = linedef.left >= 0 ? map.sidedef(linedef.left) : false;

		const rSector = map.sector(right.sector);
		const lSector = left && map.sector(left.sector);

		const rLight = (33 - Math.trunc(rSector.lightLevel / 8));
		const lLight = lSector && (33 - Math.trunc(lSector.lightLevel / 8));

		const rSky = rSector.ceilingFlat === 'F_SKY1';
		const lSky = lSector.ceilingFlat === 'F_SKY1';

		if(!sectorLinedefs.has(rSector.index))
		{
			sectorLinedefs.set(rSector.index, new Set);
		}

		if(lSector && !sectorLinedefs.has(lSector.index))
		{
			sectorLinedefs.set(lSector.index, new Set);
		}

		if(!linedefPlanes.get(linedef.index))
		{
			linedefPlanes.set(linedef.index, new Set);
		}

		const _linedefPlanes  = linedefPlanes.get(linedef.index);
		const rSectorLinedefs = sectorLinedefs.get(rSector.index);

		rSectorLinedefs.add(i);

		if(lSector)
		{
			sectorLinedefs.get(lSector.index).add(i);
		}

		const xCenter = (from.x + to.x) / 2;
		const yCenter = (from.y + to.y) / 2;

		const length = Math.hypot(to.y - from.y, to.x - from.x);
		const angle  = -Math.atan2(to.y - from.y, to.x - from.x);

		if(rSector.ceilingHeight === rSector.floorHeight)
		{
			// rSector.ceilingHeight += 56;
		}

		const maxFloor   = !lSector ? rSector.floorHeight   : Math.max(rSector.floorHeight,   lSector.floorHeight);
		const minFloor   = !lSector ? rSector.floorHeight   : Math.min(rSector.floorHeight,   lSector.floorHeight);
		const minCeiling = !lSector ? rSector.ceilingHeight : Math.min(rSector.ceilingHeight, lSector.ceilingHeight);
		const maxCeiling = !lSector ? rSector.ceilingHeight : Math.max(rSector.ceilingHeight, lSector.ceilingHeight);

		const rHeight  = rSector.ceilingHeight - rSector.floorHeight;
		const lHeight  = lSector.ceilingHeight - lSector.floorHeight;

		const rmHeight = minCeiling - maxFloor;
		const rlHeight = maxFloor   - minFloor;
		const ruHeight = maxCeiling - minCeiling;

		const lmHeight = minCeiling - maxFloor;
		const llHeight = maxFloor   - minFloor;
		const luHeight = maxCeiling - minCeiling;

		const uUnpegged = linedef.flags & (1<<3);
		const lUnpegged = linedef.flags & (1<<4);

		if(isTextureName(right.middle))
		{
			const texture = await loadTexture(wad, right.middle, rLight);
			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true
			});

			const geometry = new THREE.PlaneGeometry(length, rmHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = rmHeight / wadTexture.height;

				texture.repeat.set(hRepeat, vRepeat);

				if(lUnpegged)
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
						(wadTexture.height + -rmHeight + -right.yOffset) / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = rmHeight/2 + maxFloor;
			plane.rotation.y = angle;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(isTextureName(right.lower))
		{
			const texture = await loadTexture(wad, right.lower, rLight);
			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true
			});
			const geometry = new THREE.PlaneGeometry(length, rlHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = rlHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);

				if(!lUnpegged)
				{
					texture.center.set(0, 1);
					texture.offset.set(
						right.xOffset / wadTexture.width,
						-right.yOffset / wadTexture.height
					);
				}
				else
				{
					texture.center.set(0, 0);
					texture.offset.set(
						right.xOffset / wadTexture.width,
						(right.yOffset + -rHeight + wadTexture.height) / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = rlHeight/2 + minFloor;
			plane.rotation.y = angle;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(!(rSky && lSky) && isTextureName(right.upper))
		{
			const texture = await loadTexture(wad, right.upper, rLight);
			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});

			const geometry = new THREE.PlaneGeometry(length, ruHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = ruHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);

				if(uUnpegged)
				{
					texture.center.set(0, 1);
				}

				texture.offset.set(
					right.xOffset / wadTexture.width,
					-right.yOffset / wadTexture.height
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
						const url  = await wadTexture.decode(rLight);
						const texture = textureLoader.load(url);

						if(uUnpegged)
						{
							texture.center.set(0, 1);
						}

						texture.repeat.set(hRepeat, vRepeat);

						texture.offset.set(
							right.xOffset / wadTexture.width,
							-right.yOffset / wadTexture.height
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
			plane.position.y = ruHeight/2 + minCeiling;
			plane.rotation.y = angle;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(left && isTextureName(left.middle))
		{
			const texture = await loadTexture(wad, left.middle, lLight);
			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, lmHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = lmHeight / wadTexture.height;

				texture.repeat.set(hRepeat, vRepeat);

				if(lUnpegged)
				{
					texture.offset.set(
						left.xOffset / wadTexture.width,
						(wadTexture.height + -left.yOffset) / wadTexture.height
					);
				}
				else
				{
					texture.offset.set(
						left.xOffset / wadTexture.width,
						(wadTexture.height + -lmHeight + -left.yOffset) / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = lmHeight/2 + lSector.floorHeight;
			plane.rotation.y = angle + Math.PI;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(left && isTextureName(left.lower))
		{
			const texture = await loadTexture(wad, left.lower, lLight);
			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, llHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = llHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);

				if(!lUnpegged)
				{
					texture.center.set(0, 1);
					texture.offset.set(
						left.xOffset / wadTexture.width,
						-left.yOffset / wadTexture.height
					);
				}
				else
				{
					texture.center.set(0, 0);
					texture.offset.set(
						left.xOffset / wadTexture.width,
						(left.yOffset + -lHeight + wadTexture.height) / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = llHeight/2 + minFloor;
			plane.rotation.y = angle + Math.PI;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(left && isTextureName(left.upper))
		{
			const texture = await loadTexture(wad, left.upper, lLight);
			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, luHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = ruHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);

				if(uUnpegged)
				{
					texture.center.set(0, 1);
				}

				texture.offset.set(
					right.xOffset / wadTexture.width,
					-right.yOffset / wadTexture.height
				);
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = luHeight/2 + minCeiling;
			plane.rotation.y = angle + Math.PI;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}
	});

	const loadFloors = Array(map.glSubsectorCount).fill().map((_,k)=>k).map(async i => {
		const glSubsector = map.glSubsector(i);
		const sector = map.sector(glSubsector.sector);

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

		// floorTexture.minFilter   = THREE.NearestFilter;
		// ceilingTexture.minFilter = THREE.NearestFilter;

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

		const unflipped = unflipVertex(map, {x: bounds.xMin, y: bounds.yMin});

		let xfOffset = 0;
		let xcOffset = 0;
		let yfOffset = map.bounds.height % 64;
		let ycOffset = map.bounds.height % 64;

		setUV(floorGeometry, xfOffset, yfOffset);
		setUV(ceilingGeometry, xcOffset, ycOffset);

		scene.add(floor);

		if(sector.ceilingFlat !== 'F_SKY1')
		{
			scene.add(ceiling);
		}
	});

	let hasSky = true;

	if(hasSky)
	{
		const texture = await loadTexture(wad, 'SKY1', lightLevel);
		texture.magFilter = THREE.NearestFilter;
		// texture.minFilter = THREE.NearestFilter;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		scene.background = texture;
	}

	await Promise.all([...loadWalls, ...loadFloors]);

	console.timeEnd('setup');
}

let then = 0;

function render(now)
{
	requestAnimationFrame(render);

	const delta = now - then;

	if(delta < 16)
	{
		return;
	}

	then = now;

	direction.z = Number( moveForward ) - Number( moveBackward );
	direction.x = Number( moveRight ) - Number( moveLeft );
	direction.y = Number( moveUp ) - Number( moveDown );
	direction.normalize();

	const speed = 5;
	const flipped = unflipVertex(map, {
		x: camera.position.x,
		y: camera.position.z,
	});

	const sector = map.bspPoint(flipped.x, flipped.y);

	controls.moveRight(direction.x * speed);
	controls.moveForward(direction.z * speed);

	// camera.position.y += direction.y * speed;
	// const unflipped = unflipVertex(map, {
	// 	x: camera.position.x,
	// 	y: camera.position.z
	// });

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

	const camDir = new THREE.Vector3();
	camera.getWorldDirection(camDir);
	const hCam = Math.PI + Math.atan2(camDir.x, camDir.z);
	const vCam = camDir.y;

	scene.background.repeat.set(-camera.aspect/2, 0.85);
	scene.background.offset.set((4*hCam)/(Math.PI*2) + 0.5, vCam + -0.15);

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

	renderer.render(scene, camera);
}

function onWindowResize() {
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
