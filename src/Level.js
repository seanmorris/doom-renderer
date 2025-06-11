import * as THREE from 'three';
import { Room } from './Room';
import { loadTexture, playSample } from './helpers';
import { Entity } from './Entity';
import { QuadTree } from './math/QuadTree';
import { Decorate } from './Decorate';

import d1 from './mobs/doom1-enemies.dec';
import d2 from './mobs/doom2-enemies.dec';
import objects from './mobs/objects.dec';
import decor from './mobs/decor.dec';
import weaps from './mobs/weaps.dec';

const decorate = new Decorate;

decorate.parse(objects);
decorate.parse(d1);
decorate.parse(d2);
decorate.parse(decor);
decorate.parse(weaps);

console.log(decorate);

let fullbright = false;
let showThings = true;

export class Level extends EventTarget
{
	constructor(map, wad, scene, camera)
	{
		super();
		this.things = new Map;
		this.entities = new Set;
		this.rooms = new Map;
		this.map = map;
		this.wad = wad;
		this.scene = scene;
		this.camera = camera;
		this.animatedWalls = new Set;
		this.animatedFlats = new Set;
		this.tags = new Map;
		this.transparentPlanes = 0;
		this.roomThings = new Map;
		this.planes = 0;
		this.textures = new Map;
		this.particles = new Set;
		this.lines = new Set;

		this.quadTree = new QuadTree(map.bounds.xMin, map.bounds.yMin, map.bounds.xMax, map.bounds.yMax);

		console.log(this.quadTree);
	}

	async setup()
	{
		const loadRooms = Array(this.map.sectorCount).fill().map((_,k)=>k).map(async i => {
			this.rooms.set(i, new Room(this.map.sector(i), this, this.scene));
		});

		const loadWalls = Array(this.map.linedefCount).fill().map((_,k)=>k).map(async i => {
			const linedef = this.map.linedef(i);

			const right   = this.map.sidedef(linedef.right);
			const left    = linedef.left >= 0 ? this.map.sidedef(linedef.left) : false;

			const rSector = this.map.sector(right.sector);
			const lSector = left && this.map.sector(left.sector);

			const rRoom   = this.rooms.get(rSector.index);
			const lRoom   = lSector && this.rooms.get(lSector.index);

			await rRoom.addWall(linedef);
			lRoom && await lRoom.addWall(linedef, true);
		});

		const loadThings = Array(this.map.thingCount).fill().map((_,k)=>k).map(async i => {
			const thing = this.map.thing(i);

			if(thing.flags.multip || [2,3,4,10,12,15,24].includes(thing.type)) return;
			// if(thing.flags.multip || [2,3,4,10,12,15,116,127].includes(thing.type)) return;

			const sector = this.map.bspPoint(thing.x, thing.y);
			const room = this.rooms.get(sector.index);

			if(thing.type === 14)
			{
				room.destination = thing;
				return;
			}

			const className = decorate.getClass(thing.type);
			const decDef = decorate.resolve(className);

			if(decDef)
			{
				await this.spawnEntity(thing.x, thing.y, thing.angle, decDef, thing);
			}
		});

		const roomSubsectors = new Map;
		Array(this.map.glSubsectorCount).fill().forEach((_,k) => {
			const subsector = this.map.glSubsector(k);
			const room = this.rooms.get(subsector.sector);
			if(!roomSubsectors.has(room))
			{
				roomSubsectors.set(room, new Set);
			}
			roomSubsectors.get(room).add(subsector);
		});

		const loadFlats = [...roomSubsectors].map(async ([room, subsectors]) => {
			await room.addFlats(subsectors);
		});

		const lightLevel = 0;

		const texture = await loadTexture(this.wad, 'SKY1', lightLevel);

		texture.magFilter = THREE.NearestFilter;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		this.scene.background = texture;

		await Promise.all([...loadRooms, ...loadWalls, ...loadThings, ...loadFlats]);

		for(const room of this.rooms.values())
		{
			const sector = this.map.sector(room.index);

			room.addEventListener('ceiling-start', event => {
				if(!room.isDoor) return;
				if(event.detail.height === event.detail.original) playSample(
					this.wad.sample('DSDOROPN'),
					sector.bounds.xPosition,
					sector.bounds.yPosition,
				)
				else  playSample(
					this.wad.sample('DSDORCLS'),
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
						this.wad.sample('DS' + event.target.lastAction.soundMeta.start),
						sector.bounds.xPosition,
						sector.bounds.yPosition,
					);
				}
			});

			room.addEventListener('floor-stop', event => {
				if(!event.target.lastAction || !event.target.lastAction.soundMeta) return;
				playSample(
					this.wad.sample('DS' + event.target.lastAction.soundMeta.stop),
					sector.bounds.xPosition,
					sector.bounds.yPosition,
				);
			});
		}
	}

	simulate(delta, camera)
	{
		for(const entity of this.entities)
		{
			if(!entity.room.visible) continue;

			entity.simulate(delta, camera);
		}

		for(const room of this.rooms.values())
		{
			// if(!room.visible) continue;
			room.simulate(delta);
		}

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

		for(const particle of this.particles)
		{
			particle.simulate(delta);
		}

		for(const line of this.lines)
		{
			// line.material.opacity = 1 - line.userData.age / line.userData.maxAge;
			line.material.linewidth = line.userData.originalWidth * (1 - line.userData.age / line.userData.maxAge);
			line.material.needsUpdate = true;

			line.userData.age += delta;

			if(line.userData.age > line.userData.maxAge)
			{
				this.scene.remove(line);
				this.lines.delete(line);
			}
		}
	}

	async spawnEntity(x, y, angle, decDef, thing = null)
	{
		const entity = new Entity(x, y, angle, decDef, this);

		await entity.setup(this.camera);

		if(entity.plane)
		{
			this.scene.add(entity.plane);
		}

		this.quadTree.add(entity);

		if(thing)
		{
			this.things.set(thing.index, entity);
		}

		this.entities.add(entity);
		const sector = this.map.bspPoint(x, y);
		const room = this.rooms.get(sector.index);
		room.addThing(entity);

		return entity;
	}

	removeEntity(entity)
	{
		const room = this.rooms.get(entity.sector.index);
		room.removeThing(entity);

		this.entities.delete(entity);

		if(entity.plane)
		{
			this.scene.remove(entity.plane);
		}

		entity.dispose();
	}

	setDetail(lowRes)
	{
		for(const room of this.rooms.values())
		{
			room.setDetail(lowRes);
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

		for(const thing of this.entities)
		{
			thing.hidden = !showThings;

			if(!thing.plane) continue;

			thing.plane.matrixWorldAutoUpdate = showThings;
			thing.plane.matrixAutoUpdate = showThings;
			thing.plane.visible = showThings;
		}
	}

	toggleFullbright()
	{
		fullbright = !fullbright;

		for(const room of this.rooms.values())
		{
			room.changeLightLevel(fullbright ? -1 : null);
		}
	}
}