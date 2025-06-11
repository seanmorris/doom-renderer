import * as THREE from 'three';
import { flipVertex, playSample } from "../helpers";
import { HudElement } from "../HudElement";
import { Decorate } from '../Decorate';

import d1 from '../mobs/doom1-enemies.dec';
import d2 from '../mobs/doom2-enemies.dec';
import objects from '../mobs/objects.dec';
import decor from '../mobs/decor.dec';

import weaps from '../mobs/weaps.dec';

const decorate = new Decorate();

decorate.parse(objects);
decorate.parse(d1);
decorate.parse(d2);
decorate.parse(decor);
decorate.parse(weaps);

console.log(decorate);
console.log(decorate.resolve('FIST'));
console.log(decorate.resolve('PISTOL'));

const pos = {x: 0, y: 0};

const punch = {
	idle: [
		[ ['PUNGA0'], ],
	],
	fire: [
		[ ['PUNGB0'], ],
		[ ['PUNGC0'], ],
		[ ['PUNGD0'], ],
		[ ['PUNGD0'], ],
		[ ['PUNGD0'], 48, 'A_PUNCH_MELEE'],
		[ ['PUNGC0'], ],
		[ ['PUNGC0'], ],
		[ ['PUNGB0'], ],
		[ ['PUNGB0'], ],
		[ [], 144],
	],
};

const chainsaw = {
	icon: [
		[ ['CSAWA0'] ],
	],
	init: [
		[ ['SAWGC0'], 48, 'A_SAW_INIT'],
		[ ['SAWGC0'], ],
		[ ['SAWGD0'], ],
		[ ['SAWGD0'], ],
		[ ['SAWGC0'], ],
		[ ['SAWGC0'], ],
		[ ['SAWGD0'], ],
		[ ['SAWGD0'], ],
		[ ['SAWGC0'], ],
		[ ['SAWGC0'], ],
		[ ['SAWGD0'], ],
		[ ['SAWGD0'], ],
	],
	idle: [
		[ ['SAWGC0'], 48, 'A_SAW_IDLE'],
		[ ['SAWGC0'], ],
		[ ['SAWGD0'], ],
		[ ['SAWGD0'], ],
	],
	fire: [
		[ ['SAWGA0'], 64, 'A_SAW_MELEE'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGA0'], 48, 'A_SAW_MELEE_SILENT'],
		[ ['SAWGB0'], 48, 'A_SAW_MELEE_SILENT'],
	],
};

const pistol = {
	icon: [
		[ ['PISTA0'] ],
	],
	idle: [
		[ ['PISGA0'] ],
	],
	fire: [
		[ ['PISFA0', 'PISGB0'], 48, 'A_PISTOL_FIRE'],
		[ ['PISFA0', 'PISGC0'], ],
		[ ['PISFA0', 'PISGD0'], ],

		[ ['PISGE0'], ],
		[ ['PISGE0'], ],
		[ ['PISGE0'], ],
		[ ['PISGD0'], ],
		[ ['PISGC0'], ],
		[ ['PISGB0'], ],
	]
};

const shotgun = {
	icon: [
		[ ['SHOTA0'], ],
	],
	idle: [
		[ ['SHTGA0'] ],
	],
	fire: [
		[ ['SHTGA0'], ],
		[ ['SHTGA0', 'SHTFA0'], 48, 'A_SHOTGUN_FIRE'],
		[ ['SHTGA0', 'SHTFA0'], ],
		[ ['SHTGA0', 'SHTFB0'], ],
		[ ['SHTGA0', 'SHTFB0'], ],
		[ ['SHTFB0', 'SHTGB0'], ],
		[ ['SHTGB0'], ],
		[ ['SHTGC0'], ],
		[ ['SHTGC0'], ],
		[ ['SHTGD0'], ],
		[ ['SHTGD0'], ],
		[ ['SHTGD0'], ],
		[ ['SHTGD0'], ],
		[ ['SHTGC0'], ],
		[ ['SHTGC0'], ],
		[ ['SHTGB0'], ],
		[ ['SHTGB0'], ],
		[ ['SHTGA0'], ],
		[ ['SHTGA0'], ],
	],
};

const superShotGun = {
	icon: [
		[ ['SGN2A0'], ],
	],
	idle: [
		[ ['SHT2A0'], ],
	],
	fire: [
		[ ['SHT2A0'], 48, 'A_SUPERSHOTGUN_FIRE'],
		[ ['SHT2A0', 'SHT2I0'] ],
		[ ['SHT2A0', 'SHT2I0'] ],
		[ ['SHT2A0', 'SHT2J0'], 96 ],
		[ ['SHT2B0'], 96, ],
		[ ['SHT2C0'], 96, ],
		[ ['SHT2D0'], 96, ],
		[ ['SHT2D0'], 96, ],
		[ ['SHT2E0'], 96, 'A_SUPERSHOTGUN_RELOAD' ],
		[ ['SHT2F0'], 144 ],
		[ ['SHT2G0'], 192 ],
		[ ['SHT2H0'], 192 ],
	]
};

const chaingun = {
	icon: [
		[ ['MGUNA0'], ],
	],
	idle: [
		[ ['CHGGA0'], ],
	],
	fire: [
		[ ['CHGGA0'], ],
		[ ['CHGGA0', 'CHGFA0'], 48, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0'], ],
		[ ['CHGGB0', 'CHGFB0'], 48, 'A_CHAINGUN_FIRE'],
		[ ['CHGGA0'], ],
		[ ['CHGGA0', 'CHGFA0'], 48, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0'], ],
		[ ['CHGGB0', 'CHGFB0'], 48, 'A_CHAINGUN_FIRE'],
	],
	auto: [
		[ ['CHGGA0', 'CHGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0', 'CHGFB0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGA0', 'CHGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0', 'CHGFB0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGA0', 'CHGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0', 'CHGFB0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGA0', 'CHGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0', 'CHGFB0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGA0', 'CHGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0', 'CHGFB0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGA0', 'CHGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0', 'CHGFB0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGA0', 'CHGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['CHGGB0', 'CHGFB0'], 64, 'A_CHAINGUN_FIRE'],
	],
	post: [
		[ ['CHGGA0'], ],
		[ ['CHGGA0'], ],
		[ ['CHGGB0'], ],
		[ ['CHGGB0'], ],
		[ ['CHGGA0'], ],
		[ ['CHGGA0'], ],
		[ ['CHGGB0'], ],
		[ ['CHGGB0'], ],
		[ ['CHGGA0'], ],
		[ ['CHGGA0'], ],
		[ ['CHGGA0'], ],
		[ ['CHGGB0'], ],
		[ ['CHGGB0'], ],
		[ ['CHGGB0'], ],
	],
};

const rocketLauncher = {
	icon: [
		[ ['LAUNA0'], ],
	],
	idle: [
		[ ['MISGA0'], ],
	],
	fire: [
		[ ['MISGA0'], ],
		[ ['MISGA0', 'MISFA0'], 48, 'A_ROCKET_FIRE'],
		[ ['MISFA0', 'MISGB0'], ],
		[ ['MISGB0', 'MISFB0'], ],
		[ ['MISGB0', 'MISFC0'], ],
		[ ['MISGB0', 'MISFD0'], ],
		[ ['MISGB0'], ],
		[ ['MISGB0'], ],
		[ ['MISGB0'], ],
	],
};

const plasmaRifle = {
	icon: [
		[ ['PLASA0'], ],
	],
	idle: [
		[ ['PLSGA0'], ],
	],
	fire: [
		[ ['PLSGA0'], 96, 'A_PLASMA_FIRE' ],
		[ ['PLSFA0'], 96, ],
	],
	auto: [
		[ ['PLSFB0'], 48, 'A_PLASMA_FIRE' ],
		[ ['PLSFB0'], 32 ],
		[ ['PLSGA0'], 48, 'A_PLASMA_FIRE' ],
		[ ['PLSFA0'], 32 ],
	],
	post: [
		[ ['PLSGB0'], 480],
	]
};

const bfg9k = {
	icon: [
		[ ['BFUGA0'], ]
	],
	idle: [
		[ ['BFGGA0'], 192 ],
		[ ['BFGGB0'], 192 ],
	],
	fire: [
		[ ['BFGGB0'], 288, 'A_BFG9K_FIRE_START' ],
		[ ['BFGGC0'], 288 ],
		[ ['BFGGC0', 'BFGFA0'], 288 ],
		[ ['BFGGC0', 'BFGFB0'], 288 ],
		[ ['BFGGC0', 'BFGFA0'], 192, 'A_BFG9K_FIRE_LAUNCH'  ],
		[ ['BFGGC0'], 144 ],
	],
};

const minigun = {
	icon: [
		[ ['MNGNA0'], ],
	],
	idle: [
		[ ['MNGGA0'], ],
	],
	fire: [
		[ ['MNGGA0', 'MNGFA0'], 32, 'A_CHAINGUN_FIRE'],
		[ ['MNGGA0'], 64],
		[ ['MNGGB0', 'MNGFB0'], 32, 'A_CHAINGUN_FIRE'],
		[ ['MNGGB0'], 64],
		[ ['MNGGA0', 'MNGFA0'], 64, 'A_CHAINGUN_FIRE'],
		[ ['MNGGB0', 'MNGFB0'], 64, 'A_CHAINGUN_FIRE'],
	],
	auto: [
		[ ['MNGGA0', 'MNGFA0'], 32, 'A_CHAINGUN_FIRE'],
		[ ['MNGGB0', 'MNGFB0'], 32, 'A_CHAINGUN_FIRE'],
	],
	post: [
		[ ['MNGGA0'], ],
		[ ['MNGGB0'], ],
	]
};

const grenadeLauncher = {
	icon: [
		[ ['GLAUA0'], ],
	],
	idle: [
		[ ['GRLGA0'], ],
	],
	fire: [
		[ ['GRLGA0'], 48, 'A_GRENADE_FIRE'],
		[ ['GRLGA0'], ],
		[ ['GRLGB0'], ],
		[ ['GRLGB0'], ],
		[ ['GRLGB0', 'GRLFA0'], ],
		[ ['GRLGB0', 'GRLFA0'], ],
		[ ['GRLGB0', 'GRLFB0'], ],
		[ ['GRLGB0', 'GRLFB0'], ],
		[ ['GRLGB0', 'GRLFC0'], ],
		[ ['GRLGB0', 'GRLFC0'], ],
		[ ['GRLGB0', 'GRLFD0'], ],
		[ ['GRLGB0', 'GRLFD0'], ],
		[ ['GRLGB0'], ],
		[ ['GRLGB0'], ],
		[ ['GRLGB0'], ],
		[ ['GRLGB0'], ],
	],
};

const railgun = {
	icon: [
		[ ['RAILA0'], ]
	],
	idle: [
		[ ['RLGGA0'], ],
	],
	fire: [
		[ ['RLGGB0'], 48, 'A_RAILGUN_FIRE'],
		[ ['RLGGC0'], ],
		[ ['RLGGD0'], ],
		[ ['RLGGD0'], ],
		[ ['RLGGE0'], ],
		[ ['RLGGE0'], ],
		[ ['RLGGE0'], ],
		[ ['RLGGF0'], ],
		[ ['RLGGF0'], ],
		[ ['RLGGG0'], ],
		[ ['RLGGG0'], ],
		[ ['RLGGH0'], ],
		[ ['RLGGH0'], ],
		[ ['RLGGI0'], ],
		[ ['RLGGI0'], ],
		[ ['RLGGJ0'], ],
		[ ['RLGGJ0'], ],
		[ ['RLGGK0'], ],
		[ ['RLGGK0'], ],
		[ ['RLGGL0'], ],
		[ ['RLGGL0'], ],
	],
};

const bfg10k = {
	icon: [
		[ ['BFG2A0'], ],
	],
	idle: [
		[ ['BG2GA0'], 24, 'A_BFG10K_IDLE'],
		[ ['BG2GB0'], 24, ],
		[ ['BG2GC0'], 24, ],
		[ ['BG2GD0'], 24, ],
		[ ['BG2GE0'], 24, ],
		[ ['BG2GA0'], 24, ],
		[ ['BG2GB0'], 24, ],
		[ ['BG2GC0'], 24, ],
		[ ['BG2GD0'], 24, ],
		[ ['BG2GE0'], 24, ],
	],
	fire: [
		[ ['BG2GA0'], 24, 'A_BFG10K_FIRE_START'],
		[ ['BG2GC0'], ],
		[ ['BG2GD0'], ],
		[ ['BG2GE0'], ],
		[ ['BG2GA0'], ],
		[ ['BG2GB0'], ],
		[ ['BG2GC0'], ],
		[ ['BG2GD0'], ],
		[ ['BG2GE0'], ],
		[ ['BG2GE0'], ],
		[ ['BG2GF0'], ],
		[ ['BG2GG0'], ],
		[ ['BG2GH0'], ],
		[ ['BG2GI0'], ],
		[ ['BG2GJ0'], ],
		[ ['BG2GJ0'], ],
		[ ['BG2GK0'], ],
		[ ['BG2GK0'], ],
		[ ['BG2GL0'], ],
		[ ['BG2GL0'], ],
		[ ['BG2GM0'], ],
		[ ['BG2GM0'], ],
		[ ['BG2GN0'], ],
		[ ['BG2GN0'], ],
		[ ['BG2GO0'], 48, 'A_BFG10K_FIRE_LAUNCH'],
	],
	auto: [
		[ ['BG2GK0'], ],
		[ ['BG2GL0'], ],
		[ ['BG2GM0'], ],
		[ ['BG2GN0'], ],
		[ ['BG2GO0'], 48, 'A_BFG10K_FIRE_LAUNCH'],
	]
};

// const weaps = [chainsaw, pistol, shotgun, chaingun, rocketLauncher, plasmaRifle, bfg9k];
const weaps2 = [
	[ chainsaw, punch ],
	[ pistol ],
	[ superShotGun, shotgun ],
	[ chaingun, minigun ],
	[ rocketLauncher, grenadeLauncher ],
	[ plasmaRifle, railgun ],
	[ bfg9k, bfg10k ],
];

const A_PUNCH_MELEE = entity => {
	const wad = entity.level.wad;
	const hit = entity.shoot(64);
	if(hit.entities.size || hit.wall)
	{
		playSample(wad.sample('DSPUNCH'));
	}
	for(const [other, intersection] of hit.entities)
	{
		other.damage(entity, intersection);
	}
};
const A_SAW_INIT = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSSAWUP'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
};
const A_SAW_IDLE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSSAWIDL'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
};
const A_SAW_MELEE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSSAWFUL'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
	const hit = entity.shoot(64);
	for(const [other, intersection] of hit.entities)
	{
		other.damage(entity, intersection);
	}
};
const A_SAW_MELEE_SILENT = entity => {
	const hit = entity.shoot(64);
	for(const [other, intersection] of hit.entities)
	{
		other.damage(entity, intersection);
	}
};
const A_PISTOL_FIRE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSPISTOL'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
	const hit = entity.shoot(1280);
	for(const [other, intersection] of hit.entities)
	{
		other.damage(entity, intersection, 5);
	}
};
const A_SHOTGUN_FIRE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSSHOTGN'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
	const hitA = entity.shoot(1280);
	const hitB = entity.shoot(1280, {offset:  2.5 * (Math.PI / 180)});
	const hitC = entity.shoot(1280, {offset: -2.5 * (Math.PI / 180)});
	const hitD = entity.shoot(1280, {offset:  5.0 * (Math.PI / 180)});
	const hitE = entity.shoot(1280, {offset: -5.0 * (Math.PI / 180)});
	const entities = [...hitA.entities, ...hitB.entities, ...hitC.entities, ...hitD.entities, ...hitE.entities];
	for(const [other, intersection] of entities)
	{
		other.damage(entity, intersection, 10);
	}
};
const A_SUPERSHOTGUN_FIRE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSDSHTGN'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
	const hitA = entity.shoot(1280);
	const hitB = entity.shoot(1280, {offset:  2.5 * (Math.PI / 180)});
	const hitC = entity.shoot(1280, {offset: -2.5 * (Math.PI / 180)});
	const hitD = entity.shoot(1280, {offset:  5.0 * (Math.PI / 180)});
	const hitE = entity.shoot(1280, {offset: -5.0 * (Math.PI / 180)});

	const hitF = entity.shoot(1280);
	const hitG = entity.shoot(1280, {offset:  1.0 * (Math.PI / 180)});
	const hitH = entity.shoot(1280, {offset: -1.0 * (Math.PI / 180)});
	const hitI = entity.shoot(1280, {offset:  3.0 * (Math.PI / 180)});
	const hitJ = entity.shoot(1280, {offset: -3.0 * (Math.PI / 180)});

	const entities = [
		...hitA.entities, ...hitB.entities, ...hitC.entities, ...hitD.entities, ...hitE.entities,
		...hitF.entities, ...hitG.entities, ...hitH.entities, ...hitI.entities, ...hitJ.entities,
	];

	for(const [other, intersection] of entities)
	{
		other.damage(entity, intersection, 10);
	}
};
const A_SUPERSHOTGUN_RELOAD = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSSGCOCK'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
};
const A_CHAINGUN_FIRE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSPISTOL'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
	const hit = entity.shoot(1280);
	for(const [other, intersection] of hit.entities)
	{
		other.damage(entity, intersection, 5);
	}
};
const A_ROCKET_FIRE = async entity => {
	const wad = entity.level.wad;

	playSample(
		wad.sample('DSRLAUNC'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);

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
};
const A_PLASMA_FIRE = async entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSPLASMA'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
	const rocketDec = decorate.resolve('PLASMABALL');
	const rocket = await entity.level.spawnEntity(
		entity.position.x + entity.velocity.x,
		entity.position.y + entity.velocity.y,
		(entity.angle / Math.PI) * 180, rocketDec
	);

	rocket.owner = entity;

	rocket.position.z = entity.position.z + 32;

	rocket.velocity.x = 15 * Math.cos(entity.angle);
	rocket.velocity.y = 15 * -Math.sin(entity.angle);
	rocket.velocity.z = 15 * Math.tan(entity.pitch);
};
const A_BFG9K_FIRE_START = async entity => {
	const wad = entity.level.wad;
	playSample(wad.sample('DSBFG'));
};
const A_BFG9K_FIRE_LAUNCH = async entity => {
	const rocketDec = decorate.resolve('BFGBALL');
	const rocket = await entity.level.spawnEntity(
		entity.position.x + entity.velocity.x,
		entity.position.y + entity.velocity.y,
		(entity.angle / Math.PI) * 180, rocketDec
	);

	rocket.owner = entity;

	rocket.position.z = entity.position.z + 16;

	rocket.velocity.x = 3 * Math.cos(entity.angle);
	rocket.velocity.y = 3 * -Math.sin(entity.angle);
	rocket.velocity.z = 3 * Math.tan(entity.pitch);
};
const A_GRENADE_FIRE = async entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSGLAUNC'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
	const rocketDec = decorate.resolve('GRENADE');
	const rocket = await entity.level.spawnEntity(
		entity.position.x + entity.velocity.x,
		entity.position.y + entity.velocity.y,
		(entity.angle / Math.PI) * 180, rocketDec
	);

	rocket.owner = entity;

	rocket.position.z = entity.position.z + 32;

	rocket.velocity.x = 13 * Math.cos(entity.angle);
	rocket.velocity.y = 13 * -Math.sin(entity.angle);
	rocket.velocity.z = 13 * Math.tan(entity.pitch);
};
const A_RAILGUN_FIRE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('RAILGF1'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);

	const hit = entity.shoot(6400);

	for(const [other, intersection] of hit.entities)
	{
		if(other.flags.MISSILE)
		{
			other.changeState('Death');
			continue;
		}

		other.damage(entity, intersection, 100, 'rail');
	}

	const points = [];
	flipVertex(entity.level.map, entity.position, pos)
	points.push(new THREE.Vector3(pos.x, entity.position.z + 40, pos.y));

	flipVertex(entity.level.map, hit.end, pos)
	points.push(new THREE.Vector3(pos.x, hit.end.z, pos.y));

	const geometry = new THREE.BufferGeometry().setFromPoints(points);

	const width = 8;

	const material = new THREE.LineBasicMaterial({
		color: 0xFFFFFF,
		linewidth: width,
		// transparent: true,
		// opacity: 0.5,
	});

	const line = new THREE.Line(geometry, material);

	line.userData.age = 0;
	line.userData.maxAge = 750;
	line.userData.originalWidth = width;

	entity.level.scene.add(line);
	entity.level.lines.add(line);
};
const A_BFG10K_IDLE = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DS10KIDL'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
};
const A_BFG10K_FIRE_START = entity => {
	const wad = entity.level.wad;
	playSample(
		wad.sample('DSBFG10K'),
		entity.position.x,
		entity.position.y,
		{entity, noStereo: true},
	);
};
const A_BFG10K_FIRE_LAUNCH = async entity => {
	const wad = entity.level.wad;
	const rocketDec = decorate.resolve('BFGBALL');
	const rocket = await entity.level.spawnEntity(
		entity.position.x + entity.velocity.x,
		entity.position.y + entity.velocity.y,
		(entity.angle / Math.PI) * 180, rocketDec
	);

	rocket.owner = entity;

	rocket.position.z = entity.position.z + 16;

	rocket.velocity.x = 3 * Math.cos(entity.angle);
	rocket.velocity.y = 3 * -Math.sin(entity.angle);
	rocket.velocity.z = 3 * Math.tan(entity.pitch);
};

export const actions = {
	A_PUNCH_MELEE,
	A_SAW_INIT,
	A_SAW_IDLE,
	A_SAW_MELEE,
	A_SAW_MELEE_SILENT,

	A_PISTOL_FIRE,
	A_SHOTGUN_FIRE,
	A_SUPERSHOTGUN_FIRE,
	A_SUPERSHOTGUN_RELOAD,
	A_CHAINGUN_FIRE,

	A_ROCKET_FIRE,
	A_PLASMA_FIRE,
	A_BFG9K_FIRE_START,
	A_BFG9K_FIRE_LAUNCH,

	A_GRENADE_FIRE,
	A_RAILGUN_FIRE,
	A_BFG10K_IDLE,
	A_BFG10K_FIRE_START,
	A_BFG10K_FIRE_LAUNCH,
};

export class Weapon
{
	constructor(wad, entity, {scale} = {})
	{
		this.currentBank = 2;
		this.currentWeap = 0;
		this.weaponStates = pistol;

		this.wad = wad;
		this.element = new HudElement(320, 200, {scale, xScreen: 0.5, yScreen: 1, depth: 900, xOffset: -8});
		this.entity = entity;

		this.age = 0;
		this.scale = scale;
		this.currentFrame = 0;
		this.frameTimer = 0;
		this.frameDelay = 0;

		this.states = this.weaponStates.init ?? [];

		this.drawFrame();

		this.state = 'init';
		this.refire = false;

		this.switchTo = null;
		this.lowered = false;
		this.raised = false;
	}

	switchWeap(bankNumber)
	{
		if(bankNumber === 0)
		{
			this.currentBank = bankNumber;
			this.currentWeap = 0;
			this.switchTo = {};
			this.lowered = true;
			return;
		}

		if(this.currentBank !== bankNumber)
		{
			this.currentBank = bankNumber;
			this.currentWeap = 0;
		}
		else if(this.switchTo || !this.raised)
		{
			return;
		}

		bankNumber--;

		if(this.currentWeap >= weaps2[bankNumber].length)
		{
			this.currentWeap = 0;
		}

		const switchTo = weaps2[bankNumber][this.currentWeap];

		if(this.weaponStates !== switchTo)
		{
			this.switchTo = switchTo;
			this.lowered = true;
		}

		this.currentWeap++;
	}

	simulate(delta)
	{
		this.age += delta;
		this.frameTimer -= delta;

		if(this.lowered)
		{
			this.raised = false;
			if(this.element.yOffset > -200 * this.scale)
			{
				this.element.yOffset -= this.scale * 8;
			}
			else
			{
				this.element.yOffset = -200 * this.scale;

				if(this.switchTo)
				{
					this.weaponStates = this.switchTo;
					this.states = this.weaponStates.init || this.weaponStates.idle || [];
					this.currentFrame = 0;
					this.switchTo = null;
					this.lowered = false;
					this.drawFrame();
				}
			}
		}
		else if(this.currentBank)
		{
			if(this.element.yOffset < 0)
			{
				this.element.yOffset += this.scale * 8;
			}
			else
			{
				this.element.yOffset = 0;
				this.raised = true;
			}
		}

		if(this.raised)
		{
			if(this.state === 'idle')
			{
				if(this.entity.isFiring)
				{
					this.states = this.weaponStates.fire ?? this.states;
					this.currentFrame = 0;
					this.state = 'fire';
					this.frameTimer = 0;
				}
				else
				{
					this.refire = false;
				}
			}
		}

		if(this.frameTimer <= 0)
		{
			if(this.currentFrame >= this.states.length)
			{
				this.currentFrame = 0;

				if(this.raised)
				{
					if(this.entity.isFiring)
					{
						this.refire = true;

						if(this.weaponStates.auto && this.state === 'fire')
						{
							this.states = this.weaponStates.auto ?? this.states;
							this.state = 'auto';
						}
					}
					else if(this.state === 'fire' || this.state === 'auto')
					{
						if(this.weaponStates.post)
						{
							this.states = this.weaponStates.post ?? this.states;
							this.state = 'post';
						}
						else
						{
							this.states = this.weaponStates.idle ?? [];
							this.state = 'idle';
						}
					}
					else
					{
						this.states = this.weaponStates.idle ?? [];
						this.state = 'idle';
					}
				}
				else if(this.currentBank)
				{
					this.states = this.weaponStates.idle ?? [];
					this.state = 'init';
				}
			}

			this.drawFrame();

			const [frame, delay, action, ...args] = this.states[this.currentFrame] || [];

			this.frameTimer = delay ?? 48;

			if(action)
			{
				this.entity.runAction(action, ...args);
			}


			// if(actions[action])
			// {
			// 	actions[action](this.entity, this, ...args);
			// }

			this.currentFrame++;
		}

		if(this.entity.keys['Digit0']) this.switchWeap(0);
		if(this.entity.keys['Digit1']) this.switchWeap(1);
		if(this.entity.keys['Digit2']) this.switchWeap(2);
		if(this.entity.keys['Digit3']) this.switchWeap(3);
		if(this.entity.keys['Digit4']) this.switchWeap(4);
		if(this.entity.keys['Digit5']) this.switchWeap(5);
		if(this.entity.keys['Digit6']) this.switchWeap(6);
		if(this.entity.keys['Digit7']) this.switchWeap(7);
	}

	async drawFrame()
	{
		if(!this.states[this.currentFrame])
		{
			this.element.clear();
			return;
		}

		const [frame] = this.states[this.currentFrame];

		let height = 0;

		const decoded = await Promise.all(frame.map(async name => {
			const picture = this.wad.picture(name);
			height = Math.max(height, picture.height);
			const url = await picture.decode();
			return {picture, url};
		}));

		this.element.clear();

		for(const {picture, url} of decoded)
		{
			this.element.draw(
				url,
				-picture.xOffset,
				-picture.yOffset + 32,
				picture.width,
				picture.height
			);
		}
	}
}
