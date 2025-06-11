import * as THREE from 'three';
import { flipVertex, textureLoader } from './helpers';

const pos = {x: 0, y: 0};
const textures = {};
const decoded = {};

export class Particle
{
	constructor(frames, level, options = {})
	{
		this.frames = frames;
		this.level = level;

		this.frameDelay = options.delay || 48;
		this.frameTimer = 0;
		this.currentFrame = -1;

		this.material = new THREE.SpriteMaterial({});
		this.sprite = new THREE.Sprite(this.material);

		this.position = {x: options.x ?? 0, y: options.y ?? 0, z: options.z ??0};
		this.velocity = {x: 0, y: 0, z: 0};
		this.scale = options.scale || 1;
		this.gravity = options.gravity || 0.25;
		this.maxAge = options.maxAge || 1000;
		this.age = 0;

		this.originalWidth = 0;
		this.originalHeight = 0;
	}

	simulate(delta)
	{
		let update = false;

		if(this.frameTimer <= 0)
		{
			update = true;

			this.frameTimer = this.frameDelay;
			this.currentFrame++;

			if(this.currentFrame >= this.frames.length)
			{
				this.currentFrame = 0;
			}
		}

		this.position.x += this.velocity.x;
		this.position.y += this.velocity.y;
		this.position.z += this.velocity.z;

		flipVertex(this.level.map, this.position, pos)

		this.sprite.position.x = pos.x;
		this.sprite.position.z = pos.y;
		this.sprite.position.y = this.position.z;

		this.velocity.x *= 0.975;
		this.velocity.y *= 0.975;
		this.velocity.z += -this.gravity;

		update && this.draw();

		this.frameTimer -= delta;

		this.age += delta;

		if(this.age >= this.maxAge)
		{
			this.level.particles.delete(this);
			this.level.scene.remove(this.sprite);
			this.material.dispose();
		}
	}

	async draw()
	{
		const current = this.frames[this.currentFrame];

		if(!textures[current])
		{
			const picture = this.level.wad.picture(current);

			if(!decoded[current])
			{
				decoded[current] = await picture.decode();
			}

			const texture = textureLoader.load(decoded[current]);

			texture.userData.width = picture.width;
			texture.userData.height = picture.height;

			texture.magFilter = THREE.NearestFilter;

			textures[current] = texture;
		}

		const texture = textures[current];

		if(!this.originalWidth && !this.originalHeight)
		{
			this.originalWidth = texture.userData.width;
			this.originalHeight = texture.userData.height;
		}

		this.material.map = texture;
		this.material.needsUpdate = true;

		this.sprite.scale.set(
			this.scale * texture.userData.width / this.originalWidth,
			this.scale * texture.userData.height / this.originalHeight,
			1
		);
	}
}
