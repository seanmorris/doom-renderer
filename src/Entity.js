import * as THREE from 'three';
import { byteToLightOffset, flipVertex, nearestPointOnLine, textureLoader, ldAction, rayLinedefs, rayEntities, playSample } from './helpers';
import { Line } from './Line';
import { Particle } from './Particle';

import { Sndinfo } from './Decorate';
import SNDINFO from './mobs/sndinfo.txt';
import { GoodGuys, BadGuys } from './Team';
import { actions as weapActions } from './hud/Weapon';

import { Decorate } from './Decorate';

import d1 from './mobs/doom1-enemies.dec';
import d2 from './mobs/doom2-enemies.dec';
import objects from './mobs/objects.dec';
import decor from './mobs/decor.dec';
import weaps from './mobs/weaps.dec';
import { overlay } from 'three/tsl';

const decorate = new Decorate;

decorate.parse(objects);
decorate.parse(d1);
decorate.parse(d2);
decorate.parse(decor);
decorate.parse(weaps);

const sndinfo = new Sndinfo;
sndinfo.parse(SNDINFO);
console.log(sndinfo);

console.log(weapActions);

const textures = new Map;
const decoding = new Map;
const decoded = new Map;

const pos = {x: 0, y: 0};

const actions = {
	A_Look: entity => {

		if(entity.target && performance.now() - entity.lastAlertTime < 3000)
		{
			return;
		}

		const nearby = entity.level.quadTree.select(
			entity.position.x - 2560,
			entity.position.y - 2560,
			entity.position.x + 2560,
			entity.position.y + 2560,
		);

		const targetHeight = entity.room.ceilingHeight + -entity.height + -32;

		if(entity.flags.NOGRAVITY && Math.abs(targetHeight + -entity.position.z) > 16)
		{
			entity.velocity.z = Math.sign(targetHeight + -entity.position.z);
		}
		else
		{
			entity.velocity.z = 0;
		}

		for(const other of nearby)
		{
			if(entity.team.enemies.has(other.team))
			{
				const dist  = Math.hypot(other.position.y - entity.position.y, other.position.x - entity.position.x);
				const angle = Math.atan2(other.position.y - entity.position.y, other.position.x - entity.position.x);

				entity.pitch = Math.atan2(other.position.z - entity.position.z, dist);
				const sight = entity.hitScan(dist, angle);
				if(sight.wall) continue;

				entity.alert(other.position.x, other.position.y);
				entity.changeState('See');

				entity.target = other;
				return;
			}
		}

		if(performance.now() - entity.lastAlertTime > 5000)
		{
			entity.changeState('Spawn');
		}
	},
	A_FaceTarget: entity => {
		if(entity.hp && (!entity.target || entity.target.hp < 0))
		{
			entity.changeState('Spawn');
			return;
		}

		// entity.velocity.x = 0;
		// entity.velocity.y = 0;
		// entity.velocity.z = 0;

		const other = entity.target;
		const dist  = Math.hypot(other.position.y - entity.position.y, other.position.x - entity.position.x);
		const angle = Math.atan2(other.position.y - entity.position.y, other.position.x - entity.position.x);

		entity.pitch = Math.atan2(other.position.z - entity.position.z, dist);

		const sight = entity.hitScan(dist, angle);

		if(sight.wall && entity.hp > 0)
		{
			entity.changeState('Spawn');
			return;
		}

		entity.alert(other.position.x, other.position.y);
		entity.pitch = Math.atan2(other.position.z - entity.position.z, dist);
	},
	A_Pain: entity => {
		const logical = entity.properties.PAINSOUND;
		const resolved = sndinfo.resolve(logical);
		if(resolved)
		{
			playSample(
				entity.level.wad.sample(resolved.sample),
				entity.position.x,
				entity.position.y,
				{gain: 0.5, noAlert: true},
			);
		}
	},
	A_Scream: entity => {
		const logical = entity.properties.DEATHSOUND;
		const resolved = sndinfo.resolve(logical);
		if(resolved)
		{
			playSample(
				entity.level.wad.sample(resolved.sample),
				entity.position.x,
				entity.position.y,
				{gain: 0.5, noAlert: true},
			);
		}
	},
	A_XScream: entity => {
		const logical = 'misc/gibbed';
		const resolved = sndinfo.resolve(logical);
		if(resolved)
		{
			playSample(
				entity.level.wad.sample(resolved.sample),
				entity.position.x,
				entity.position.y,
				{gain: 0.5, noAlert: true},
			);
		}
	},
	A_Respawn: entity => {
		if(!entity.start)
		{
			console.warn('Entity has no start pos');
			return;
		}

		entity.position.x = entity.start.x;
		entity.position.y = entity.start.y;

		entity.hp = entity.properties.HEALTH ?? entity.hp;

		entity.changeState('Spawn');
	},
	A_Chase: entity => {
		if(entity.hp && (!entity.target || entity.target.hp < 0))
		{
			entity.changeState('Spawn');
			return;
		}

		const other = entity.target;
		const dist = Math.hypot(other.position.y - entity.position.y, other.position.x - entity.position.x);
		const angle = Math.atan2(other.position.y - entity.position.y, other.position.x - entity.position.x);

		// const sight = entity.hitScan(dist, angle);
		// if(sight.wall) return;

		if(entity.flags.NOGRAVITY && Math.abs(other.position.z + -entity.position.z + 32) > 32)
		{
			entity.velocity.z = Math.sign(other.position.z + -entity.position.z + 32);
		}

		entity.angle = angle;

		if(dist > 128 && Math.random() > 0.25)
		{
			if(Math.hypot(entity.velocity.x, entity.velocity.y) < 4)
			{
				entity.applyImpulse(-entity.angle, 5);
			}

			entity.alert(other.position.x, other.position.y);
		}
		else if(dist > 32 && Math.random() > 0.5)
		{
			if(Math.hypot(entity.velocity.x, entity.velocity.y) < 4)
			{
				entity.applyImpulse(-entity.angle, 3);
			}

			entity.alert(other.position.x, other.position.y);
		}
		else if(entity.states['Missile'])
		{
			entity.changeState('Missile');
		}
		else if(entity.states['Melee'])
		{
			entity.changeState('Melee');
		}
	},

	A_PosAttack: entity => {
		entity.runAction('A_PISTOL_FIRE');
	},
	A_SPosAttackUseAtkSound: entity => {
		entity.runAction('A_SHOTGUN_FIRE');
	},
	A_TroopAttack: async entity => {
		const rocketDec = decorate.resolve('DOOMIMPBALL');

		const rocket = await entity.level.spawnEntity(
			entity.position.x + entity.velocity.x,
			entity.position.y + entity.velocity.y,
			(entity.angle / Math.PI) * 180, rocketDec
		);

		rocket.owner = entity;

		rocket.position.z = entity.position.z + 32;

		rocket.velocity.x = 13 * Math.cos(entity.angle);
		rocket.velocity.y = 13 * -Math.sin(entity.angle);
		rocket.velocity.z = 13 *Math.tan(entity.pitch);
	},
	A_SargAttack: async entity => {
		const hit = entity.shoot(64);
		for(const [other, intersection] of hit.entities)
		{
			other.damage(entity, intersection, 4);
		}
	},
	A_BruisAttack: async entity => {
		const rocketDec = decorate.resolve('BARONBALL');

		const rocket = await entity.level.spawnEntity(
			entity.position.x + entity.velocity.x,
			entity.position.y + entity.velocity.y,
			(entity.angle / Math.PI) * 180, rocketDec
		);

		rocket.owner = entity;

		rocket.position.z = entity.position.z + 24;

		rocket.velocity.x = 13 * Math.cos(entity.angle);
		rocket.velocity.y = 13 * -Math.sin(entity.angle);
		rocket.velocity.z = 13 * Math.tan(entity.pitch);
	},
	A_HeadAttack: async entity => {
		const rocketDec = decorate.resolve('CACODEMONBALL');

		const rocket = await entity.level.spawnEntity(
			entity.position.x + entity.velocity.x,
			entity.position.y + entity.velocity.y,
			(entity.angle / Math.PI) * 180, rocketDec
		);

		rocket.owner = entity;

		rocket.position.z = entity.position.z + 24;

		rocket.velocity.x = 13 * Math.cos(entity.angle);
		rocket.velocity.y = 13 * -Math.sin(entity.angle);
		rocket.velocity.z = 13 * Math.tan(entity.pitch);
	},
	A_SkullAttack: async entity => {
		if(!entity.target && entity.hp > 0)
		{
			entity.changeState('Spawn');
			return;
		}

		const other = entity.target;
		const dist = Math.hypot(other.position.y - entity.position.y, other.position.x - entity.position.x);
		entity.pitch = Math.atan2((other.position.z + 32) - entity.position.z, dist);

		entity.velocity.x = 13 * Math.cos(entity.angle);
		entity.velocity.y = 13 * -Math.sin(entity.angle);
		entity.velocity.z = 13 * Math.tan(entity.pitch);
	},
	A_CyberAttack: async entity => {
		const rocketDec = decorate.resolve('ROCKET');

		const rocket = await entity.level.spawnEntity(
			entity.position.x + entity.velocity.x,
			entity.position.y + entity.velocity.y,
			(entity.angle / Math.PI) * 180, rocketDec
		);

		rocket.owner = entity;

		rocket.position.z = entity.position.z + 24;

		rocket.velocity.x = 13 * Math.cos(entity.angle);
		rocket.velocity.y = 13 * -Math.sin(entity.angle);
		rocket.velocity.z = 13 * Math.tan(entity.pitch);
	},

	A_SetFloorClip: entity => {
		entity.flying = true;
	},
	A_UnSetFloorClip: entity => {
		entity.flying = false;
	},

	A_SpidRefire: entity => {
		entity.changeState('See');
	},

	A_NoBlocking: entity => {
		entity.blocking = false;
	},

	A_Explode: entity => {

		entity.velocity.x = 0;
		entity.velocity.y = 0;
		entity.velocity.z = 0;

		const nearby = entity.level.quadTree.select(
			entity.position.x - 120,
			entity.position.y - 120,
			entity.position.x + 120,
			entity.position.y + 120,
		);

		for(const thing of nearby)
		{
			if(!thing.flags.SHOOTABLE || thing.flags.MISSILE || thing.hp <= 0) continue;

			const dist = Math.hypot(entity.position.y - thing.position.y, thing.position.x - entity.position.x);
			const angle = Math.atan2(entity.position.y - thing.position.y, thing.position.x - entity.position.x);

			if(dist < 80)
			{
				thing.damage(thing, null, 50 * (120 / dist));
				thing.applyImpulse(angle, 4);
			}

		}
	},

	...weapActions, // temporary
};
const logged = {};

export class Entity
{
	constructor(x, y, angle, decDef, level, sector = null)
	{
		this.sector   = level.map.bspPoint(x, y);
		this.room     = sector || level.rooms.get(this.sector.index);
		this.decDef   = decDef;
		this.edNum    = decDef.edNum ?? -1;

		this.radius   = decDef.properties.RADIUS ?? 16;
		this.height   = decDef.properties.HEIGHT ?? 1;
		this.gravity  = decDef.properties.GRAVITY ?? 0.25;

		this.blocking = decDef.flags.SOLID ?? false;

		this.angle    = (angle * Math.PI) / 180;
		this.pitch    = 0;
		this.start    = {x, y, z: 0, angle};

		this.level    = level;

		this.plane    = null;
		this.sprite   = [];
		this._sprite  = [];

		this.position = {x: x, y: y, z: 0};
		this.rotation = {x: 0, y: 0, z: 0};
		this.velocity = {x: 0, y: 0, z: 0};

		this.properties = {};
		this.states     = {};
		this.flags      = {};

		this.picture = null;
		this.noClip  = false;
		this.teleporting = false;
		this.grounded    = true;
		this.hidden = false;
		this.flying = false;

		this.age = 0;

		this.lastAlertPos  = [0, 0];
		this.lastAlertTime = 0;
		this.lastAlertDot  = 0;

		this.buttons = {};
		this.keys = {};

		this.isFiring = false;

		this.material = new THREE.MeshBasicMaterial({transparent: true});
		this.geometry = new THREE.PlaneGeometry(1, 1, 1);

		this.frozen = false;
		this.frames = [];
		this.frameDelay = 48;
		this.frameTimer = this.frameDelay;
		this.currentFrame = 0;
		this.currentState = null;

		this.ignore = false;
		this.hp = Infinity;

		this.owner = null;

		this.bounces = 0;
		this.target = null;
		this.disposed = false;
	}

	dispose()
	{
		this.disposed = true;
		this.material.dispose();
	}

	alert(x, y)
	{
		this.lastAlertPos = [x, y];

		const mag = Math.hypot(y - this.position.y, x - this.position.x);
		if(mag === 0) return;
		const vec = [y - this.position.y, x - this.position.x]; // y, x
		const dot = ((vec[0]/mag) * Math.cos(-this.angle) + (vec[1]/mag) * Math.sin(-this.angle));

		this.lastAlertTime = performance.now();
		this.lastAlertDot = dot;
	}

	applyImpulse(dir, mag)
	{
		const xSpeedChange = Math.cos(dir) * mag;
		const ySpeedChange = Math.sin(dir) * mag;

		this.velocity.x += xSpeedChange;
		this.velocity.y += ySpeedChange;

		console.assert(!isNaN(this.velocity.x), 'Velicity is NaN');
		console.assert(!isNaN(this.velocity.y), 'Velicity is NaN');
	}

	applyFriction(drag)
	{
		if(!this.flags.MISSILE && this.currentState !== 'Missile' || this.grounded)
		{
			this.velocity.x *= drag;
			this.velocity.y *= drag;
		}
	}

	shoot(distance, options = {})
	{
		options.height = options.height ?? 48;

		const result = this.hitScan(distance, this.angle, options);

		if(result.wall)
		{
			const puff = new Particle(['PUFFA0', 'PUFFB0', 'PUFFC0', 'PUFFD0', 'PUFFC0', 'PUFFD0'], this.level, {
				x: result.end.x,
				y: result.end.y,
				z: result.end.z,
				gravity: result.ceiling ? 0.25 : -0.125,
				maxAge:0x40 * 6,
				delay: 0x40,
				scale: 2 + 2 * Math.random(),
			});

			this.level.scene.add(puff.sprite);
			this.level.particles.add(puff);

			if(!result.floor && !result.ceiling)
			{
				puff.velocity.x = 0.2 * result.wall.normal[1];
				puff.velocity.y = 0.2 * result.wall.normal[0];
			}
		}

		return result;
	}

	hitScan(distance, angle, options = {})
	{
		const end = {
			x: this.position.x + Math.cos(angle) * distance,
			y: this.position.y + Math.sin(angle) * distance,
		};

		const result = { end, linedef: null, distance, floor: null, ceiling: null };
		const offset = options.offset ?? 0;

		const linedefs = rayLinedefs(
			this,
			this.position.x,
			this.position.y,
			angle + offset,
			distance,
		);

		const zStart = this.position.z + (options.height ?? this.height);

		for(const [linedef, intersection] of linedefs)
		{
			const line = Line.get(this.level, linedef);

			const atDist = intersection.d * distance;
			const atHigh = atDist * Math.tan(this.pitch) + zStart;

			const front = line.front(this.position.x, this.position.y);
			const fRoom = front.frontRoom(this.position.x, this.position.y);
			const bRoom = front.backRoom(this.position.x, this.position.y);

			let canPass = true;

			if(!fRoom)
			{
				canPass = false;
			}
			else if(fRoom.floorHeight > atHigh)
			{
				const ratio = (zStart - fRoom.floorHeight) / (zStart - atHigh);

				intersection.x = this.position.x + Math.cos(angle + offset) * distance * intersection.d * ratio;
				intersection.y = this.position.y + Math.sin(angle + offset) * distance * intersection.d * ratio;
				intersection.z = fRoom.floorHeight;
				intersection.d *= ratio;

				result.floor = fRoom;

				canPass = false; // Floor
			}
			else if(fRoom.ceilingHeight < atHigh)
			{
				const ratio = (fRoom.ceilingHeight - zStart) / (atHigh - zStart);

				intersection.x = this.position.x + Math.cos(angle + offset) * distance * intersection.d * ratio;
				intersection.y = this.position.y + Math.sin(angle + offset) * distance * intersection.d * ratio;
				intersection.z = fRoom.ceilingHeight;
				intersection.d *= ratio;

				result.ceiling = fRoom;

				canPass = false; // Ceiling
			}
			else if(!bRoom)
			{
				intersection.z = atHigh;
				canPass = false; // Middle Wall
			}
			else if(bRoom.floorHeight > atHigh)
			{
				intersection.z = atHigh;
				canPass = false; // Lower Wall
			}
			else if(bRoom.ceilingHeight < atHigh)
			{
				intersection.z = atHigh;
				canPass = false; // Upper Wall
			}

			if(!canPass)
			{
				result.distance = atDist;
				result.wall = line;
				result.end = intersection;
				break;
			}
		}

		const entities = rayEntities(
			this,
			this.position.x,
			this.position.y,
			angle + offset,
			result.distance,
		);

		for(const [entity, intersection] of entities)
		{
			const atDist = intersection.d * result.distance;
			intersection.z = atDist * Math.tan(this.pitch) + zStart;

			if(intersection.z > entity.position.z + entity.height || intersection.z < entity.position.z)
			{
				entities.delete(entity);
			}
		}

		result.entities = entities;

		return result;
	}

	damage(other, intersection, amount = 1, type = null)
	{
		if(other.owner && other.owner.edNum === this.edNum)
		{
			return;
		}

		if(!this.flags.SHOOTABLE || this.hp <= 0)
		{
			return;
		}

		const target = other.owner || other;

		if(target !== this && target.edNum !== this.edNum)
		{
			this.target = target;
		}

		if(this.flying && !this.flags.DONTFALL && this.position.z - this.room.floorHeight > 16)
		{
			this.velocity.z += -0.01 * amount;
		}

		this.hp -= amount;

		if(this.hp <= 0)
		{
			if(this.states.XDeath && this.hp <= -this.properties.HEALTH)
			{
				this.changeState('XDeath');
			}
			else if(this.states.Death)
			{
				this.changeState('Death');
			}

			if(!this.flags.DONTFALL)
			{
				this.flying = false;
			}

			this.hp = Math.max(this.hp, -10);
		}
		else if(this.states.Pain)
		{
			this.changeState('Pain');
		}

		if(!intersection)
		{
			return;
		}

		if(this.edNum === 2035)
		{
			const vec = [this.position.y - other.position.y, this.position.x - other.position.x];
			const mag = Math.hypot(...vec);

			vec[0] /= -mag;
			vec[1] /= mag;

			const mass = this.properties.MASS ?? 100;

			this.applyImpulse(Math.atan2(...vec), 2 * (100 / mass));

			const puff = new Particle(['PUFFA0', 'PUFFB0', 'PUFFC0', 'PUFFD0'], this.level, {
				x: intersection.x,
				y: intersection.y,
				z: intersection.z,
				gravity: -0.25,
				maxAge:0x40 * 4 - 0.1,
				delay: 0x40,
				scale: 2 + Math.random(),
			});

			this.level.scene.add(puff.sprite);
			this.level.particles.add(puff);

			puff.velocity.x = 0.5 + Math.random() * Math.sign(other.position.x - this.position.x);
			puff.velocity.y = 0.5 + Math.random() * Math.sign(other.position.y - this.position.y);
		}
		else
		{
			this.alert(other.position.x, other.position.y);

			const blood = new Particle(['BLUDA0', 'BLUDB0', 'BLUDC0'], this.level, {
				x: intersection.x,
				y: intersection.y,
				z: intersection.z,
				scale: 2 + 2 * Math.random(),
				maxAge:1250,
				delay: 64,
			});

			this.level.scene.add(blood.sprite);
			this.level.particles.add(blood);

			blood.velocity.x = -2 + 4 * Math.random();
			blood.velocity.y = -2 + 4 * Math.random();
			blood.velocity.z =  1 + 2 * Math.random();
		}
	}

	pressButton(buttons)
	{
		if(buttons & 0b001) this.buttons[0] = true;
		if(buttons & 0b010) this.buttons[1] = true;
		if(buttons & 0b100) this.buttons[1] = true;
	}

	releaseButton(buttons)
	{
		if(!(buttons & 0b001)) this.buttons[0] = false;
		if(!(buttons & 0b010)) this.buttons[1] = false;
		if(!(buttons & 0b100)) this.buttons[1] = false;
	}

	pressKey(code)
	{
		this.keys[code] = true;
	}

	releaseKey(code)
	{
		this.keys[code] = false;
	}

	simulate(delta, camera)
	{
		if(this.flags.DONTFALL && this.grounded)
		{
			this.position.z += 8;
			this.flying = true;
		}

		if(!this.noClip && this.position.z > this.room.ceilingHeight - this.height)
		{
			this.position.z = this.room.ceilingHeight - this.height;
		}

		if(this.target && (this.target.hp <= 0 || this.target.disposed))
		{
			this.target = null;
		}

		if(this.flags.MISSILE)
		{
			let exploded = false;

			if(this.bounces >= 5)
			{
				exploded = true;
			}

			const nearby = this.level.quadTree.select(
				this.position.x - 160,
				this.position.y - 160,
				this.position.x + 160,
				this.position.y + 160,
			);

			for(const thing of nearby)
			{
				const minDist = this.radius + thing.radius;

				if(!thing.flags.SHOOTABLE || thing.flags.MISSILE || thing.hp <= 0) continue;
				const distance = Math.hypot(this.position.y - thing.position.y, this.position.x - thing.position.x);
				if(distance > minDist || this === thing || thing === this.owner) continue;

				if(this.properties.DAMAGE && this.currentState !== 'Death')
				{
					const mass = thing.properties.MASS ?? 100;

					thing.damage(this, null, this.properties.DAMAGE);

					thing.applyImpulse(
						Math.atan2(this.velocity.y, this.velocity.x), 5 * (100 / mass)
					);

					exploded = true;
				}
			}

			if(this.position.z <= this.room.floorHeight && this.hp > 0)
			{
				if(this.properties.BOUNCETYPE)
				{
					this.angle += Math.PI / 4;

					this.position.z = this.room.floorHeight + 8;
					this.velocity.z *= -0.8;
					this.bounces++;
				}
				else
				{
					exploded = true;
				}
			}

			if(exploded && this.currentState !== 'Death' && this.hp > 0)
			{
				this.velocity.x = 0;
				this.velocity.y = 0;
				this.velocity.z = 0;

				this.flying = true;
				this.changeState('Death');
				this.hp = 0;

				const logical = this.properties.DEATHSOUND;
				const resolved = sndinfo.resolve(logical);

				if(resolved)
				{
					playSample(
						this.level.wad.sample(resolved.sample),
						this.position.x,
						this.position.y,
						{gain: 0.5, noAlert: true},
					);
				}
			}

			if(this.currentState === 'Death')
			{
				if(this.frozen)
				{
					this.level.removeEntity(this);
					return;
				}
			}
		}

		if(this.flags.DONTFALL)
		{
			const nearby = this.level.quadTree.select(
				this.position.x - 16,
				this.position.y - 16,
				this.position.x + 16,
				this.position.y + 16,
			);

			for(const thing of nearby)
			{
				const minDist = this.radius + thing.radius;

				if(!thing.flags.SHOOTABLE || thing.flags.MISSILE || thing.hp <= 0) continue;
				const distance = Math.hypot(this.position.y - thing.position.y, this.position.x - thing.position.x);
				if(distance > minDist || this === thing || thing === this.owner) continue;

				if(this.properties.DAMAGE && this.currentState !== 'Death')
				{
					thing.damage(this, null, this.properties.DAMAGE);
					thing.applyImpulse(
						Math.atan2(this.velocity.y, this.velocity.x), 5
					);
				}
			}

			if(this.currentState === 'Death')
			{
				if(this.frozen)
				{
					this.level.removeEntity(this);
					return;
				}
			}
		}

		let update = false;

		const ticFrac = (delta/1000) * 35;

		if(!this.frozen && this.frameTimer <= 0 && this.frames.length)
		{
			const frame = this.frames[this.currentFrame];

			console.assert(frame, 'Invalid frame id for state ' + this.currentState);

			if(!this.frozen)
			{
				update = true;
				this.currentFrame++;

				if(this.currentFrame >= this.frames.length)
				{
					this.currentFrame = 0;
					this.frameTimer = this.frames[this.currentFrame].duration || 0;
				}
			}

			if(frame.action)
			{
				this.runAction(frame.action);
			}

			if(frame.instruction === 'Loop')
			{
				this.frameTimer = this.frames[this.currentFrame].duration || 0;
				this.currentFrame = 0;
			}
			else if(frame.instruction === 'Wait')
			{
				this.currentFrame = 0;
				this.frameTimer = this.frames[this.currentFrame].duration || 0;
			}
			else if(frame.instruction === 'Goto')
			{
				const [name, offset] = frame.args[0].split('+');

				this.changeState(name);
				if(offset)
				{
					this.currentFrame += Number(offset);
				}
			}
			else if(frame.instruction === 'Stop')
			{
				this.currentFrame--;
				this.frozen = true;
			}

			if(frame.duration)
			{
				if(frame.duration > -1)
				{
					this.frameTimer = frame.duration;
				}
				else
				{
					this.frozen = true;
				}
			}
		}

		this.frameTimer -= ticFrac;

		if(this.buttons[0])
		{
			this.isFiring = true;
		}
		else
		{
			this.isFiring = false;
		}

		const bounds = this.level.map.bounds;

		if(this.position.x < bounds.xMin || this.position.x > bounds.xMax)
		{
			return;
		}

		if(this.position.y < bounds.yMin || this.position.y > bounds.yMax)
		{
			return;
		}

		const lines = this.level.map.linedefsNearPoint(this.position.x, this.position.y);
		const speedMag  = Math.hypot(this.velocity.y, this.velocity.x);

		const speedNVec = [-this.velocity.y / speedMag, this.velocity.x / speedMag];
		const speedDir  = Math.atan2(...speedNVec);

		const speedCNVec = speedMag ? [this.velocity.y / speedMag, this.velocity.x / speedMag] : [0, 0];
		const speedCDir  = Math.atan2(...speedCNVec);

		const solidLines   = new Set;

		const radius = this.radius;

		if(speedMag)
		{
			const rVec = [-this.velocity.y, this.velocity.x];
			const rMag = Math.hypot(...rVec);
			const rThe = Math.atan2(...rVec);

			rVec[0] /= rMag;
			rVec[1] /= rMag;

			const entities = this.level.quadTree.select(
				this.position.x - 320,
				this.position.y - 320,
				this.position.x + 320,
				this.position.y + 320,
			)

			if(this.blocking && speedMag)
			for(const entity of entities)
			{
				if(entity === this || !entity.blocking) continue;

				const minRad = this.radius + entity.radius;

				const xNext = this.position.x + this.velocity.x;
				const xDiff = xNext - entity.position.x;
				const xDist = Math.abs(xDiff);
				const yDist = Math.abs(this.position.y - entity.position.y);

				const xVelOrig = this.velocity.x;
				const yVelOrig = this.velocity.y;

				if(xDist < minRad && yDist < minRad)
				{
					const xOverlap = minRad - xDist;
					this.velocity.x += xOverlap * -Math.sign(this.velocity.x);
				}

				const yNext = this.position.y - this.velocity.y;
				const yDiffNew = yNext - entity.position.y;
				const yDistNew = Math.abs(yDiffNew);

				const xNextNew = this.position.x + this.velocity.x;
				const xDiffNew = xNextNew - entity.position.x;
				const xDistNew = Math.abs(xDiffNew);

				if(Math.abs(yDiffNew) < minRad && xDistNew < minRad)
				{
					const yOverlap = minRad - yDistNew;
					this.velocity.y += yOverlap * -Math.sign(this.velocity.y);
				}

				console.assert(Math.abs(this.velocity.x) <= Math.abs(xVelOrig), `New xVelocity must be less than or equal to original: ${xVelOrig} -> ${this.velocity.x}.`);
				console.assert(Math.abs(this.velocity.y) <= Math.abs(yVelOrig), `New yVelocity must be less than or equal to original: ${yVelOrig} -> ${this.velocity.y}.`);
			}
		}

		for(const l of lines)
		{
			const linedef = this.level.map.linedef(l);
			const line  = Line.get(this.level, linedef);
			const front = line.front(this.position.x, this.position.y);

			const from = this.level.map.vertex(linedef.from);
			const to   = this.level.map.vertex(linedef.to);

			const preNearest = nearestPointOnLine(
				this.position.x, this.position.y,
				from.x, from.y,
				to.x, to.y,
				true,
			);

			const nearest = nearestPointOnLine(
				this.position.x + this.velocity.x, this.position.y + -this.velocity.y,
				from.x, from.y,
				to.x, to.y,
				false,
			);

			const lineMag   = Math.hypot(to.y - from.y, to.x - from.x);
			const linePos   = [(to.y + from.y) / 2, (to.x + from.x) / 2]; // [y, x]

			const lineVec   = [(to.y - from.y) / lineMag, (to.x - from.x) / lineMag]; // [y, x]
			const lineNVec  = [-lineVec[1], lineVec[0]]; // [y, x]
			const lineNDot  = lineNVec[0] * (speedMag ? -this.velocity.y/speedMag : 0) + lineNVec[1] * (speedMag ? this.velocity.x/speedMag : 0);

			const lineTVec  = [(this.position.y + -preNearest.y) / preNearest.d, (this.position.x + -preNearest.x) / preNearest.d]; // [y, x]
			const lineTDot  = lineTVec[0] * (speedMag ? -this.velocity.y/speedMag : 0) + lineTVec[1] * (speedMag ? this.velocity.x/speedMag : 0);

			const rightSide = this.level.map.sidedef(linedef.right);
			const leftSide  = linedef.left > -1 && this.level.map.sidedef(linedef.left);

			const rSector   = this.level.map.sector(rightSide.sector);
			const lSector   = leftSide.sector > -1 && this.level.map.sector(leftSide.sector);

			const rRoom     = this.level.rooms.get(rSector.index);
			const lRoom     = lSector && this.level.rooms.get(lSector.index);
			const room      = lineNDot <= 0 ? rRoom : lRoom;
			const oRoom     = lineNDot > 0 ? rRoom : lRoom;

			let passable = oRoom && (!(linedef.flags & 0b1) || this.flags.MISSILE);

			// const maxClimb = this.flags.ISMONSTER ? 320 : 32;
			const maxClimb = 32;

			if(passable && (
				(oRoom.floorHeight - this.position.z >= maxClimb)
				|| (oRoom.ceilingHeight - this.position.z < this.height)
				|| Math.abs(oRoom.ceilingHeight - oRoom.floorHeight) < this.height
				|| Math.abs(oRoom.ceilingHeight - room.floorHeight) < this.height
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

				if(this.flags.DONTFALL && this.hp > 0)
				{
					this.changeState('Spawn');

					this.velocity.x = 0;
					this.velocity.y = 0;
					this.velocity.z = 0;
				}
			}

			if(speedMag && this.hp > 0)
			{
				if(linedef.actionMeta && linedef.actionMeta.modifier.indexOf('S') > -1)
				{
					if(lineNDot < 0)
					{
						room && room.flipSwitch(linedef);
						ldAction(this, linedef, room, oRoom, lineNDot, camera);
					}
				}

				if(passable && linedef.actionMeta && linedef.actionMeta.modifier.indexOf('W') > -1)
				{
					ldAction(this, linedef, room, oRoom, lineNDot, camera);
				}

				if(linedef.actionMeta && linedef.actionMeta.modifier.indexOf('G') > -1)
				{
					ldAction(this, linedef, room, oRoom, lineNDot, camera);
				}
			}
		}

		const sorted = [...solidLines.values()].sort((i,j) => Math.sign( i.preNearest.d - j.preNearest.d ));

		const sector = this.level.map.bspPoint(this.position.x, this.position.y);
		const room = this.level.rooms.get(sector.index);

		this.sector = sector;
		this.room = room;

		room.addThing(this);
		this.level.quadTree.move(this);

		if(!this.noClip)
		{
			this.applyFriction(0.90625 ** ticFrac);

			if(!this.flying)
			{
				if(this.position.z > room.floorHeight)
				{
					this.velocity.z -= this.gravity * ticFrac;
					this.grounded = false;
				}
				else if(!this.flags.NOGRAVITY || this.hp <= 0)
				{
					this.position.z = room.floorHeight;
					this.velocity.z = 0;
					this.grounded = true;
				}
			}
			else
			{
				if(this.position.z < room.floorHeight)
				{
					this.position.z = room.floorHeight;
				}

				this.grounded = false;
			}

			if((speedMag || this.velocity.z) && !this.teleporting)
			{
				if(this.flags.MISSILE && sorted.length)
				{
					const nearestLine = Line.get(this.level, sorted[0].linedef);

					if(this.properties.BOUNCETYPE && this.hp > 0)
					{
						const vec = [-this.velocity.y, this.velocity.x]; // [ y, x ]
						const mag = Math.hypot(...vec);

						if(mag)
						{
							vec[0] /= mag;
							vec[1] /= mag;

							const dot = vec[0] * nearestLine.normal[0] + vec[1] * nearestLine.normal[1];

							this.velocity.y = -mag * (vec[0] - 2 * dot * nearestLine.normal[0]);
							this.velocity.x = mag * (vec[1] - 2 * dot * nearestLine.normal[1]);

							console.assert(!isNaN(this.velocity.x), 'Velicity is NaN');
							console.assert(!isNaN(this.velocity.y), 'Velicity is NaN');
						}

						this.bounces++;
					}
					else if(this.currentState !== 'Death')
					{
						this.velocity.x = 0;
						this.velocity.y = 0;
						this.velocity.z = 0;

						this.changeState('Death');
						this.hp = 0;

						const logical = this.properties.DEATHSOUND;
						const resolved = sndinfo.resolve(logical);

						if(resolved)
						{
							playSample(
								this.level.wad.sample(resolved.sample),
								this.position.x,
								this.position.y,
								{gain: 0.5, noAlert: true},
							);
						}
					}
				}
				else if(sorted.length === 1)
				{
					const nearest = sorted[0].nearest;

					if(nearest.d < radius && nearest.t > 0 && nearest.t < 1)
					{
						const line = Line.get(this.level, sorted[0].linedef);
						const side = line.right.isFacing(this.position.y, this.position.x)
							? line.right
							: line.left;

						const nearestLineVec = [this.position.y - nearest.y, this.position.x - nearest.x];
						const nearestLineDir = Math.atan2(...nearestLineVec);

						const fVec = [this.position.y - sorted[0].from.y, this.position.x - sorted[0].from.x];
						const tVec = [this.position.y - sorted[0].to.y,   this.position.x - sorted[0].to.x];
						const fMag = Math.hypot(...fVec);
						const tMag = Math.hypot(...tVec);
						fVec[0] /= fMag;
						fVec[1] /= fMag;
						tVec[0] /= tMag;
						tVec[1] /= tMag;

						const fDot = speedNVec[0] * fVec[0] + speedNVec[1] * fVec[1];
						const endPoint = fDot < 0 ? sorted[0].from : sorted[0].to;
						const lineIds = this.level.map.linedefsNearPoint(endPoint.x, endPoint.y);

						const sides = [];

						for(const id of lineIds)
						{
							const linedef = this.level.map.linedef(id);

							if(linedef === sorted[0].linedef || (linedef.from !== endPoint.index && linedef.to !== endPoint.index))
							{
								continue;
							}

							const line = Line.get(this.level, linedef);

							sides.push(line.right, line.left);
						}

						const facing = sides
						.filter(s =>
							s.isFacing(this.position.y, this.position.x)
							&& side.isVisibleAroundCorner(this.position.x, this.position.y, s)
							&& !s.passable(this.position.x, this.position.y))
						.sort((s, t) => s.dotNormal(...side.normal) - t.dotNormal(...side.normal));

						if(facing[0])
						{
							const s = facing[0].dotNormal(...side.normal);
							const c = Math.sqrt(1 - s**2);
							const h = Math.sqrt((1 - c) / 2);

							const n = facing[0].nearest(this.position.x, this.position.y, true);

							if(s < 0 && h > 0 && n.d < radius / h)
							{
								this.velocity.x -= Math.cos(speedCDir) * Math.min(radius / h - nearest.d, speedMag);
								this.velocity.y -= Math.sin(speedCDir) * Math.min(radius / h - nearest.d, speedMag);

								console.assert(!isNaN(this.velocity.x), 'Velicity is NaN');
								console.assert(!isNaN(this.velocity.y), 'Velicity is NaN');
							}
							else
							{
								this.velocity.x += Math.cos(nearestLineDir) * Math.min(radius - nearest.d, speedMag);
								this.velocity.y -= Math.sin(nearestLineDir) * Math.min(radius - nearest.d, speedMag);

								console.assert(!isNaN(this.velocity.x), 'Velicity is NaN');
								console.assert(!isNaN(this.velocity.y), 'Velicity is NaN');
							}
						}
						else
						{
							this.velocity.x += Math.cos(nearestLineDir) * Math.min(radius - nearest.d, speedMag);
							this.velocity.y -= Math.sin(nearestLineDir) * Math.min(radius - nearest.d, speedMag);

							console.assert(!isNaN(this.velocity.x), 'Velicity is NaN');
							console.assert(!isNaN(this.velocity.y), 'Velicity is NaN');
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
							vertex = sorted[0].from;
						}
						else if(sorted[0].linedef.to === sorted[1].linedef.from || sorted[0].linedef.to === sorted[1].linedef.to)
						{
							vertex = sorted[0].to;
						}

						const nDotA = sorted[0].nDot;
						const nDotB = sorted[1].nDot;
						const normalA = [sorted[0].normal[0] * Math.sign(nDotA), sorted[0].normal[1] * Math.sign(nDotA)];
						const normalB = [sorted[1].normal[0] * Math.sign(nDotB), sorted[1].normal[1] * Math.sign(nDotB)];

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

							const concDot = -normalA[0] * vec[0] + normalA[1] * vec[1];
							const concave = 0 > concDot;

							if(dot === 0)
							{
								if(concave)
								{
									this.velocity.x = 0;
									this.velocity.y = 0;
								}
								else
								{
									const vec = [this.position.y - vertex.y, this.position.x - vertex.x];
									const dir = Math.atan2(...vec);

									this.position.x += Math.cos(dir) * Math.min(radius - sorted[0].nearest.d) + 0.1;
									this.position.y += Math.sin(dir) * Math.min(radius - sorted[0].nearest.d) + 0.1;

									console.assert(!isNaN(this.position.x), 'Position is NaN');
									console.assert(!isNaN(this.position.y), 'Position is NaN');
								}
							}
							else if(dot === 1)
							{
								const dir = Math.atan2(this.position.y - sorted[0].nearest.y, this.position.x - sorted[0].nearest.x);

								this.velocity.x += Math.cos(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);
								this.velocity.y += Math.sin(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);

								console.assert(!isNaN(this.velocity.x), 'Velicity is NaN');
								console.assert(!isNaN(this.velocity.y), 'Velicity is NaN');

							}
							else if(dot < 0)
							{
								if(concave)
								{
									const maxDist = radius / sinHalf;

									const vec = [this.position.y - vertex.y, this.position.x - vertex.x];
									const mag = Math.hypot(...vec);

									if(mag < maxDist)
									{
										if(sorted[0].front.isVisibleAroundCorner(this.position.x, this.position.y, sorted[1].front))
										{
											this.position.x = vertex.x + avg[1] * (maxDist - sorted[0].nearest.d) + 0.1;
											this.position.y = vertex.y - avg[0] * (maxDist - sorted[0].nearest.d) + 0.1;
											this.velocity.x = 0;
											this.velocity.y = 0;

											console.assert(!isNaN(this.position.x), 'Position is NaN');
											console.assert(!isNaN(this.position.y), 'Position is NaN');
										}
										else
										{
											console.log(`${sorted[0].front.linedef.index} occludes ${sorted[1].front.linedef.index}`)
										}
									}
								}
								else
								{
									const vec = [this.position.y - vertex.y, this.position.x - vertex.x];
									const dir = Math.atan2(...vec);

									this.position.x += Math.cos(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);
									this.position.y -= Math.sin(dir) * Math.min(radius - sorted[0].nearest.d, speedMag);

									console.assert(!isNaN(this.position.x), 'Position is NaN');
									console.assert(!isNaN(this.position.y), 'Position is NaN');
								}
							}
							else if(dot < 1)
							{
								this.velocity.x -= avg[1] * ((radius - sorted[0].nearest.d) / sinHalf) + 0.1;
								this.velocity.y += avg[0] * ((radius - sorted[0].nearest.d) / sinHalf) + 0.1;

								console.assert(!isNaN(this.velocity.x), 'Velicity is NaN');
								console.assert(!isNaN(this.velocity.y), 'Velicity is NaN');
							}
						}
					}
				}

				this.position.x += this.velocity.x;
				this.position.y -= this.velocity.y;
				this.position.z += this.velocity.z;

				console.assert(!isNaN(this.position.x), 'Position is NaN');
				console.assert(!isNaN(this.position.y), 'Position is NaN');
			}
		}

		if(this.plane && !this.noClip)
		{
			flipVertex(this.level.map, this.position, pos);

			this.plane.position.x = pos.x;
			this.plane.position.y = this.position.z + this.picture.height / 2;
			this.plane.position.z = pos.y;

			if(this.picture)
			{
				const offset = this.picture.yOffset + -this.picture.height + 8;

				if(this.flags.MISSILE)
				{
					this.plane.position.y += offset;
				}

			}
		}

		if(this.plane)
		{
			this.draw(camera);
		}

		this.age += delta;

		if(this.ignore > 0)
		{
			this.ignore -= delta;
		}
		else if (this.ignore < 0)
		{
			this.ignore = 0;
		}
	}

	async draw(camera)
	{
		const camAngle = this.plane.rotation.y = Math.PI + Math.atan2(
			this.plane.position.x - camera.position.x,
			this.plane.position.z - camera.position.z,
		);

		const thingAngle = (Math.PI/2) + -this.angle;
		const relAngle = (camAngle + thingAngle) % (Math.PI * 2);
		let roundedAngle = 1 + (4 + Math.round(relAngle / (Math.PI / 4))) % 8;

		if(roundedAngle <= 0)
		{
			roundedAngle += 8;
		}

		const currentFrame = this.frames[this.currentFrame];

		if(!currentFrame || currentFrame.sprite === 'TNT1')
		{
			this.plane.visible = false;
			return;
		}
		else
		{
			this.plane.visible = true;
		}

		if(!currentFrame.sprite)
		{
			return;
		}

		const sprite = this.level.wad.sprite(currentFrame.sprite);

		let name = currentFrame.sprite + currentFrame.frame;

		const frameId = -65 + String(currentFrame.frame).charCodeAt(0);

		if(sprite[frameId][0])
		{
			roundedAngle = 0;
			name += '0';
		}
		else if(sprite[frameId][roundedAngle])
		{
			name += roundedAngle;
		}
		else
		{
			console.warn(`Sprite ${name} missing rotation ${roundedAngle}`);
		}

		if(!decoding.has(name))
		{
			decoding.set(name, sprite[frameId][roundedAngle].picture.decode());
		}

		if(!decoded.has(name))
		{
			decoded.set(name, await decoding.get(name));
		}

		if(!textures.has(name))
		{
			const texture = textureLoader.load(decoded.get(name));

			texture.repeat.set(sprite[frameId][roundedAngle].flipped ? -1 : 1, 1);
			texture.wrapS      = THREE.RepeatWrapping;
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.magFilter  = THREE.NearestFilter;

			textures.set(name, texture);
		}

		const texture = textures.get(name);

		this.material.needsUpdate = true;
		this.material.map = texture;

		this.picture = sprite[frameId][roundedAngle].picture;
		this.plane.scale.set(this.picture.width, this.picture.height, 1);

	}

	runAction(actionName, ...args)
	{
		if(!actions[actionName])
		{
			if(!logged[actionName])
			{
				console.warn(`Action function ${actionName} not implented.`);
				logged[actionName] = true;
			}
		}
		else
		{
			actions[actionName](this, ...args);
		}
	}

	render(delta)
	{

	}

	async setup(camera)
	{
		this.position.x = this.start.x;
		this.position.y = this.start.y;
		this.position.z = this.sector.floorHeight;

		if(this.decDef)
		{
			Object.assign(this.properties, this.decDef.properties);
			Object.assign(this.states, this.decDef.states);
			Object.assign(this.flags, this.decDef.flags);

			this.hp = this.properties.HEALTH ?? this.hp;

			if(this.flags.ISMONSTER)
			{
				this.team = BadGuys;
			}
			else if(this.edNum > 0 && this.edNum <= 4)
			{
				this.team = GoodGuys;
			}
		}
		else
		{
			return;
			// this.states.Spawn = [{
			// 	sprite: thing.meta.sprite,
			// 	frame: 'A',
			// 	duration: -1,
			// 	keyword: undefined,
			// 	action: undefined,
			// }];
		}

		this.changeState('Spawn');

		const firstFrame = this.frames[0];

		if(firstFrame && firstFrame.sprite)
		{
			const sprite = this.level.wad.sprite(firstFrame.sprite);
			const picture = (sprite[0][0] || sprite[0][1]).picture;
			// const prefix = firstFrame.sprite + firstFrame.frame;
			// const picture = this.level.wad.picture(prefix + '0') || this.level.wad.picture(prefix + '1');
			const plane = new THREE.Mesh(this.geometry, this.material);

			await picture.decode();

			plane.userData.height = picture.height;
			this.plane = plane;
			this.picture = picture;

			await this.draw(camera);

			if(this.flags.NOGRAVITY)
			{
				this.flying = true;
				this.grounded = false;

				const room = this.level.rooms.get(this.sector.index);

				if(this.flags.ISMONSTER)
				{
					this.position.z = (room.floorHeight + room.ceilingHeight)/2 + -this.picture.height;
				}
				else
				{
					this.position.z = room.ceilingHeight + -this.picture.height;
				}

				this.start.z = this.position.z;
			}
		}
	}

	changeState(name)
	{
		if(this.currentState === name)
		{
			return;
		}

		if(!this.states[name])
		{
			console.warn('Invalid state change!');
			return;
		}

		this.frames = this.states[name];
		this.currentState = name;
		this.currentFrame = 0;

		this.frameTimer = (this.frames[this.currentFrame].duration || 1);
	}
}
