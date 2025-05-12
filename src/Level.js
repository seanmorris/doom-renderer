import * as THREE from 'three';
import { Room } from './Room';
import { byteToLightOffset, flipVertex, loadTexture, textureLoader, playSample } from './helpers';

let fullbright = false;

let showThings = true;
const things = new Set;
const thingMaterials = new Map;
const thingGeometries = new Map;

export class Level extends EventTarget
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
		this.textures = new Map;
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

			rRoom.addWall(linedef);
			lRoom && lRoom.addWall(linedef, true);
		});

		const loadThings = Array(this.map.thingCount).fill().map((_,k)=>k).map(async i => {
			const thing = this.map.thing(i);

			if(thing.flags.multip || [2,3,4,10,12,15,24].includes(thing.type)) return;
			// if(thing.flags.multip || [2,3,4,10,12,15,116,127].includes(thing.type)) return;

			if(!thing.meta)
			{
				return;
			}

			const spriteName = thing.meta.sprite;
			const sector = this.map.bspPoint(thing.x, thing.y);
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

			const textures = this.textures;
			const _sprite = this.wad.sprite(thing.meta.sprite);
			const sprite = [];

			if(_sprite && _sprite[0])
			{
				for(const f in _sprite)
				for(const a in _sprite[f])
				{
					if(f > 0) break;

					const frame = _sprite[f][a];

					if(!frame) continue;

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
				}

				const picture = (_sprite[0][0] || _sprite[0][1]).picture;
				const texture = (sprite[0][0] || sprite[0][1]);

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

				if(!thingGeometries.has(thing.meta.sprite))
				{
					thingGeometries.set(thing.meta.sprite, new THREE.PlaneGeometry(picture.width, picture.height, 1));
				}
				const geometry = thingGeometries.get(thing.meta.sprite);

				const plane = new THREE.Mesh(geometry, material);
				const pos   = flipVertex(this.map, thing);

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
		Array(this.map.glSubsectorCount).fill().forEach((_,k) => {
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

		const texture = await loadTexture(this.wad, 'SKY1', lightLevel);

		texture.magFilter = THREE.NearestFilter;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		this.scene.background = texture;

		await Promise.all([...loadRooms, ...loadWalls, ...loadThings]);

		console.log(this.transparentPlanes, this.planes, this.map.thingCount, thingMaterials);

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
			room.changeLightLevel(fullbright ? -1 : null);
		}
	}
}