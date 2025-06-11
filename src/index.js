'use strict';

import * as THREE from 'three';
import { flipVertex, samplesPlaying, MessageString, nearestPointOnLine, renderText } from './helpers';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Wad, WadLoader } from 'doom-parser/Wad.mjs'
import { Level } from './Level';
import { HudElement } from './HudElement';
import { Entity } from './Entity';

import { Weapon } from './hud/Weapon';
import { Face } from './hud/Face';
import favicon from './favicon.ico';
import { Decorate } from './Decorate';
import { HudText } from './hud/HudText';

let camera, renderer, controls;
let mainScene, uiScene;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let wad, map;

let lowRes = false;
let paused = -1;

let level;
const query = new URLSearchParams(location.search);

const fov    = 45;
const aspect = window.innerWidth / window.innerHeight;
const near   = 0.1;
const far    = 6400;

const hudElements = new Set;
const hudModels = new Set;

let pe;

let healthLabel, armorLabel;

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
		// '/wads/freedoom2.wad',
		// '/wads/Skulltag-v097d5.wad',
		'/wads/DOOM2.WAD',
		'/wads/skulltag-weapons.wad',
		// '/wads/wrw.wad',
		// '/wads/EWPack.wad',
		'/wads/DOOM1.WAD',
		// '/wads/CHEX.wad',
		// '/wads/TEST.WAD',
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

	const decorate = new Decorate;
	decorate.parse(wad.getTextLumpByName('DECORATE'));
	console.log(decorate);

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

	console.log(wad);

	const bounds = map.bounds;

	let playerStart = {x: 0, y: 0, z: 0, angle: 0};

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

	if(!query.has('start'))
	{
		if(!found)
		{
			playerStart.x = map.bounds.xPosition;
			playerStart.y = map.bounds.yPosition;
		}
	}
	else
	{
		const [x, y, z, angle] = query.get('start').split(',').map(Number);
		playerStart = {x, y, z, angle: 90 + angle};
	}

	camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

	const res = lowRes ? (480 / window.innerWidth) : 1;

	const canvas = document.querySelector('canvas');
	renderer = new THREE.WebGLRenderer( { canvas, powerPreference: 'high-performance' } );
	renderer.setClearColor(0xFFFFFF);
	renderer.setPixelRatio( window.devicePixelRatio * res);
	renderer.setSize(window.innerWidth * res, window.innerHeight * res);
	render.autoClear = false;

	window.addEventListener('resize', onWindowResize, false);
	document.addEventListener('drop', onFileDropped, false);

	document.addEventListener('pointerlockchange', () => {
		if(!document.pointerLockElement)
		{
			paused = 0;
		}
	});

	controls = new PointerLockControls(camera, renderer.domElement);

	controls.update();
	camera.controls = controls;

	const onKeyDown = event => {
		pe && pe.pressKey(event.code);
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

			case 'Escape':
			case 'KeyP':
				controls.unlock();
				break;
		}
	};

	const onKeyUp = event => {
		pe && pe.releaseKey(event.code);
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
				pe.noClip = !pe.noClip;
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

	level = new Level(map, wad, mainScene, camera);

	ms.setText(`${String(wadUrl)}#${selectedMap}\nNow Starting...`);

	await level.setup(camera);

	console.timeEnd('setup');

	if(found)
	{
		pe = level.things.get(playerStart.index);
	}
	else
	{
		pe = new Entity();
	}

	pe.camera = camera;

	if(playerStart)
	{
		pe.position.x = playerStart.x;
		pe.position.y = playerStart.y;
		camera.rotation.y = (Math.PI / 2) * ((-90 + playerStart.angle) / 90);
	}

	camera.position.set(
		pe.position.x,
		pe.position.z + 48,
		bounds.yMax - (pe.position.y - bounds.yMin),
	);

	document.addEventListener('click', async event => {
		controls.isLocked || controls.lock();
		paused = -1;
	});

	document.addEventListener('mousedown', async event => {
		controls.isLocked && pe.pressButton(event.buttons);
	});

	document.addEventListener('mouseup', async event => {
		controls.isLocked && pe.releaseButton(event.buttons);
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

	(async () => {
		const plus = await renderText(wad, '+');
		const crosshairs  = new HudElement(plus.width, plus.height, {scale: 4});
		crosshairs.draw(plus.url, 0, 0, plus.width, plus.height);
		hudElements.add(crosshairs);

		const text = await renderText(wad, 'This is status text.');

		const textElement = new HudElement(text.width, text.height, {
			scale: 4, xScreen: 0.0, yScreen: 0.0, padding: 14, depth: 1000
		});

		textElement.draw(text.url, 0, 0, text.width, text.height);
		hudElements.add(textElement);

		// Icons

		const stim = wad.picture('STIMA0');
		const stimUrl = await stim.decode();

		const stimElement = new HudElement(stim.width, stim.height, {
			scale: 2, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 114, yOffset: 88, depth: 1000
		});

		stimElement.draw(stimUrl, 0, 0, stim.width, stim.height);
		hudElements.add(stimElement);

		const helmet = wad.picture('BON2A0');
		const helmetmUrl = await helmet.decode();

		const helmetElement = new HudElement(helmet.width, helmet.height, {
			scale: 2, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 112, yOffset: 48, depth: 1000
		});

		helmetElement.draw(helmetmUrl, 0, 0, helmet.width, helmet.height);
		hudElements.add(helmetElement);

		// Status

		healthLabel = new HudText(wad, '100%', {
			width: 128, scale: 4, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 152, yOffset: 88, depth: 1000
		})

		hudElements.add(healthLabel.element);
		hudModels.add(healthLabel);

		armorLabel = new HudText(wad, '100%', {
			width: 128, scale: 4, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 152, yOffset: 48, depth: 1000
		})

		hudElements.add(armorLabel.element);
		hudModels.add(armorLabel);

		// Keys

		const bluKey = wad.picture('STKEYS0');
		const bluKeyUrl = await bluKey.decode();

		const bluKeyElement = new HudElement(bluKey.width, bluKey.height, {
			scale: 4, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 0, yOffset: 128, depth: 1000
		});

		bluKeyElement.draw(bluKeyUrl, 0, 0, bluKey.width, bluKey.height);
		hudElements.add(bluKeyElement);

		const yelKey = wad.picture('STKEYS1');
		const yelKeyUrl = await yelKey.decode();

		const yelKeyElement = new HudElement(yelKey.width, yelKey.height, {
			scale: 4, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 48, yOffset: 128, depth: 1000
		});

		yelKeyElement.draw(yelKeyUrl, 0, 0, yelKey.width, yelKey.height);
		hudElements.add(yelKeyElement);

		const redKey = wad.picture('STKEYS2');
		const redKeyUrl = await redKey.decode();

		const redKeyElement = new HudElement(redKey.width, redKey.height, {
			scale: 4, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 96, yOffset: 128, depth: 1000
		});

		redKeyElement.draw(redKeyUrl, 0, 0, redKey.width, redKey.height);
		hudElements.add(redKeyElement);

		// Ammo

		const ammo = await renderText(wad, '50 / 200');

		const ammoElement = new HudElement(ammo.width, ammo.height, {
			scale: 4, xScreen: 0.0, yScreen: 1.0, padding: 14, xOffset: 112, yOffset: 8, depth: 1000
		});

		ammoElement.draw(ammo.url, 0, 0, ammo.width, ammo.height);
		hudElements.add(ammoElement);

		// Face

		const face = new Face(wad, pe, {scale: 4, xScreen: 0, yScreen: 1, padding: 14});
		hudElements.add(face.element);
		hudModels.add(face);

		const gun = new Weapon(wad, pe, {scale: 6});
		hudElements.add(gun.element);
		hudModels.add(gun);

		for(const hudElement of hudElements)
		{
			mainScene.add(hudElement.sprite);
		}
	})();
}

const camDir = new THREE.Vector3();

let sThen = 0;

let healthTimer = 0;

const simulate = (now) => {
	setTimeout(() => simulate(performance.now()), 0);

	if(paused > 0)
	{
		paused--;
	}
	else if(paused === 0)
	{
		return;
	}

	const delta = Math.min(32, now - sThen);

	if(delta < 16) return;
	sThen = now;

	if(pe.hp < 100)
	{
		if(healthTimer > 1000)
		{
			healthTimer = 0;
			pe.hp++;

			pe.hp = Math.round(pe.hp);
		}
	}

	if(pe.hp < 50)
	{
		if(healthTimer > 250)
		{
			healthTimer = 0;
			pe.hp++;

			pe.hp = Math.round(pe.hp);
		}
	}

	healthTimer += delta;

	const ticFrac = (delta/1000) * 35;

	if(!pe || !camera || !level || !level.rooms) return;

	const hCam = Math.atan2(camDir.z, camDir.x);
	const vCam = Math.asin(camDir.y);

	const xImpulse = pe.ignore ? 0 : Number(moveRight) - Number(moveLeft);
	const yImpulse = pe.ignore ? 0 : Number(moveBackward) - Number(moveForward);

	const impulseDir = Math.atan2(yImpulse, 0.75 * xImpulse) + hCam + Math.PI/2;
	const impulseMag = Math.hypot(yImpulse, 0.75 * xImpulse);

	if(!pe.noClip)
	{
		pe.angle = -hCam;
		pe.pitch = vCam;

		pe.applyImpulse(impulseDir, impulseMag * 0.03125 * ticFrac * 40);
	}
	else
	{
		pe.position.x -= 5 * yImpulse * Math.cos(hCam) * Math.cos(vCam);
		pe.position.y += 5 * yImpulse * Math.sin(hCam) * Math.cos(vCam);
		pe.position.z += 5 * yImpulse * -Math.sin(vCam);

		pe.position.x -= 5 * xImpulse * Math.sin(hCam);
		pe.position.y -= 5 * xImpulse * Math.cos(hCam);

		pe.velocity.x = 0;
		pe.velocity.y = 0;
		pe.velocity.z = 0;
	}

	level.simulate(delta, camera);

	const nearby = level.quadTree.select(
		pe.position.x - 16,
		pe.position.y - 16,
		pe.position.x + 16,
		pe.position.y + 16,
	);

	for(const thing of nearby)
	{
		const distance = Math.hypot(pe.position.y - thing.position.y, pe.position.x - thing.position.x);
		if(distance > 16 || pe === thing) continue;
		// other entity is colliding
	}

	healthLabel && healthLabel.setMessage(Math.max(0, pe.hp) + '%');

	for(const {xPosition, yPosition, stereo, gain, options} of samplesPlaying)
	{
		if(xPosition === undefined || yPosition === undefined) continue;
		pe.alert(xPosition, yPosition);
		const mag = Math.hypot(yPosition - pe.position.y, xPosition - pe.position.x);

		if(!options.noAlert)
		{
			const nearby = level.quadTree.select(
				xPosition - 1024,
				yPosition - 1024,
				xPosition + 1024,
				yPosition + 1024,
			);

			for(const thing of nearby)
			{
				const distance = Math.hypot(yPosition - thing.position.y, xPosition - thing.position.x);
				if(distance > 512 || pe === thing) continue;
				thing.alert(xPosition, yPosition);
			}
		}

		if(!options.noStereo)
		{
			if(mag === 0) continue;
			const vec = [yPosition - pe.position.y, xPosition - pe.position.x]; // y, x
			const dot = ((vec[0]/mag) * camDir.x + (vec[1]/mag) * camDir.z);
			stereo.pan.value = -dot;
			gain.gain.value = Math.min(1, (options.gain ?? 0.25) / Math.sqrt(mag / 0x40));
		}
	}

	for(const hudModel of hudModels)
	{
		hudModel.simulate(delta);
	}

	pe.teleporting = false;
};

const camPosition = {x: 0, y: 0, z: 0};

let rThen = 0;

const render = (now) => {
	requestAnimationFrame(render);

	camPosition.z = pe.position.z + 48;

	flipVertex(level.map, pe.position, camPosition);

	camera.position.x = camPosition.x;
	camera.position.z = camPosition.y;

	if(camera.position.y < camPosition.z && Math.abs(camera.position.y - camPosition.z) > 4)
	{
		camera.position.y -= 0.25 * (camera.position.y - camPosition.z);
	}
	else
	{
		camera.position.y = camPosition.z;
	}

	camera.getWorldDirection(camDir);

	const delta = Math.min(32, now - rThen);

	if(delta < 16) return;

	rThen = now;

	const hCam = Math.atan2(camDir.z, camDir.x);
	const vCam = Math.asin(camDir.y);

	camera.updateProjectionMatrix();

	for(const hudElement of hudElements)
	{
		hudElement.render(camera);
	}

	const sector = map.bspPoint(pe.position.x, pe.position.y);
	const room = level.rooms.get(sector.index);
	room.show();

	if(map.lumps.GL_PVS && map.lumps.GL_PVS.size)
	{
		const ssector = map.bspPoint(pe.position.x, pe.position.y, true);
		const visible = map.glpvsVisibleFrom(ssector.index);

		for(const room of level.rooms.values())
		{
			if(visible.has(room.index)) room.show();
			else room.hide();
			// if(!pe.noClip)
			// {
			// }
			// else
			// {
			// 	room.show();
			// }
		}
	}

	for(const room of level.rooms.values())
	{
		room.render(delta);
	}

	if(mainScene.background)
	{
		mainScene.background.repeat.set(-camera.aspect/2, 0.85);
		mainScene.background.offset.set((-4*hCam)/(Math.PI*2), vCam + -0.15);
	}

	renderer.render(mainScene, camera);
}

const onWindowResize = () => {
	if(!camera) return;
	camera.aspect = window.innerWidth / window.innerHeight;
	renderer.setSize(window.innerWidth, window.innerHeight);
	camera.updateProjectionMatrix();
}

const onFileDropped = (event) => {
	console.log(event);
};

const start = async () => {
	await setup();
	onWindowResize();
	simulate(performance.now());
	requestAnimationFrame(render);
}

start();
