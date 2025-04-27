'use strict';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Wad } from 'doom-parser/Wad.mjs'
import DOOM from './DOOM1.GL.WAD';
import { cameraPosition } from 'three/tsl';

let camera, scene, renderer, light, controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
let map;
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

const loadTexture = async (wad, name) => {
	const wadTexture = wad.texture(name);

	if(wadTexture)
	{
		return [textureLoader.load(await wadTexture.decode()), wadTexture];
	}

	return [textureLoader.load('https://threejs.org/examples/textures/crate.gif'), null];
}

const isTextureName = name => {
	return name
		&& name !== '-'
		&& name !== 'AASTINKY'
		&& name !== 'AASHITTY';
}

async function setup()
{
	console.time('setup');

	const query = new URLSearchParams(location.search);

	// Map
	const wad = new Wad(DOOM);
	map = wad.loadMap(query.has('map') ? query.get('map') : 'E1M6');
	const bounds = map.bounds;

	console.log(map.blockmapOrigin);
	console.log(map.blockCount);
	console.log(map.name);

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


	// Camera.
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

		camera.rotation.y = (Math.PI / 2) * ((90 + -playerStart.angle) / 90);
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

	document.addEventListener( 'keydown', onKeyDown );
	document.addEventListener( 'keyup', onKeyUp );

	// Lights.
	light = new THREE.PointLight(0xffffff, 1.5);
	light.position.set(-600, 600, 1000);
	scene.add(light);

	const loadWalls = Array(map.linedefCount).fill().map((_,k)=>k).map(async i => {
		const linedef = map.linedef(i);

		const _from = map.vertex(linedef.from);
		const _to = map.vertex(linedef.to);
		const from = flipVertex(map, _from);
		const to   = flipVertex(map, _to);

		const right = map.sidedef(linedef.right);
		const left = linedef.left >= 0 ? map.sidedef(linedef.left) : false;

		const rSector = map.sector(right.sector);
		const lSector = left && map.sector(left.sector);

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
			const lSectorLinedefs = sectorLinedefs.get(lSector.index);
			lSectorLinedefs.add(i);
		}

		const xCenter = (from.x + to.x) / 2;
		const yCenter = (from.y + to.y) / 2;

		const length = Math.hypot(to.y - from.y, to.x - from.x);
		const angle  = -Math.atan2(to.y - from.y, to.x - from.x);

		if(rSector.ceilingHeight === rSector.floorHeight)
		{
			rSector.ceilingHeight += 56;
		}

		const rmHeight = rSector.ceilingHeight - rSector.floorHeight;
		const rlHeight = lSector.floorHeight   - rSector.floorHeight   || 0;
		const ruHeight = rSector.ceilingHeight - lSector.ceilingHeight || 0;

		const lmHeight = lSector.ceilingHeight - lSector.floorHeight   || 0;
		const llHeight = rSector.floorHeight   - lSector.floorHeight   || 0;
		const luHeight = lSector.ceilingHeight - rSector.ceilingHeight || 0;

		const uUnpegged = linedef.flags & (1<<3);
		const lUnpegged = linedef.flags & (1<<4);

		if(isTextureName(right.middle))
		{
			const [texture, wadTexture] = await loadTexture(wad, right.middle);
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, rmHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			texture.magFilter = THREE.NearestFilter;
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = rmHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);
				if(lUnpegged)
				{
					texture.offset.set(
						right.xOffset / wadTexture.width,
						(wadTexture.height + -rmHeight + -right.yOffset) / wadTexture.height
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
			plane.position.y = rmHeight/2 + rSector.floorHeight;
			plane.rotation.y = angle;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(isTextureName(right.lower))
		{
			const [texture, wadTexture] = await loadTexture(wad, right.lower);
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, rlHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			texture.magFilter = THREE.NearestFilter;
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = rlHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);

				if(lUnpegged)
				{
					texture.offset.set(
						right.xOffset / wadTexture.width,
						(wadTexture.height + -rmHeight + -right.yOffset) / wadTexture.height
					);
				}
				else
				{
					texture.offset.set(
						right.xOffset / wadTexture.width,
						right.yOffset / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = rlHeight/2 + rSector.floorHeight;
			plane.rotation.y = angle;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(isTextureName(right.upper))
		{
			const [texture, wadTexture] = await loadTexture(wad, right.upper);
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, ruHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			// console.log(right, texture, wadTexture, await wadTexture.decode());

			texture.magFilter = THREE.NearestFilter;
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = ruHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);

				if(uUnpegged)
				{
					texture.offset.set(
						right.xOffset / wadTexture.width,
						(wadTexture.height + -rmHeight + lmHeight + -right.yOffset) / wadTexture.height
					);
				}
				else
				{
					texture.offset.set(
						right.xOffset / wadTexture.width,
						-right.yOffset / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = -ruHeight/2 + rSector.ceilingHeight;
			plane.rotation.y = angle;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(left && isTextureName(left.middle))
		{
			const [texture, wadTexture] = await loadTexture(wad, left.middle);
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, lmHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			texture.offset.set(left.xOffset, left.yOffset);
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = lmHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);
				texture.offset.set(
					left.xOffset / wadTexture.width,
					(wadTexture.height + -lmHeight + -left.yOffset) / wadTexture.height
				);
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
			const [texture, wadTexture] = await loadTexture(wad, left.lower);
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, llHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			texture.offset.set(left.xOffset, left.yOffset);
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = llHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);
				if(lUnpegged)
				{
					texture.offset.set(
						left.xOffset / wadTexture.width,
						(wadTexture.height + -lmHeight + -left.yOffset) / wadTexture.height
					);
				}
				else
				{
					texture.offset.set(
						left.xOffset / wadTexture.width,
						left.yOffset / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = llHeight/2 + lSector.floorHeight;
			plane.rotation.y = angle + Math.PI;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}

		if(left && isTextureName(left.upper))
		{
			const [texture, wadTexture] = await loadTexture(wad, left.upper);
			const material = new THREE.MeshBasicMaterial({map: texture, transparent: true});
			const geometry = new THREE.PlaneGeometry(length, luHeight, 1);
			const plane = new THREE.Mesh(geometry, material);

			texture.offset.set(left.xOffset, left.yOffset);
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;

			if(wadTexture)
			{
				const hRepeat = length / wadTexture.width;
				const vRepeat = luHeight / wadTexture.height;
				texture.repeat.set(hRepeat, vRepeat);

				if(uUnpegged)
				{
					texture.offset.set(
						left.xOffset / wadTexture.width,
						(wadTexture.height + -luHeight + -left.yOffset) / wadTexture.height
					);
				}
				else
				{
					texture.offset.set(
						left.xOffset / wadTexture.width,
						-left.yOffset / wadTexture.height
					);
				}
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = -luHeight/2 + lSector.ceilingHeight;
			plane.rotation.y = angle + Math.PI;

			_linedefPlanes.add(plane);
			scene.add(plane);
		}
	});

	const loadFloors = Array(map.glSubsectorCount).fill().map((_,k)=>k).map(async i => {
		const glSubsector = map.glSubsector(i);
		const sector = map.sector(glSubsector.sector);

		const floorFlat   = await map.wad.flat(sector.floorFlat).decode();
		const ceilingFlat = await map.wad.flat(sector.ceilingFlat).decode();

		const vertexes = glSubsector.vertexes().map(v => flipVertex(map, v));
		const backward = [...vertexes].reverse();

		const floorShape = new THREE.Shape(vertexes.map(
			(vertex) => new THREE.Vector2(vertex.x, vertex.y))
		);
		const ceilingShape = new THREE.Shape(backward.map(
			(vertex) => new THREE.Vector2(vertex.x, vertex.y))
		);

		const floorGeometry = new THREE.ShapeGeometry(floorShape);

		floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
			vertexes.map(vertex => [vertex.x, sector.floorHeight, vertex.y]).flat(), 3
		));

		const ceilingGeometry = new THREE.ShapeGeometry(ceilingShape);

		ceilingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
			backward.map(vertex => [vertex.x, sector.ceilingHeight, vertex.y]).flat(), 3
		));

		const floorTexture   = textureLoader.load(floorFlat);
		const ceilingTexture = textureLoader.load(ceilingFlat);

		floorTexture.magFilter = THREE.NearestFilter;
		ceilingTexture.magFilter = THREE.NearestFilter;

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

		let xfOffset = 0;
		let yfOffset = 0;
		let xcOffset = 0;
		let ycOffset = 0;

		if(sector.floorFlat.substr(0, 5) === 'DEM1_')
		{
			yfOffset = 32;
		}

		if(sector.ceilingFlat.substr(0, 5) === 'DEM1_')
		{
			ycOffset = 32;
		}

		setUV(floorGeometry, xfOffset, yfOffset);
		setUV(ceilingGeometry, xcOffset, ycOffset);

		scene.add(floor);
		scene.add(ceiling);
	});

	await Promise.all([loadWalls, loadFloors]);

	console.log(linedefPlanes, sectorLinedefs);

	console.timeEnd('setup');
}

function render()
{
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
	// controls.moveUpward(direction.y * speed);
	// camera.position.y += direction.y * speed;

	const unflipped = unflipVertex(map, {
		x: camera.position.x,
		y: camera.position.z
	});

	// console.log(map.blockForPoint(unflipped.x, unflipped.y));

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

	renderer.render(scene, camera);
	window.requestAnimationFrame(render);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
}

async function start()
{
	await setup();
	window.requestAnimationFrame(render);
}

start();
onWindowResize();