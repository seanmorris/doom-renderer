'use strict';

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import GlbspBinary from 'glbsp-wasm/GlbspBinary.mjs';
import { Wad, WadLoader } from 'doom-parser/Wad.mjs'
import MissingTexture from './MissingTexture3D.png';
import favicon from './favicon.ico';

let camera, renderer, controls;
let mainScene, uiScene;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let wad, map;
let yCam = 0;
let yVel = 0;

let showThings = true;
let noClip = false;
let lowRes = false;
let fullbright = false;

const things = new Set;

const textureLoader = new THREE.TextureLoader();

const flipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMax - (vertex.y - map.bounds.yMin)});
const unflipVertex = (map, vertex) => ({x: vertex.x, y: map.bounds.yMin - (vertex.y - map.bounds.yMax)});

const byteToLightOffset = byte => (33 - Math.ceil(byte / 8));

const missing = textureLoader.load(MissingTexture);

const loadTexture = async (wad, name, lightLevel) => {
	const wadTexture = wad.texture(name.toUpperCase()) || wad.flat(name.toUpperCase());

	if(!wadTexture)
	{
		console.log(name);
	}

	const texture = wadTexture
		? textureLoader.load(await wadTexture.decode(lightLevel))
		: missing.clone();

	texture.userData.wadTexture = wadTexture;
	texture.userData.missing = !wadTexture;

	texture.magFilter = THREE.NearestFilter;
	// if(lowRes) texture.minFilter = THREE.NearestFilter;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;

	return texture;
}

const isTextureName = name => {
	return name
		&& name !== '-'
		&& name !== 'AASTINKY'
		&& name !== 'AASHITTY';
}

const textures = new Map;
const thingMaterials = new Map;
const thingGeometries = new Map;

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

class Level extends EventTarget
{
	constructor(map, wad, scene)
	{
		super();
		this.rooms = new Map;
		this.map = map;
		this.wad = wad;
		this.scene = scene;
		this.animatedWalls = new Set;
		this.animatedFlats = new Set;
		this.tags = new Map;
		this.transparentPlanes = 0;
		this.roomThings = new Map;
		this.planes = 0;
	}

	async setup()
	{
		const loadRooms = Array(this.map.sectorCount).fill().map((_,k)=>k).map(async i => {
			this.rooms.set(i, new Room(map.sector(i), this, this.scene));
		});

		const loadWalls = Array(this.map.linedefCount).fill().map((_,k)=>k).map(async i => {
			const linedef = map.linedef(i);

			const right   = map.sidedef(linedef.right);
			const left    = linedef.left >= 0 ? map.sidedef(linedef.left) : false;

			const rSector = map.sector(right.sector);
			const lSector = left && map.sector(left.sector);

			const rRoom   = this.rooms.get(rSector.index);
			const lRoom   = lSector && this.rooms.get(lSector.index);

			rRoom.addWall(linedef);
			lRoom && lRoom.addWall(linedef, true);
		});

		const loadThings = Array(map.thingCount).fill().map((_,k)=>k).map(async i => {
			const thing = map.thing(i);

			if(thing.flags.multip || [2,3,4,10,12,15,24].includes(thing.type)) return;
			// if(thing.flags.multip || [2,3,4,10,12,15,116,127].includes(thing.type)) return;

			if(!thing.meta)
			{
				return;
			}

			const spriteName = thing.meta.sprite;
			const sector = map.bspPoint(thing.x, thing.y);
			const room = this.rooms.get(sector.index);

			if(thing.type === 14)
			{
				room.destination = thing;
				return;
			}

			if(!spriteName || spriteName[0] === '-')
			{
				return;
			}

			const _sprite = wad.sprite(thing.meta.sprite);
			const sprite = [];

			if(_sprite && _sprite[0])
			{
				for(const f in _sprite)
				for(const a in _sprite[f])
				{
					if(f > 0) break;

					const frame = _sprite[f][a];

					if(!frame) continue;

					// const texture = textureLoader.load(
					// 	await frame.picture.decode( byteToLightOffset(sector.lightLevel))
					// );

					const spriteKey = thing.meta.sprite + f + a;

					if(!textures.has(spriteKey))
					{
						textures.set(spriteKey, new Map);
					}

					if(!textures.get(spriteKey).has(sector.lightLevel))
					{
						const texture = textureLoader.load(await frame.picture.decode(
							byteToLightOffset(sector.lightLevel)
						));

						textures.get(spriteKey).set(sector.lightLevel, texture);
					}

					const texture = textures.get(spriteKey).get(sector.lightLevel).clone();

					sprite[f] = sprite[f] || [];
					sprite[f][a] = texture;

					texture.repeat.set(frame.flipped ? -1 : 1, 1);
					texture.wrapS      = THREE.RepeatWrapping;
					texture.colorSpace = THREE.SRGBColorSpace;
					texture.magFilter  = THREE.NearestFilter;
					// if(lowRes) texture.minFilter = THREE.NearestFilter;
				}

				const picture = (_sprite[0][0] || _sprite[0][1]).picture;
				const texture = (sprite[0][0] || sprite[0][1]);

				/*/
				const material = (_sprite[0][0] || _sprite[0][1]) && new THREE.MeshBasicMaterial({
					map: texture, transparent: true
				});
				/*/
				if(!thingMaterials.has(thing.meta.sprite))
				{
					thingMaterials.set(thing.meta.sprite, new Map);
				}

				if(!thingMaterials.get(thing.meta.sprite).has(sector.lightLevel))
				{
					const material = (_sprite[0][0] || _sprite[0][1]) && new THREE.MeshBasicMaterial({
						map: texture, transparent: true
					});

					thingMaterials.get(thing.meta.sprite).set(sector.lightLevel, material);
				}

				const material = thingMaterials.get(thing.meta.sprite).get(sector.lightLevel).clone();
				//*/

				/*/
				const geometry = new THREE.PlaneGeometry(picture.width, picture.height, 1);
				/*/
				if(!thingGeometries.has(thing.meta.sprite))
				{
					thingGeometries.set(thing.meta.sprite, new THREE.PlaneGeometry(picture.width, picture.height, 1));
				}
				const geometry = thingGeometries.get(thing.meta.sprite);
				//*/

				const plane = new THREE.Mesh(geometry, material);
				const pos   = flipVertex(map, thing);

				plane.position.x = pos.x;
				plane.position.z = pos.y;
				plane.position.y = sector.floorHeight + picture.height / 2;
				plane.rotation.y = 0;

				plane.userData.thing  = thing;
				plane.userData.sprite = sprite;
				plane.userData.height = picture.height;

				this.scene.add(plane);
				room.addThing(plane);
				things.add(plane);
			}
		});

		const roomSubsectors = new Map;
		Array(map.glSubsectorCount).fill().forEach((_,k) => {
			const subsector = this.map.glSubsector(k);
			const room = this.rooms.get(subsector.sector);
			if(!roomSubsectors.has(room))
			{
				roomSubsectors.set(room, new Set);
			}
			roomSubsectors.get(room).add(subsector);
		});

		for(const [room, subsectors] of roomSubsectors)
		{
			room.addFlats(subsectors);
		}

		const lightLevel = 0;

		const texture = await loadTexture(wad, 'SKY1', lightLevel);
		// if(lowRes) texture.minFilter = THREE.NearestFilter;
		texture.magFilter = THREE.NearestFilter;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		this.scene.background = texture;

		await Promise.all([...loadRooms, ...loadWalls, ...loadThings]);

		console.log(this.transparentPlanes, this.planes, map.thingCount, thingMaterials);

		for(const room of this.rooms.values())
		{
			const sector = map.sector(room.index);

			room.addEventListener('ceiling-start', event => {
				if(!room.isDoor) return;
				if(event.detail.height === event.detail.original) playSample(
					wad.sample('DSDOROPN'),
					sector.bounds.xPosition,
					sector.bounds.yPosition,
				)
				else  playSample(
					wad.sample('DSDORCLS'),
					sector.bounds.xPosition,
					sector.bounds.yPosition,
				);
			});

			room.addEventListener('ceiling-stop', event => {});

			room.addEventListener('floor-start', event => {
				if(!event.target.lastAction) return;
				if(event.target.lastAction.soundMeta && event.target.lastAction.soundMeta.start)
				{
					playSample(
						wad.sample('DS' + event.target.lastAction.soundMeta.start),
						sector.bounds.xPosition,
						sector.bounds.yPosition,
					);
				}
			});

			room.addEventListener('floor-stop', event => {
				if(!event.target.lastAction || !event.target.lastAction.soundMeta) return;
				playSample(
					wad.sample('DS' + event.target.lastAction.soundMeta.stop),
					sector.bounds.xPosition,
					sector.bounds.yPosition,
				);
			});
		}
	}

	simulate(delta)
	{
		for(const mesh of this.animatedFlats)
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

		for(const mesh of this.animatedWalls)
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
	}

	setDetail(lowRes)
	{
		for(const room of this.rooms.values())
		{
			room.setDetail(lowRes);
		}

		if(lowRes)
		{
			renderer.setPixelRatio( window.devicePixelRatio * (320 / window.innerWidth));
		}
		else
		{
			renderer.setPixelRatio(window.devicePixelRatio);
		}

		for(const mesh of this.animatedWalls)
		{
			if(!mesh.userData.frames) continue;
			for(const frame of mesh.userData.frames)
			{
				if(!frame) continue;

				if(lowRes)
				{
					frame.minFilter = THREE.NearestFilter;
				}
				else
				{
					frame.minFilter = THREE.NearestMipmapLinearFilter;
				}

				frame.needsUpdate = true;
			}
		}

		for(const mesh of this.animatedFlats)
		{
			if(!mesh.userData.frames) continue;
			for(const frame of mesh.userData.frames)
			{
				if(!frame) continue;

				if(lowRes)
				{
					frame.minFilter = THREE.NearestMipmapNearestFilter;
				}
				else
				{
					frame.minFilter = THREE.NearestMipmapLinearFilter;
				}

				frame.needsUpdate = true;
			}
		}
	}

	toggleThings()
	{
		showThings = !showThings;

		for(const plane of this.roomThings.keys())
		{
			plane.userData.hidden = !showThings;
			plane.matrixWorldAutoUpdate = showThings;
			plane.matrixAutoUpdate = showThings;
			plane.visible = showThings;
		}
	}

	toggleFullbright()
	{
		fullbright = !fullbright;

		for(const room of this.rooms.values())
		{
			room.changeLightLevel(fullbright ? 255 : null);
		}
	}
}

class Room extends EventTarget
{
	constructor(sector, level, scene)
	{
		super();

		this.floorHeight   = sector.floorHeight;
		this.ceilingHeight = sector.ceilingHeight;

		this.originalFloorHeight   = sector.floorHeight;
		this.originalCeilingHeight = sector.ceilingHeight;

		this.targetFloorHeight   = sector.floorHeight;
		this.targetCeilingHeight = sector.ceilingHeight;

		this.moveSpeed = 0.08;

		this.floorFlat   = sector.floorFlat;
		this.ceilingFlat = sector.ceilingFlat;

		this.lightLevel  = sector.lightLevel;
		this.special     = sector.special;

		this.tag   = sector.tag;
		this.index = sector.index;

		this.sector = sector;
		this.level  = level;
		this.scene  = scene;

		this.ceilingPlanes = new Set;
		this.floorPlanes   = new Set;

		this.middlePlanes = new Set;
		this.upperPlanes  = new Set;
		this.lowerPlanes  = new Set;
		this.innerPlanes  = new Set;

		this.linedefs = new Set;
		this.lastAction = null;
		this.walls = new Map;
		this.neighbors = new Set;
		this.things = new Set;
		this.destination = null;

		this.slopedSectorA  = null;
		this.slopedSectorB  = null;
		this.slopedLinedef = null;
		this.slopedAntidef = null;
		this.slopeVec = null;
		this.slopeDist = 0;

		this.isDoor = false;
		this.visible = true;

		if(!this.level.tags.has(this.tag))
		{
			this.level.tags.set(this.tag, new Set);
		}

		this.timer = 0;
		this.closeTime = -1;

		this.level.tags.get(this.tag).add(this);

		this.ceilingMoving = false;
		this.floorMoving = false;

		this.switchesFlipped = new Set;
	}

	hide()
	{
		if(!this.visible) return;

		for(const plane of [...this.middlePlanes, ...this.lowerPlanes, ...this.upperPlanes, ...this.ceilingPlanes, ...this.floorPlanes, ...this.things])
		{
			plane.needsUpdate = true;
			plane.matrixWorldAutoUpdate = false;
			plane.matrixAutoUpdate = false;
			plane.visible = false;
		}

		this.visible = false;
	}

	show()
	{
		if(this.visible) return;

		for(const plane of [...this.middlePlanes, ...this.lowerPlanes, ...this.upperPlanes, ...this.ceilingPlanes, ...this.floorPlanes, ...this.things])
		{
			plane.needsUpdate = true;

			if(plane.userData.hidden)
			{
				// continue;
			}

			plane.matrixWorldAutoUpdate = true;
			plane.matrixAutoUpdate = true;
			plane.visible = true;
		}

		this.visible = true;

		this.setDetail(lowRes);
	}

	setDetail(lowRes)
	{
		if(!this.visible) return;

		for(const plane of [...this.middlePlanes, ...this.lowerPlanes, ...this.upperPlanes])
		{
			if(lowRes)
			{
				plane.material.map.minFilter = THREE.NearestFilter;
			}
			else
			{
				plane.material.map.minFilter = THREE.NearestMipmapLinearFilter;
			}

			plane.material.map.needsUpdate = true;
		}

		for(const plane of [...this.ceilingPlanes, ...this.floorPlanes])
		{
			if(lowRes)
			{
				plane.material.map.minFilter = THREE.NearestMipmapNearestFilter;
			}
			else
			{
				plane.material.map.minFilter = THREE.NearestMipmapLinearFilter;
			}

			plane.material.map.needsUpdate = true;
		}

		for(const plane of [...this.things])
		{
			if(lowRes)
			{
				plane.material.map.minFilter = THREE.NearestFilter;
			}
			else
			{
				plane.material.map.minFilter = THREE.NearestMipmapLinearFilter;
			}

			plane.material.map.needsUpdate = true;

			for(const animation of plane.userData.sprite)
			for(const frame of animation)
			{
				if(!frame) continue;

				if(lowRes)
				{
					frame.minFilter = THREE.NearestFilter;
				}
				else
				{
					frame.minFilter = THREE.NearestMipmapLinearFilter;
				}

				frame.needsUpdate = true;
			}
		}
	}

	simulate(delta)
	{
		if(this.timer > 0)
		{
			this.timer -= delta;
			return;
		}
		else
		{
			this.timer = 0;
		}

		const groundedThings = new Set;

		if(this.slopedLinedef && !this.slopedAntidef)
		{
			const from = this.level.map.vertex(this.slopedLinedef.from);
			const to   = this.level.map.vertex(this.slopedLinedef.to);
			const xCenter = (from.x + to.x) / 2;
			const yCenter = (from.y + to.y) / 2;
			const mag  = Math.hypot(from.y - to.y, from.x - to.x);
			const nVec  = [(from.y - to.y) / mag, (from.x - to.x) / mag];
			const dots = new Map;

			for(const linedef of this.linedefs)
			{
				if(linedef === this.slopedLinedef) continue;

				const aFrom = this.level.map.vertex(linedef.from);
				const aTo   = this.level.map.vertex(linedef.to);

				const xACenter = (aFrom.x + aTo.x) / 2;
				const yACenter = (aFrom.y + aTo.y) / 2;

				const dist = Math.hypot(yCenter - yACenter, xCenter - xACenter);
				const aVec = [(xCenter - xACenter) / dist, (yACenter - yCenter) / dist];

				const dot = nVec[0] * aVec[0] + nVec[1] * aVec[1];

				dots.set(linedef, {dot, dist});
			}

			let slopeTo = null;

			const sorted = [...dots.entries()].sort((a, b) => {
				if(a[1].dot !== b[1].dot)
				{
					return b[1].dot - a[1].dot;
				}
			});

			slopeTo = sorted[0][0];

			this.slopeDist = sorted[0][1].dist;

			console.log(this.slopedLinedef, slopeTo, sorted);

			this.slopedAntidef = slopeTo;
			const left = this.level.map.sidedef(this.slopedLinedef.left);
			this.slopedSectorA = this.level.rooms.get(left.sector);

			const tRight = this.level.map.sidedef(slopeTo.right);
			this.slopedSectorB = this.level.rooms.get(tRight.sector);

			this.slopeVec = new THREE.Vector3(-nVec[1], 0, nVec[0]);

			this.slope();
		}

		if(this.ceilingHeight !== this.targetCeilingHeight)
		{
			if(Math.abs(this.targetCeilingHeight - this.ceilingHeight) < delta * this.moveSpeed)
			{
				this.dispatchEvent(new CustomEvent('ceiling-stop', {detail: {
					original: this.originalCeilingHeight,
					height:   this.ceilingHeight,
					target:   this.targetCeilingHeight,
				}}));

				this.ceilingHeight = this.targetCeilingHeight;
				this.ceilingMoving = false;
			}
			else
			{
				if(!this.ceilingMoving)
				{
					this.dispatchEvent(new CustomEvent('ceiling-start', {detail: {
						original: this.originalCeilingHeight,
						height:   this.ceilingHeight,
						target:   this.targetCeilingHeight,
					}}));
				}

				this.ceilingMoving = true;

				this.ceilingHeight += delta * this.moveSpeed * Math.sign(this.targetCeilingHeight - this.ceilingHeight);
			}

			this.moveGeometry();
		}
		else
		{
			if(this.ceilingMoving)
			{
				this.dispatchEvent(new CustomEvent('ceiling-stop', {detail: {
					original: this.originalCeilingHeight,
					height:   this.ceilingHeight,
					target:   this.targetCeilingHeight,
				}}));

				this.ceilingHeight = this.targetCeilingHeight;
				this.ceilingMoving = false;

			}

			if(this.ceilingHeight !== this.originalCeilingHeight && this.closeTime > 0)
			{
				this.targetCeilingHeight = this.originalCeilingHeight;
				this.timer = this.closeTime;
			}
		}

		if(this.floorHeight !== this.targetFloorHeight)
		{
			for(const thing of this.things)
			{
				thing.position.y = this.floorHeight + thing.userData.height / 2;
			}

			if(Math.abs(this.targetFloorHeight - this.floorHeight) < delta * this.moveSpeed)
			{
				this.dispatchEvent(new CustomEvent('floor-stop', {detail: {
					original: this.originalFloorHeight,
					height:   this.floorHeight,
					target:   this.targetFloorHeight,
				}}));

				this.floorHeight = this.targetFloorHeight;
				this.floorMoving = false;
			}
			else
			{
				if(!this.floorMoving)
				{
					this.dispatchEvent(new CustomEvent('floor-start', {detail: {
						original: this.originalFloorHeight,
						height:   this.floorHeight,
						target:   this.targetFloorHeight,
					}}));
				}

				this.floorMoving = true;

				this.floorHeight += delta * this.moveSpeed * Math.sign(this.targetFloorHeight - this.floorHeight);
			}

			this.moveGeometry();
		}
		else
		{
			if(this.floorMoving)
			{
				this.dispatchEvent(new CustomEvent('floor-stop', {detail: {
					original: this.originalFloorHeight,
					height:   this.floorHeight,
					target:   this.targetFloorHeight,
				}}));

				this.floorHeight = this.targetFloorHeight;
				this.floorMoving = false;

			}

			if(this.floorHeight !== this.originalFloorHeight && this.closeTime > 0)
			{
				this.targetFloorHeight = this.originalFloorHeight;
				this.timer = this.closeTime;
				// if(!this.things.size)
				// {
				// }
				// else
				// {
				// 	this.timer = 10;
				// }
			}
		}
	}

	async changeLightLevel(lightLevel = null)
	{
		if(lightLevel === null)
		{
			lightLevel = this.sector.lightLevel;
		}

		for(const plane of [...this.innerPlanes])
		{
			if(!plane.material.map.userData.wadTexture) continue;

			const wadTexture = plane.material.map.userData.wadTexture;
			const texture = await loadTexture(
				this.level.wad, wadTexture.name, byteToLightOffset(lightLevel),
			);

			texture.userData.wadTexture = wadTexture;
			plane.material.map = texture;
			plane.material.needsUpdate = true;

			this.alignTexture(plane, texture)
		}

		for(const plane of [...this.floorPlanes, ...this.ceilingPlanes])
		{
			const wadTexture = plane.userData.wadTexture;
			const texture = await loadTexture(
				this.level.wad, wadTexture.name, byteToLightOffset(lightLevel),
			);

			texture.repeat.set(plane.userData.size[0] / 64, plane.userData.size[1] / 64);

			texture.userData.wadTexture = wadTexture;
			plane.material.map = texture;
			plane.material.needsUpdate = true;
		}
	}

	openDoor(closeTime)
	{
		if(this.timer || this.ceilingHeight !== this.targetCeilingHeight)
		{
			return false;
		}

		this.closeTime = closeTime * 1000;

		let lowest = Infinity;

		for(const neighbor of this.neighbors)
		{
			if(neighbor.ceilingHeight < lowest)
			{
				this.targetCeilingHeight = lowest = neighbor.ceilingHeight;
				this.timer = 10;
			}
		}

		this.targetCeilingHeight -= 4;

		return true;
	}

	closeDoor()
	{
		if(this.timer || this.ceilingHeight !== this.targetCeilingHeight)
		{
			return false;
		}

		this.targetCeilingHeight = this.originalCeilingHeight;

		return true;
	}

	lowerCeiling(modifier, time)
	{
		this.targetCeilingHeight = this.floorHeight;
	}

	lowerLift(action)
	{
		if(this.timer || this.ceilingHeight !== this.targetCeilingHeight)
		{
			return false;
		}

		const time = action.tm > 0 ? action.tm : 6;

		this.closeTime = time * 1000;

		let highest = Infinity;

		for(const neighbor of this.neighbors)
		{
			if(neighbor.floorHeight < highest && neighbor.floorHeight < this.floorHeight && neighbor.index !== this.index)
			{
				this.targetFloorHeight = highest = neighbor.floorHeight;
				this.timer = 10;
			}
		}

		return true;
	}

	raiseFloor(action)
	{
		const time = action.tm > 0 ? action.tm : 6;

		if(this.timer || this.ceilingHeight !== this.targetCeilingHeight)
		{
			return false;
		}

		this.closeTime = time * 1000;

		let highest = Infinity;

		for(const neighbor of this.neighbors)
		{
			if(neighbor.floorHeight < highest && neighbor.floorHeight > this.floorHeight && neighbor.index !== this.index)
			{
				this.targetFloorHeight = highest = neighbor.floorHeight;
				this.timer = 10;
			}
		}

		return true;
	}

	raiseCeiling(action)
	{
		const time = action.tm > 0 ? action.tm : 6;

		if(this.timer || this.ceilingHeight !== this.targetCeilingHeight)
		{
			return false;
		}

		this.closeTime = time * 1000;

		let highest = -Infinity;

		for(const neighbor of this.neighbors)
		{
			if(neighbor.ceilingHeight > highest && neighbor.ceilingHeight > this.ceilingHeight && neighbor.index !== this.index)
			{
				this.targetFloorHeight = highest = neighbor.floorHeight;
				this.timer = 10;
			}
		}

		return true;
	}

	moveCeiling(to)
	{
		this.targetCeilingHeight = to;
	}

	raiseStaircase(action, step = 0)
	{
		this.targetFloorHeight = this.originalFloorHeight + (step + 1)  * 8;

		let next = null;

		for(const linedef of this.linedefs)
		{
			const left = linedef.left > -1 && this.level.map.sidedef(linedef.left);

			if(!left) continue;
			const lSector = left && map.sector(left.sector);

			if(lSector && lSector.index !== this.index && lSector.floorFlat === this.floorFlat)
			{
				next = this.level.rooms.get(left.sector);
				next && next.raiseStaircase(action, step + 1);
				break;
			}
		}
	}

	moveGeometry()
	{
		for(const plane of this.ceilingPlanes)
		{
			plane.position.y =  this.ceilingHeight - this.originalCeilingHeight;
		}

		for(const plane of this.floorPlanes)
		{
			plane.position.y =  this.floorHeight - this.originalFloorHeight;
		}

		for(const plane of this.middlePlanes)
		{
			const originalHeight = plane.userData.textureHeight;
			const rSector = plane.userData.rSector;
			const lSector = plane.userData.lSector;

			const rRoom = this.level.rooms.get(rSector.index);
			const lRoom = lSector && this.level.rooms.get(lSector.index);

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
			const sector  = plane.userData.sector;

			const rRoom = this.level.rooms.get(rSector.index);
			const lRoom = lSector && this.level.rooms.get(lSector.index);
			const room  = level.rooms.get(sector.index);

			const height  = room.ceilingHeight - room.floorHeight;

			const maxFloor   = !lRoom ? rRoom.floorHeight : Math.max(rRoom.floorHeight, lRoom.floorHeight);
			const minFloor   = !lRoom ? rRoom.floorHeight : Math.min(rRoom.floorHeight, lRoom.floorHeight);

			const lowerHeight  = maxFloor - minFloor;

			plane.material.map.repeat.y = lowerHeight / originalHeight;
			plane.position.y = lowerHeight/2 + minFloor;
			plane.scale.y = lowerHeight;

			if(plane.userData.lowerUnpegged)
			{
				plane.material.map.offset.y = (plane.userData.yOffset + -height + originalHeight) / originalHeight;
			}
		}

		for(const plane of this.upperPlanes)
		{
			const originalHeight = plane.userData.textureHeight;
			const rSector = plane.userData.rSector;
			const lSector = plane.userData.lSector;

			const rRoom = this.level.rooms.get(rSector.index);
			const lRoom = lSector && this.level.rooms.get(lSector.index);

			const maxFloor   = !lRoom ? rRoom.floorHeight   : Math.max(rRoom.floorHeight,   lRoom.floorHeight);
			const minCeiling = !lRoom ? rRoom.ceilingHeight : Math.min(rRoom.ceilingHeight, lRoom.ceilingHeight);
			const maxCeiling = !lRoom ? rRoom.ceilingHeight : Math.max(rRoom.ceilingHeight, lRoom.ceilingHeight);

			const upperHeight  = maxCeiling - minCeiling;

			plane.material.map.repeat.y = upperHeight / originalHeight;
			plane.position.y = upperHeight/2 + minCeiling;
			plane.scale.y = upperHeight;
		}
	}

	slope()
	{
		if(!this.slopedSectorA || !this.slopedSectorB)
		{
			return;
		}

		console.log(this.floorHeight, this.slopedSectorA.floorHeight, this.slopedSectorB.floorHeight);

		const ceilingDiff = this.slopedSectorA.ceilingHeight - this.slopedSectorB.ceilingHeight;
		const floorDiff   = this.slopedSectorA.floorHeight   - this.slopedSectorB.floorHeight;

		this.ceilingHeight = this.targetCeilingHeight = 0.5 * (this.slopedSectorA.ceilingHeight + this.slopedSectorB.ceilingHeight);
		this.floorHeight   = this.targetFloorHeight   = 0.5 * (this.slopedSectorA.floorHeight   + this.slopedSectorB.floorHeight);

		console.log(this.floorHeight, this.slopedSectorA.floorHeight, this.slopedSectorB.floorHeight);

		this.moveGeometry();

		for(const plane of this.floorPlanes)
		{
			const pos = plane.geometry.attributes.position;
			const box = new THREE.Box3().setFromBufferAttribute(pos);
			const center = new THREE.Vector3;
			box.getCenter(center);

			const nCenter = center.clone().normalize();
			const tr = center.length();
			const angle = Math.atan2(floorDiff, this.slopeDist);

			console.log(floorDiff, this.slopeDist);

			plane
			.translateOnAxis(nCenter, tr)
			.rotateOnWorldAxis(this.slopeVec, angle)
			.translateOnAxis(nCenter, -tr);
		}

		for(const plane of this.ceilingPlanes)
		{
			const pos = plane.geometry.attributes.position;
			const box = new THREE.Box3().setFromBufferAttribute(pos);
			const center = new THREE.Vector3;
			box.getCenter(center);

			const nCenter = center.clone().normalize();
			const tr = center.length();
			const angle = Math.atan2(ceilingDiff, this.slopeDist);

			console.log(ceilingDiff, this.slopeDist);

			plane
			.translateOnAxis(nCenter, tr)
			.rotateOnWorldAxis(this.slopeVec, angle)
			.translateOnAxis(nCenter, -tr);
		}
	}

	async addWall(linedef, isLeftWall)
	{
		this.linedefs.add(linedef);

		if([11].includes(linedef.action) && isLeftWall)
		{
			// this.isSwitch = true;
		}

		if([1,26,27,28,31].includes(linedef.action) && isLeftWall)
		{
			this.isDoor = true;
		}

		if([2,90,103].includes(linedef.action))
		{
			if(this.level.tags.has(linedef.tag))
			for(const other of this.level.tags.get(linedef.tag))
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
		const oRoom   = other && other.index !== this.index && this.level.rooms.get(other.index);

		oRoom && this.neighbors.add(oRoom);

		if(this.level.map.format === 'HEXEN')
		{
			if([181].includes(linedef.action))
			{
				console.log(linedef);

				if(!isLeftWall)
				{
					this.slopedLinedef = linedef;
				}
			}
		}

		const light   = byteToLightOffset(sector.lightLevel);
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

		const wall = {middle: null, lower: null, upper: null};

		this.walls.set(linedef.index, wall);

		if(isTextureName(sidedef.middle))
		{
			if(!textures.has(sidedef.middle))
			{
				textures.set(sidedef.middle, new Map);
			}

			if(!textures.get(sidedef.middle).has(this.lightLevel))
			{
				const texture = await loadTexture(wad, sidedef.middle, light);

				textures.get(sidedef.middle).set(this.lightLevel, texture);
			}

			const texture = textures.get(sidedef.middle).get(this.lightLevel).clone();

			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({map: texture});
			const geometry = new THREE.PlaneGeometry(length, 1, 1);
			const plane = new THREE.Mesh(geometry, material);

			wall.middle = plane;

			plane.userData.textureName = sidedef.middle;
			plane.userData.textureHeight = middleHeight;
			plane.scale.y = middleHeight;
			this.level.planes++;

			if(wadTexture)
			{
				material.transparent = wadTexture.transparent;

				if(wadTexture.transparent) this.level.transparentPlanes++;

				const hRepeat = length / wadTexture.width;
				const vRepeat = middleHeight / wadTexture.height;

				plane.userData.textureHeight = wadTexture.height;
				plane.userData.repeat = [hRepeat, vRepeat];

				if(lowerUnpegged)
				{
					plane.userData.center = [0, 0];
					plane.userData.offset = [
						right.xOffset / wadTexture.width,
						(wadTexture.height + -right.yOffset) / wadTexture.height,
					];
				}
				else
				{
					plane.userData.center = [0, 1];
					plane.userData.offset = [
						right.xOffset / wadTexture.width,
						(wadTexture.height + -right.yOffset) / wadTexture.height,
						// (wadTexture.height + -middleHeight + -right.yOffset) / wadTexture.height
					];
				}

				this.alignTexture(plane, texture);

				if(wadTexture.animation)
				{
					this.setupWallAnimation(plane, wadTexture.animation, light);
				}
			}
			else
			{
				texture.repeat.set(length / 64, middleHeight / 64);
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = middleHeight/2 + maxFloor;
			plane.rotation.y = angle + (isLeftWall ? Math.PI : 0);

			plane.userData.rSector = rSector;
			plane.userData.lSector = lSector;

			this.middlePlanes.add(plane);
			if(oRoom) oRoom.middlePlanes.add(plane);
			if(!isLeftWall) this.innerPlanes.add(plane);
			this.scene.add(plane);
		}

		if(isTextureName(sidedef.lower))
		{
			if(!textures.has(sidedef.lower))
			{
				textures.set(sidedef.lower, new Map);
			}

			if(!textures.get(sidedef.lower).has(this.lightLevel))
			{
				const texture = await loadTexture(wad, sidedef.lower, light);

				textures.get(sidedef.lower).set(this.lightLevel, texture);
			}

			const texture = textures.get(sidedef.lower).get(this.lightLevel).clone();

			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({map: texture});
			const geometry = new THREE.PlaneGeometry(length, 1, 1);
			const plane = new THREE.Mesh(geometry, material);

			wall.lower = plane;

			plane.userData.textureName = sidedef.lower;
			plane.userData.lowerUnpegged = lowerUnpegged;
			plane.userData.textureHeight = lowerHeight;
			plane.userData.sector = sector;
			plane.scale.y = lowerHeight;
			this.level.planes++;

			if(wadTexture)
			{
				material.transparent = wadTexture.transparent;

				if(wadTexture.transparent) this.level.transparentPlanes++;

				const hRepeat = length / wadTexture.width;
				const vRepeat = lowerHeight / wadTexture.height;
				plane.userData.repeat = [hRepeat, vRepeat];
				plane.userData.textureHeight = wadTexture.height;
				plane.userData.yOffset = sidedef.yOffset;

				if(lowerUnpegged)
				{
					plane.userData.center = [0, 0];
					plane.userData.offset = [
						sidedef.xOffset / wadTexture.width,
						(sidedef.yOffset + -height + wadTexture.height) / wadTexture.height
					];
				}
				else
				{
					plane.userData.center = [0, 1];
					plane.userData.offset = [
						sidedef.xOffset / wadTexture.width,
						-sidedef.yOffset / wadTexture.height
					];
				}

				this.alignTexture(plane, texture);

				if(wadTexture.animation)
				{
					this.setupWallAnimation(plane, wadTexture.animation, light);
				}
			}
			else
			{
				texture.repeat.set(length / 64, lowerHeight / 64);
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = lowerHeight/2 + minFloor;
			plane.rotation.y = angle + (isLeftWall ? Math.PI : 0);

			plane.userData.rSector = rSector;
			plane.userData.lSector = lSector;

			this.lowerPlanes.add(plane);
			if(oRoom) oRoom.lowerPlanes.add(plane);
			if(!isLeftWall) this.innerPlanes.add(plane);
			this.scene.add(plane);
		}

		const rSky = rSector.ceilingFlat === 'F_SKY1';
		const lSky = lSector.ceilingFlat === 'F_SKY1';

		if(!(rSky && lSky) && isTextureName(sidedef.upper))
		{
			if(!textures.has(sidedef.upper))
			{
				textures.set(sidedef.upper, new Map);
			}

			if(!textures.get(sidedef.upper).has(this.lightLevel))
			{
				const texture = await loadTexture(wad, sidedef.upper, light);

				textures.get(sidedef.upper).set(this.lightLevel, texture);
			}

			const texture = textures.get(sidedef.upper).get(this.lightLevel).clone();

			const wadTexture = texture.userData.wadTexture;
			const material = new THREE.MeshBasicMaterial({map: texture});
			const geometry = new THREE.PlaneGeometry(length, 1, 1);
			const plane = new THREE.Mesh(geometry, material);

			wall.upper = plane;

			plane.userData.textureName = sidedef.upper;
			plane.userData.textureHeight = upperHeight;
			plane.scale.y = upperHeight;
			this.level.planes++;

			if(wadTexture)
			{
				material.transparent = wadTexture.transparent;

				if(wadTexture.transparent) this.level.transparentPlanes++;

				const hRepeat = length / wadTexture.width;
				const vRepeat = upperHeight / wadTexture.height;

				plane.userData.textureHeight = wadTexture.height;
				plane.userData.repeat = [hRepeat, vRepeat];

				if(upperUnpegged)
				{
					plane.userData.center = [0, 1];
				}
				else
				{
					plane.userData.center = [0, 0];
				}

				plane.userData.offset = [
					sidedef.xOffset / wadTexture.width,
					-sidedef.yOffset / wadTexture.height
				];

				this.alignTexture(plane, texture);

				if(wadTexture.animation)
				{
					this.setupWallAnimation(plane, wadTexture.animation, light);
				}
			}
			else
			{
				texture.repeat.set(length / 64, lowerHeight / 64);
			}

			plane.position.x = xCenter;
			plane.position.z = yCenter;
			plane.position.y = upperHeight/2 + minCeiling;
			plane.rotation.y = angle + (isLeftWall ? Math.PI : 0);

			plane.userData.rSector = rSector;
			plane.userData.lSector = lSector;

			this.upperPlanes.add(plane);
			if(oRoom) oRoom.upperPlanes.add(plane);
			if(!isLeftWall) this.innerPlanes.add(plane);
			this.scene.add(plane);
		}
	}

	alignTexture(plane, texture)
	{
		texture.center.set(...plane.userData.center);
		texture.offset.set(...plane.userData.offset);
		texture.repeat.set(...plane.userData.repeat);
	}

	async changeWallTexture(plane, textureName, lightLevel)
	{
		const wadTexture = wad.texture(textureName);

		if(!textures.has(textureName))
		{
			textures.set(textureName, new Map);
		}

		if(!textures.get(textureName).has(this.lightLevel))
		{
			const url = await wadTexture.decode(lightLevel);
			const texture = textureLoader.load(url);

			textures.get(textureName).set(this.lightLevel, texture);
		}

		const texture = textures.get(textureName).get(this.lightLevel).clone();

		this.alignTexture(plane, texture);

		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.magFilter = THREE.NearestFilter;
		texture.colorSpace = THREE.SRGBColorSpace;

		plane.material.map = texture;
		plane.material.needsUpdate = true;
	}

	async setupWallAnimation(plane, animation, lightLevel)
	{
		this.level.animatedWalls.add(plane);

		plane.userData.animation = animation;
		plane.userData.age = 0;

		const frameNames = wad.textureAnimation(animation);
		const frames = [];

		if(frameNames)
		for(const frameName of frameNames)
		{
			const wadTexture = wad.texture(frameName);

			if(!textures.has(frameName))
			{
				textures.set(frameName, new Map);
			}

			if(!textures.get(frameName).has(this.lightLevel))
			{
				const url = await wadTexture.decode(lightLevel);
				const texture = textureLoader.load(url);

				textures.get(frameName).set(this.lightLevel, texture);
			}

			const texture = textures.get(frameName).get(this.lightLevel).clone();

			this.alignTexture(plane, texture);

			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
			texture.magFilter = THREE.NearestFilter;
			texture.colorSpace = THREE.SRGBColorSpace;

			frames.push(texture);
		}

		plane.userData.frames = frames;
	}

	async addFlats(glSubsectors)
	{
		const sector = this.sector;

		const lightLevel = byteToLightOffset(sector.lightLevel);

		const ceilingGeos = [];
		const floorGeos = [];

		for(const glSubsector of glSubsectors)
		{
			const original = glSubsector.vertexes();
			const vertexes = original.map(v => flipVertex(map, v));
			const Vector2s = vertexes.map(v => new THREE.Vector2(v.x, v.y));
			const backward = [...Vector2s].reverse();

			const floorShape = new THREE.Shape(Vector2s);
			const ceilingShape = new THREE.Shape(backward);

			const floorGeometry = new THREE.ShapeGeometry(floorShape);

			floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
				vertexes.map(vertex => [vertex.x, sector.floorHeight, vertex.y]).flat(), 3
			));

			const ceilingGeometry = new THREE.ShapeGeometry(ceilingShape);

			ceilingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
				backward.map(vertex => [vertex.x, sector.ceilingHeight, vertex.y]).flat(), 3
			));

			floorGeos.push(floorGeometry);
			ceilingGeos.push(ceilingGeometry);
		}

		const floorGeometry = BufferGeometryUtils.mergeGeometries(floorGeos);
		const ceilingGeometry = BufferGeometryUtils.mergeGeometries(ceilingGeos);

		const pos = floorGeometry.attributes.position;
		const box = new THREE.Box3().setFromBufferAttribute(pos);
		const size = new THREE.Vector3();
		box.getSize(size);

		const floorFlat   = wad.flat(sector.floorFlat)   || wad.texture(sector.floorFlat);
		const ceilingFlat = wad.flat(sector.ceilingFlat) || wad.texture(sector.ceilingFlat);

		if(!textures.has(sector.floorFlat))
		{
			textures.set(sector.floorFlat, new Map);
		}

		if(!textures.has(sector.ceilingFlat))
		{
			textures.set(sector.ceilingFlat, new Map);
		}

		if(sector.floorFlat === 'GRASS1_2')
		{
			console.log(floorFlat, sector);
		}

		if(!textures.get(sector.floorFlat).has(lightLevel))
		{
			const floorTexture = floorFlat ? textureLoader.load(await floorFlat.decode(lightLevel)) : missing.clone();
			// if(lowRes) floorTexture.minFilter = THREE.NearestFilter;
			floorTexture.magFilter = THREE.NearestFilter;
			floorTexture.colorSpace = THREE.SRGBColorSpace;
			floorTexture.wrapS = THREE.RepeatWrapping;
			floorTexture.wrapT = THREE.RepeatWrapping;
			textures.get(sector.floorFlat).set(lightLevel, floorTexture);

			if(!floorFlat) console.log(sector.floorFlat);
			if(!ceilingFlat) console.log(sector.ceilingFlat);
		}

		if(!textures.get(sector.ceilingFlat).has(lightLevel))
		{
			const ceilingTexture = ceilingFlat ? textureLoader.load(await ceilingFlat.decode(lightLevel))  : missing.clone();
			// if(lowRes) ceilingTexture.minFilter = THREE.NearestFilter;
			ceilingTexture.magFilter = THREE.NearestFilter;
			ceilingTexture.colorSpace = THREE.SRGBColorSpace;
			ceilingTexture.wrapS = THREE.RepeatWrapping;
			ceilingTexture.wrapT = THREE.RepeatWrapping;
			textures.get(sector.ceilingFlat).set(lightLevel, ceilingTexture);
		}

		const floorTexture = textures.get(sector.floorFlat).get(lightLevel).clone();
		const ceilingTexture = textures.get(sector.ceilingFlat).get(lightLevel).clone();

		floorTexture.repeat.set(size.x / 64, size.z / 64);
		ceilingTexture.repeat.set(size.x / 64, size.z / 64);

		const floorMaterial   = new THREE.MeshBasicMaterial({map: floorTexture,   transparent: false});
		const ceilingMaterial = new THREE.MeshBasicMaterial({map: ceilingTexture, transparent: false});

		const floor   = new THREE.Mesh(floorGeometry, floorMaterial);
		const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);

		ceiling.userData.wadTexture = ceilingFlat;
		ceiling.userData.size       = [size.x, size.z];
		floor.userData.wadTexture   = floorFlat;
		floor.userData.size         = [size.x, size.z];

		if(floorFlat && floorFlat.animation)
		{
			floor.userData.animation = floorFlat.animation;
			floor.userData.age = 0;
			this.level.animatedFlats.add(floor);

			const frameNames = wad.flatAnimation(floorFlat.animation);
			const frames = [];

			if(frameNames)
			for(const frameName of frameNames)
			{
				const flat = wad.flat(frameName);
				const url  = await flat.decode(lightLevel);

				if(!textures.has(frameName))
				{
					textures.set(frameName, new Map);
				}

				if(!textures.get(frameName).has(this.lightLevel))
				{
					const texture = textureLoader.load(url);

					texture.colorSpace = THREE.SRGBColorSpace;
					texture.wrapS = THREE.RepeatWrapping;
					texture.wrapT = THREE.RepeatWrapping;

					textures.get(frameName).set(this.lightLevel, texture);
				}

				const texture = textures.get(frameName).get(this.lightLevel).clone();
				texture.repeat.set(size.x / 64, size.z / 64);
				frames.push(texture);
			}

			floor.userData.frames = frames;
		}

		if(ceilingFlat && ceilingFlat.animation)
		{
			ceiling.userData.animation = ceilingFlat.animation;
			ceiling.userData.age = 0;
			this.level.animatedFlats.add(ceiling);

			const frameNames = wad.flatAnimation(ceilingFlat.animation);
			const frames = [];

			if(frameNames)
			for(const frameName of frameNames)
			{
				const flat = wad.flat(frameName);
				const url  = await flat.decode(lightLevel);

				if(!textures.has(frameName))
				{
					textures.set(frameName, new Map);
				}

				if(!textures.get(frameName).has(this.lightLevel))
				{
					const texture = textureLoader.load(url);

					texture.colorSpace = THREE.SRGBColorSpace;
					texture.wrapS = THREE.RepeatWrapping;
					texture.wrapT = THREE.RepeatWrapping;

					textures.get(frameName).set(this.lightLevel, texture);
				}

				const texture = textures.get(frameName).get(this.lightLevel).clone();
				texture.repeat.set(size.x / 64, size.z / 64);
				frames.push(texture);
			}

			ceiling.userData.frames = frames;
		}

		let xfOffset = 0;
		let xcOffset = 0;
		let yfOffset = map.bounds.yPosition % 64;
		let ycOffset = map.bounds.yPosition % 64;

		this.setUV(floorGeometry, xfOffset, yfOffset);
		this.setUV(ceilingGeometry, xcOffset, ycOffset);

		this.ceilingPlanes.add(ceiling);
		this.floorPlanes.add(floor);

		this.scene.add(floor);

		if(sector.ceilingFlat !== 'F_SKY1')
		{
			this.scene.add(ceiling);
		}
	}

	setUV(geometry, xOffset, yOffset)
	{
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

	addThing(thing)
	{
		if(this.level.roomThings.has(thing))
		{
			const room = this.level.roomThings.get(thing);
			this.level.roomThings.delete(thing);
			room.things.delete(thing);
		}

		this.level.roomThings.set(thing, this);
		this.things.add(thing);
	}

	flipSwitch(linedef)
	{
		if(!linedef.actionMeta || this.switchesFlipped.has(linedef.index))
		{
			return;
		}

		this.switchesFlipped.add(linedef.index);
		const wall = this.walls.get(linedef.index);

		const middleSwitch = wall.middle && wall.middle.userData.textureName && wall.middle.userData.textureName.match(/^SW[12]/) && wall.middle.userData.textureName;
		const lowerSwitch  = wall.lower  && wall.lower.userData.textureName  && wall.lower.userData.textureName.match(/^SW[12]/)  && wall.lower.userData.textureName;
		const upperSwitch  = wall.upper  && wall.upper.userData.textureName  && wall.upper.userData.textureName.match(/^SW[12]/)  && wall.upper.userData.textureName;

		if(middleSwitch)
		{
			const on  = (middleSwitch.substr(2, 1) === '2' ? 'SW1' : 'SW2');
			const off = (middleSwitch.substr(2, 1) === '2' ? 'SW2' : 'SW1');

			this.changeWallTexture(
				wall.middle,
				on + wall.middle.userData.textureName.substr(3),
				byteToLightOffset(this.lightLevel),
			);

			const from = map.vertex(linedef.from);
			const to   = map.vertex(linedef.to);

			const xCenter = (from.x + to.x) * 0.5;
			const yCenter = (from.y + to.y) * 0.5;

			playSample(wad.sample('DSSWTCHN'), xCenter, yCenter).then(async () => {
				await new Promise(a => setTimeout(a, 1500));

				this.changeWallTexture(
					wall.middle,
					off + wall.middle.userData.textureName.substr(3),
					byteToLightOffset(this.lightLevel),
				);

				playSample(wad.sample('DSSWTCHX'), xCenter, yCenter);
				this.switchesFlipped.delete(linedef.index);
			});
		}

		if(lowerSwitch)
		{
			const on  = (lowerSwitch.substr(2, 1) === '2' ? 'SW1' : 'SW2');
			const off = (lowerSwitch.substr(2, 1) === '2' ? 'SW2' : 'SW1');

			this.changeWallTexture(
				wall.lower,
				on + wall.lower.userData.textureName.substr(3),
				byteToLightOffset(this.lightLevel),
			);

			playSample(wad.sample('DSSWTCHN')).then(async () => {
				await new Promise(a => setTimeout(a, 1500));
				this.changeWallTexture(
					wall.lower,
					off + wall.lower.userData.textureName.substr(3),
					byteToLightOffset(this.lightLevel),
				);
				playSample(wad.sample('DSSWTCHX'));
				this.switchesFlipped.delete(linedef.index);
			});
		}

		if(upperSwitch)
		{
			const on  = (upperSwitch.substr(2, 1) === '2' ? 'SW1' : 'SW2');
			const off = (upperSwitch.substr(2, 1) === '2' ? 'SW2' : 'SW1');

			this.changeWallTexture(
				wall.upper,
				on + wall.upper.userData.textureName.substr(3),
				byteToLightOffset(this.lightLevel),
			);

			playSample(wad.sample('DSSWTCHN')).then(async () => {
				await new Promise(a => setTimeout(a, 1500));

				this.changeWallTexture(
					wall.upper,
					off + wall.upper.userData.textureName.substr(3),
					byteToLightOffset(this.lightLevel),
				);

				playSample(wad.sample('DSSWTCHX'));
				this.switchesFlipped.delete(linedef.index);
			});
		}
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

	return [x, y, t];
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

const samplesPlaying = new Map;
const audioCtx = new (AudioContext || webkitAudioContext);

const playSample = (sample, xPosition, yPosition) => {
	if(!sample)
	{
		console.warn('Invalid sample.', sample);
		return;
	}

	const buffer = audioCtx.createBuffer(1, sample.length, sample.rate);
	const channelData = buffer.getChannelData(0);

	for(let i = 0; i < sample.length; i++)
	{
		channelData[i] = (sample.samples[i] - 128) / 128;
	}

	const source  = audioCtx.createBufferSource();
	const stereo  = new StereoPannerNode(audioCtx, {pan: 0});
	const gain    = new GainNode(audioCtx, {gain: 0.5});
	source.buffer = buffer;

	source.connect(gain).connect(stereo).connect(audioCtx.destination);

	source.start();

	let accept;
	const waiter = new Promise(a => accept = a);

	source.addEventListener('ended', () => {
		samplesPlaying.delete(sample);
		accept();
	}, {once: true});

	samplesPlaying.set(buffer, {xPosition, yPosition, stereo, gain});

	return waiter;
};

const runGlbsp = async (wadBuffer) => {
	const glbsp = await GlbspBinary({
		print: line => console.log(line),
		printErr: line => {console.warn(line)},
	});

	glbsp.FS.writeFile('/tmp/bsp-source.wad', new Uint8Array(wadBuffer));
	const args = ['glbsp', '-w', '-xr', '/tmp/bsp-source.wad', '-o', '/tmp/bsp-out.wad'];

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

let level;

const myWorker = new Worker(new URL("./worker.js", import.meta.url));

const setup = async () => {
	console.time('setup');

	const ms = new MessageString('Loading...');
	document.querySelector('#loader').append(ms.container);

	let prefix = '';

	if(process.env.NODE_ENV === 'production')
	{
		prefix = '/doom-renderer'
	}

	const query = new URLSearchParams(location.search);

	let selectedWad = query.has('wad') ? query.get('wad') : 'DOOM.WAD';

	if(query.get('random-level'))
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

	const iWadList = [
		await (await fetch(prefix + '/wads/freedoom1.wad')).arrayBuffer(),
		await (await fetch(prefix + '/wads/freedoom2.wad')).arrayBuffer(),
		await (await fetch(prefix + '/wads/DOOM1.WAD')).arrayBuffer(),
		// await (await fetch(prefix + '/wads/DOOM2.WAD')).arrayBuffer(),
		// await (await fetch(prefix + '/wads/Skulltag-v097d5.wad')).arrayBuffer(),
		// await (await fetch(prefix + '/wads/CHEX.wad')).arrayBuffer(),
	];

	const pWadList = [];

	let randomMap = null;

	if(selectedWad)
	{
		const bytes = await (await fetch(wadUrl)).arrayBuffer();
		pWadList.push(bytes);

		const pwad = new Wad(bytes);

		if(query.get('random-level'))
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
		throw new Error(`Map ${wadUrl.substr(6)} not found.`);
	}

	map = wad.loadMap(selectedMap);

	const originalMapData = map.splitMap(selectedMap);
	let mapData = originalMapData;
	const single = new Wad(mapData);

	if(!single.getLumpByName('GL_NODES'))
	{
		ms.setText(`${wadUrl.substr(6)}#${selectedMap}\nBuilding BSP Nodes`);

		mapData = await runGlbsp(mapData);
		map = wad.loadMap(selectedMap);
	}

	if(!map.lumps.GL_PVS || !map.lumps.GL_PVS.size)
	{
		let accept;
		const waiter = new Promise(a => accept = a);

		myWorker.addEventListener('message', event => {
			if(event.data.done)
			{
				accept(event.data.mapData);
			}
			else
			{
				ms.setText(`${wadUrl.substr(6)}#${selectedMap}\nPortal Sight-Checks Remaining: ${event.data.status}`);
			}
		});

		myWorker.postMessage(mapData);

		mapData = await waiter;

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

	const res = lowRes ? (320 / window.innerWidth) : 1;

	const canvas = document.querySelector('canvas');
	renderer = new THREE.WebGLRenderer( { canvas, powerPreference: 'high-performance' } );
	renderer.setClearColor(0xFFFFFF);
	renderer.setPixelRatio( window.devicePixelRatio * res);
	renderer.setSize(window.innerWidth * res, window.innerHeight * res);
	render.autoClear = false;

	// document.body.appendChild( renderer.domElement );

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
			case 'KeyM':
				lowRes = !lowRes;
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

	ms.setText(`${wadUrl.substr(6)}#${selectedMap}\nNow Starting...`);

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
		link.href = location.origin + location.pathname + '?wad=' + wadUrl.substr(6) + '&map=' + selectedMap;
		link.innerText = '?wad=' + wadUrl.substr(6) + '&map=' + selectedMap;
		linkBox.appendChild(link);
	}

	// const sTexture = new THREE.TextureLoader().load( await wad.picture('STCFN083').decode() );
	// const sMaterial = new THREE.SpriteMaterial( { map: sTexture } );
	// const sprite = new THREE.Sprite(sMaterial);
	// sprite.position.set(camera.position.x, camera.position.y, camera.position.z);
	// mainScene.add( sprite );
}

let then = 0;

const camDir = new THREE.Vector3();

let xSpeed = 0;
let ySpeed = 0;

const ldAction = (linedef, room, oRoom, dot) => {
	// console.log(linedef.actionMeta);
	if(linedef.actionMeta)
	switch(linedef.actionMeta.type)
	{
		case 'mDoor':
			// console.assert(oRoom.isDoor, 'Other room is not a door!');
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
			if(level.tags.has(linedef.tag))
			for(const sector of level.tags.get(linedef.tag))
			{
				const lift = level.rooms.get(sector.index);
				switch(linedef.actionMeta.index)
				{
					case 40:
						lift.raiseCeiling(linedef.actionMeta);
						break;
					case 41:
					case 43:
					case 44:
					case 49:
					case 72:
						lift.lowerCeiling(linedef.actionMeta);
						break;
				}
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

const render = (now) => {
	requestAnimationFrame(render);

	const delta = Math.min(32, now - then);

	if(delta < 16)
	{
		return;
	}

	for(const room of level.rooms.values())
	{
		room.simulate(delta);
	}

	then = now;

	level.simulate(delta);

	const flipped = unflipVertex(map, {
		x: camera.position.x,
		y: camera.position.z,
	});

	const sector = map.bspPoint(flipped.x, flipped.y);
	const room = level.rooms.get(sector.index);

	if(sector)
	{
		yCam = room.floorHeight + 48;
	}

	if(map.lumps.GL_PVS && map.lumps.GL_PVS.size)
	{
		const ssector = map.bspPoint(flipped.x, flipped.y, true);
		const visible = map.glpvsVisibleFrom(ssector.index);

		// console.log(visible);
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

	room.show();

	camera.getWorldDirection(camDir);

	const hCam = Math.atan2(camDir.z, camDir.x);
	const vCam = camDir.y;

	const xImpulse = Number(moveRight) - Number(moveLeft);
	const yImpulse = Number(moveBackward) - Number(moveForward);

	const impulseDir = Math.atan2(1.25 * yImpulse, xImpulse) + hCam + Math.PI/2;
	const impulseMag = Math.hypot(1.25 * yImpulse, xImpulse);

	const xSpeedChange = Math.cos(impulseDir) * impulseMag * 0.03125 * ( (delta/1000)/(1/35) );
	const ySpeedChange = Math.sin(impulseDir) * impulseMag * 0.03125 * ( (delta/1000)/(1/35) );

	xSpeed += xSpeedChange * 40;
	ySpeed += ySpeedChange * 40;

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

		const fromDot  = (xCamVec * xFromVec + zCamVec * yFromVec);
		const toDot    = (xCamVec * xToVec + zCamVec * yToVec);

		const lineMag  = Math.hypot(to.y - from.y, to.x - from.x);
		const lineVec  = [(to.y - from.y) / lineMag, (to.x - from.x) / lineMag]; // [y, x]
		const lineNVec = [lineVec[1], lineVec[0]]; // [y, x]
		// const lineNDot = (lineNVec[0] * (ySpeed/speedMag) + lineNVec[1] * (xSpeed/speedMag));
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

			if(speedLineDot <= 0 && nearestLineMag < 16)
			{
				// linedef && console.log(linedef);

				if(nearest.t > (0 - margin) && nearest.t < (1 + margin))
				{
					camera.position.x += Math.cos(nearestLineDir + Math.PI) * -(16-nearestLineMag);
					camera.position.z += Math.sin(nearestLineDir + Math.PI) * -(16-nearestLineMag);

					xSpeed += Math.cos(nearestLineDir + Math.PI) * -Math.min(16 - nearestLineMag, Math.abs(speedMag));
					ySpeed += Math.sin(nearestLineDir + Math.PI) * -Math.min(16 - nearestLineMag, Math.abs(speedMag));

					if(room && lineNDot < 0 && linedef.actionMeta && linedef.actionMeta.modifier.indexOf('S') > -1)
					{
						room.lastAction = linedef.actionMeta;
						room.flipSwitch(linedef);
						ldAction(linedef, room, oRoom, lineNDot);
						if(linedef.actionMeta.type === 'Exit')
						{
							console.log(`Next level is ${wad.findNextMap(map.name)}`);
						}
					}
				}
			}
			else if(intersection)
			{
				linedef && console.log(linedef);

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

	renderer.render(mainScene, camera);

	if(!noClip)
	{
		camera.position.x += xSpeed;
		camera.position.z += ySpeed;
	}
	else
	{
		camera.position.x += xSpeed * (1-Math.abs(vCam));
		camera.position.z += ySpeed * (1-Math.abs(vCam));
		camera.position.y += speedMag * -vCam * yImpulse * 0.5;
	}

	mainScene.background.repeat.set(-camera.aspect/2, 0.85);
	mainScene.background.offset.set((-4*hCam)/(Math.PI*2), vCam + -0.15);

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
		camera.getWorldDirection(camDir);
		const unflipped = unflipVertex(map, {x: xPosition, y: yPosition});
		const mag = Math.hypot(unflipped.y - camera.position.z, unflipped.x - camera.position.x);
		if(mag === 0) return;
		const vec = [unflipped.y - camera.position.z, unflipped.x - camera.position.x] // y, x
		const dot = ((vec[0]/mag) * camDir.x - (vec[1]/mag) * camDir.z);
		stereo.pan.value = dot;
		gain.gain.value = 0.25 / Math.sqrt(mag / 0x80);
	}
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
