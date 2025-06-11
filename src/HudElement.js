import * as THREE from 'three';

const images = new Map;

const loadImage = src => {
	if(images.has(src))
	{
		return images.get(src);
	}

	let accept;

	const promise = new Promise(a => accept = a);
	const image = new Image;

	image.addEventListener('load', () => accept(image));
	image.src = src;
	images.set(src, image);

	return promise;
};

const ndc = new THREE.Vector3(0,0,0);

export class HudElement
{
	constructor(width, height, {xScreen, yScreen, xOffset, yOffset, padding, scale, depth} = {})
	{
		this.canvas = new window.OffscreenCanvas(width, height);

		this.context = this.canvas.getContext('2d');

		this.texture = new THREE.CanvasTexture(this.canvas);

		this.width   = width;
		this.height  = height;

		this.xScreen = xScreen ?? 0.5;
		this.yScreen = yScreen ?? 0.5;

		this.xOffset = xOffset ?? 0;
		this.yOffset = yOffset ?? 0;

		this.padding = padding ?? 0
		this.scale = scale ?? 1;

		this.material = new THREE.SpriteMaterial({
			sizeAttenuation: false,
			depthTest: false,
			map: this.texture,
		});

		this.sprite = new THREE.Sprite(this.material);

		this.sprite.renderOrder = depth ?? 0;

		this.width  = width;
		this.height = height;

		this.texture.magFilter = THREE.NearestFilter;
		this.texture.minFilter = THREE.NearestFilter;
		this.texture.colorSpace = THREE.SRGBColorSpace;

		this.age = 0;
	}

	simulate(delta)
	{
		this.age += delta;
	}

	async draw(url, x, y)
	{
		const image = await loadImage(url);
		this.context.drawImage(image, x, y);
		this.texture.needsUpdate = true;
	}

	clear()
	{
		this.context.clearRect(0, 0, this.width, this.height);
		this.texture.needsUpdate = true;
	}

	render(camera)
	{
		const sw = this.scale * this.width;
		const sh = this.scale * this.height;

		const screenScale = window.innerHeight * (1 / ( 2 * Math.tan((camera.fov * (Math.PI/180))/2) ));

		const left   = this.padding * 2;
		const bottom = this.padding * 2;
		const right  = window.innerWidth  * 2  + -this.padding * 2 + -sw * 2;
		const top    = window.innerHeight * 2  + -this.padding * 1 + -sh * 2;

		const lr = this.xScreen;
		const tb = this.yScreen;

		const xScreen = left * (1 - lr) + right  * lr;
		const yScreen = top  * (1 - tb) + bottom * tb;

		ndc.set(
			((sw + xScreen + this.xOffset * 2) / window.innerWidth)  - 1,
			((sh + yScreen + this.yOffset * 2) / window.innerHeight) - 1,
			0,
		);

		this.sprite.scale.set(
			sw / screenScale,
			sh / screenScale,
			1
		);

		ndc.unproject(camera);
		this.sprite.position.copy(ndc);
	}
}