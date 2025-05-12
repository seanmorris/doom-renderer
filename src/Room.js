import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { byteToLightOffset, flipVertex, isTextureName, loadTexture, textureLoader, missing, playSample } from './helpers';

export class Room extends EventTarget
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

		this.lowRes = false;

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

		this.setDetail(this.lowRes);
	}

	setDetail(lowRes)
	{
		this.lowRes = lowRes;

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
			const room  = this.level.rooms.get(sector.index);

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

		const rSector = this.level.map.sector(right.sector);
		const lSector = left && this.level.map.sector(left.sector);
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

		const from = flipVertex(this.level.map, this.level.map.vertex(linedef.from));
		const to   = flipVertex(this.level.map, this.level.map.vertex(linedef.to));

		const length =  Math.hypot(to.y - from.y, to.x - from.x);
		const angle  = -Math.atan2(to.y - from.y, to.x - from.x);

		const xCenter = (from.x + to.x) / 2;
		const yCenter = (from.y + to.y) / 2;

		const middleHeight = minCeiling - maxFloor;
		const lowerHeight  = maxFloor   - minFloor;
		const upperHeight  = maxCeiling - minCeiling;

		const wall = {middle: null, lower: null, upper: null};

		this.walls.set(linedef.index, wall);

		const textures = this.level.textures;

		if(isTextureName(sidedef.middle))
		{
			if(!textures.has(sidedef.middle))
			{
				textures.set(sidedef.middle, new Map);
			}

			if(!textures.get(sidedef.middle).has(this.lightLevel))
			{
				const texture = await loadTexture(this.level.wad, sidedef.middle, light);

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
			!isLeftWall
				? this.innerPlanes.add(plane)
				: (oRoom && oRoom.innerPlanes.add(plane));
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
				const texture = await loadTexture(this.level.wad, sidedef.lower, light);

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
			!isLeftWall
				? this.innerPlanes.add(plane)
				: (oRoom && oRoom.innerPlanes.add(plane));
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
				const texture = await loadTexture(this.level.wad, sidedef.upper, light);

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
			!isLeftWall
				? this.innerPlanes.add(plane)
				: (oRoom && oRoom.innerPlanes.add(plane));
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
		const wadTexture = this.level.wad.texture(textureName);
		const textures = this.level.textures;

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

		const textures = this.level.textures;
		const frameNames = this.level.wad.textureAnimation(animation);
		const frames = [];

		if(frameNames)
		for(const frameName of frameNames)
		{
			const wadTexture = this.level.wad.texture(frameName);

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
			const vertexes = original.map(v => flipVertex(this.level.map, v));
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

		const floorFlat   = this.level.wad.flat(sector.floorFlat)   || this.level.wad.texture(sector.floorFlat);
		const ceilingFlat = this.level.wad.flat(sector.ceilingFlat) || this.level.wad.texture(sector.ceilingFlat);

		const textures = this.level.textures;

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

			const frameNames = this.level.wad.flatAnimation(floorFlat.animation);
			const frames = [];

			if(frameNames)
			for(const frameName of frameNames)
			{
				const flat = this.level.wad.flat(frameName);
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

			const frameNames = this.level.wad.flatAnimation(ceilingFlat.animation);
			const frames = [];

			if(frameNames)
			for(const frameName of frameNames)
			{
				const flat = this.level.wad.flat(frameName);
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
		let yfOffset = this.level.map.bounds.yPosition % 64;
		let ycOffset = this.level.map.bounds.yPosition % 64;

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

			const from = this.level.map.vertex(linedef.from);
			const to   = this.level.map.vertex(linedef.to);

			const xCenter = (from.x + to.x) * 0.5;
			const yCenter = (from.y + to.y) * 0.5;

			playSample(this.level.wad.sample('DSSWTCHN'), xCenter, yCenter).then(async () => {
				await new Promise(a => setTimeout(a, 1500));

				this.changeWallTexture(
					wall.middle,
					off + wall.middle.userData.textureName.substr(3),
					byteToLightOffset(this.lightLevel),
				);

				playSample(this.level.wad.sample('DSSWTCHX'), xCenter, yCenter);
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

			playSample(this.level.wad.sample('DSSWTCHN')).then(async () => {
				await new Promise(a => setTimeout(a, 1500));
				this.changeWallTexture(
					wall.lower,
					off + wall.lower.userData.textureName.substr(3),
					byteToLightOffset(this.lightLevel),
				);
				playSample(this.level.wad.sample('DSSWTCHX'));
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

			playSample(this.level.wad.sample('DSSWTCHN')).then(async () => {
				await new Promise(a => setTimeout(a, 1500));

				this.changeWallTexture(
					wall.upper,
					off + wall.upper.userData.textureName.substr(3),
					byteToLightOffset(this.lightLevel),
				);

				playSample(this.level.wad.sample('DSSWTCHX'));
				this.switchesFlipped.delete(linedef.index);
			});
		}
	}
}